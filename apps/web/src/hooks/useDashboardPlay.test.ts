/**
 * Hook test for call-to-play actions on TanStack Query: a response posts once, marks its row
 * pending while in flight, and refreshes the dashboard; a server error becomes the notice; the
 * admin delete refuses non-admins without a request; and mutes load and update after a mute.
 * `fetch` is stubbed; each test gets a fresh query client.
 */
import assert from 'node:assert/strict'
import test, { after, afterEach, before, mock } from 'node:test'
import type { JSDOM } from 'jsdom'
import { installJsdomGlobals } from '../test-utils/jsdom'
import {
  clearTestQueryClients,
  createTestQueryClient,
} from '../test-utils/queryClient'

let dom: JSDOM
let React: typeof import('react')
let renderHook: typeof import('@testing-library/react').renderHook
let waitFor: typeof import('@testing-library/react').waitFor
let act: typeof import('@testing-library/react').act
let cleanup: typeof import('@testing-library/react').cleanup
let QueryClientProvider: typeof import('@tanstack/react-query').QueryClientProvider
let MemoryRouter: typeof import('react-router-dom').MemoryRouter
let useDashboardPlay: typeof import('./useDashboardPlay').useDashboardPlay

before(async () => {
  dom = installJsdomGlobals({ url: 'http://localhost/play' })
  React = await import('react')
  const testingLibrary = await import('@testing-library/react')
  renderHook = testingLibrary.renderHook
  waitFor = testingLibrary.waitFor
  act = testingLibrary.act
  cleanup = testingLibrary.cleanup
  QueryClientProvider = (await import('@tanstack/react-query'))
    .QueryClientProvider
  MemoryRouter = (await import('react-router-dom')).MemoryRouter
  useDashboardPlay = (await import('./useDashboardPlay')).useDashboardPlay
})

afterEach(() => {
  cleanup()
  clearTestQueryClients()
  mock.restoreAll()
})

after(() => {
  dom.window.close()
})

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type Call = { url: string; method: string; body: string | null }

/** Stub fetch: GETs for mutes and voice channels, then whatever `respond` answers for writes. */
function stubFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  mock.method(
    globalThis,
    'fetch',
    async (url: string, init: RequestInit = {}) => {
      const call = {
        url: String(url),
        method: init.method ?? 'GET',
        body: (init.body as string) ?? null,
      }
      calls.push(call)
      if (
        call.method === 'GET' &&
        call.url.endsWith('/api/play-intents/mutes')
      ) {
        return json(200, {
          mutes: mutedIds.map((mutedUserId) => ({
            mutedUserId,
            mutedUserDisplayName: 'Muted',
            mutedUserHandle: 'muted',
            mutedUserAvatarUrl: null,
          })),
        })
      }
      if (call.method === 'GET' && call.url.endsWith('/voice-channels')) {
        return json(200, { channels: [] })
      }
      return respond(call)
    },
  )
  return calls
}

let mutedIds: string[] = []

/** Render the hook signed in, recording notices and dashboard refreshes. */
async function renderPlay({ isAdmin = false } = {}) {
  const notices: unknown[] = []
  let refreshes = 0
  const client = await createTestQueryClient()
  const wrapper = ({ children }: { children: import('react').ReactNode }) =>
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/play'] },
      React.createElement(QueryClientProvider, { client }, children),
    )
  const view = renderHook(
    () =>
      useDashboardPlay({
        isSignedIn: true,
        isAdmin,
        activePlayIntent: null,
        libraryEntries: [],
        discoveryPeople: [],
        playIntentFriendOptions: [],
        friendsLists: [],
        playIntentDiscordServerOptions: [],
        playIntentPreviews: [],
        refreshAfterChange: async () => {
          refreshes += 1
        },
        setPlayIntentNotice: (notice) => {
          notices.push(typeof notice === 'function' ? notice(null) : notice)
        },
      }),
    { wrapper },
  )
  return { view, notices, refreshes: () => refreshes }
}

test('a response posts once, marks its row pending while in flight, and refreshes', async () => {
  mutedIds = []
  let release: () => void = () => {}
  const calls = stubFetch(
    (call) =>
      new Promise((resolve) => {
        release = () =>
          resolve(
            json(200, {
              responseChoice: 'interested',
              message: 'The creator has been notified.',
            }),
          )
        void call
      }),
  )

  const { view, notices, refreshes } = await renderPlay()
  let done: Promise<boolean> = Promise.resolve(false)
  act(() => {
    done = view.result.current.playViewProps.onRespondToPlayIntent(
      'intent-1',
      'interested',
    )
  })
  await waitFor(() =>
    assert.equal(
      view.result.current.playViewProps.playIntentResponsePendingIntentId,
      'intent-1',
    ),
  )

  release()
  assert.equal(await act(() => done), true)
  await waitFor(() =>
    assert.equal(
      view.result.current.playViewProps.playIntentResponsePendingIntentId,
      null,
    ),
  )
  const posts = calls.filter((call) => call.method === 'POST')
  assert.equal(posts.length, 1)
  assert.match(posts[0]!.url, /\/api\/play-intents\/intent-1\/respond$/)
  assert.deepEqual(JSON.parse(posts[0]!.body!), { choice: 'interested' })
  assert.equal((notices.at(-1) as { tone: string }).tone, 'success')
  assert.equal(refreshes(), 1)
})

test('a failed action shows the server message and does not refresh', async () => {
  mutedIds = []
  stubFetch(() => json(409, { error: 'This call to play has ended.' }))
  const { view, notices, refreshes } = await renderPlay()

  const started = await act(() =>
    view.result.current.playViewProps.onStartPlayIntentNow('intent-2'),
  )

  assert.equal(started, false)
  assert.deepEqual(notices.at(-1), {
    tone: 'danger',
    message: 'This call to play has ended.',
  })
  assert.equal(refreshes(), 0)
})

test('the admin delete refuses non-admins without sending a request', async () => {
  mutedIds = []
  const calls = stubFetch(() => json(204, null))
  const { view, notices } = await renderPlay({ isAdmin: false })

  const deleted = await act(() =>
    view.result.current.playViewProps.onDeletePlayIntent('intent-3'),
  )

  assert.equal(deleted, false)
  assert.equal(calls.filter((call) => call.method === 'DELETE').length, 0)
  assert.match((notices.at(-1) as { message: string }).message, /Admin access/)
})

test('mutes load, and a mute refetches them and refreshes the dashboard', async () => {
  mutedIds = ['11111111-1111-4111-8111-111111111111']
  const calls = stubFetch((call) => {
    if (call.method === 'PUT')
      mutedIds = [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ]
    return new Response(null, { status: 204 })
  })
  const { view, refreshes } = await renderPlay()

  await waitFor(() =>
    assert.deepEqual(
      [...view.result.current.playViewProps.mutedPlayIntentUserIds],
      ['11111111-1111-4111-8111-111111111111'],
    ),
  )

  await act(() =>
    view.result.current.playViewProps.onMutePlayIntentUser(
      '22222222-2222-4222-8222-222222222222',
    ),
  )

  await waitFor(() =>
    assert.deepEqual(
      [...view.result.current.playViewProps.mutedPlayIntentUserIds].sort(),
      [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ],
    ),
  )
  assert.ok(
    calls.some(
      (call) =>
        call.method === 'PUT' &&
        call.url.endsWith('/mutes/22222222-2222-4222-8222-222222222222'),
    ),
  )
  assert.equal(refreshes(), 1)
})
