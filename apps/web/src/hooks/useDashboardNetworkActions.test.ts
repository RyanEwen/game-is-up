/**
 * Hook test for the network actions on TanStack Query: adding a friend posts once, marks that
 * person pending while in flight and refreshes afterwards; a failed friends-list save shows the
 * server's message without a refresh; and choosing a Discord server sends the choice.
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
let useDashboardNetworkActions: typeof import('./useDashboardNetworkActions').useDashboardNetworkActions

before(async () => {
  dom = installJsdomGlobals()
  React = await import('react')
  const testingLibrary = await import('@testing-library/react')
  renderHook = testingLibrary.renderHook
  waitFor = testingLibrary.waitFor
  act = testingLibrary.act
  cleanup = testingLibrary.cleanup
  QueryClientProvider = (await import('@tanstack/react-query'))
    .QueryClientProvider
  useDashboardNetworkActions = (await import('./useDashboardNetworkActions'))
    .useDashboardNetworkActions
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

function stubFetch(answer: (call: Call) => Response | Promise<Response>) {
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
      return answer(call)
    },
  )
  return calls
}

async function renderActions() {
  const notices: unknown[] = []
  let refreshes = 0
  const client = await createTestQueryClient()
  const wrapper = ({ children }: { children: import('react').ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
  const view = renderHook(
    () =>
      useDashboardNetworkActions({
        refreshAfterChange: async () => {
          refreshes += 1
        },
        setActionNotice: (notice) => {
          notices.push(typeof notice === 'function' ? notice(null) : notice)
        },
      }),
    { wrapper },
  )
  return { view, notices, refreshes: () => refreshes }
}

const person = {
  id: 'person-1',
  displayName: 'Mira',
  friendEligible: true,
} as Parameters<
  ReturnType<
    typeof import('./useDashboardNetworkActions').useDashboardNetworkActions
  >['handleToggleFriend']
>[0]

test('adding a friend posts once, marks them pending, then refreshes', async () => {
  let release: () => void = () => {}
  const calls = stubFetch(
    () =>
      new Promise((resolve) => {
        release = () => resolve(new Response(null, { status: 204 }))
      }),
  )
  const { view, notices, refreshes } = await renderActions()

  let done: Promise<void> = Promise.resolve()
  act(() => {
    done = view.result.current.handleToggleFriend(person)
  })
  await waitFor(() =>
    assert.equal(view.result.current.friendPendingId, 'person-1'),
  )

  release()
  await act(() => done)
  await waitFor(() => assert.equal(view.result.current.friendPendingId, null))
  assert.deepEqual(
    calls.map((call) => `${call.method} ${new URL(call.url).pathname}`),
    ['POST /api/friends/person-1'],
  )
  assert.deepEqual(notices.at(-1), {
    tone: 'success',
    message: 'Mira was added to your friends list.',
  })
  assert.equal(refreshes(), 1)
})

test('a failed friends-list save shows the server message and does not refresh', async () => {
  stubFetch(() => json(400, { error: 'That name is already used.' }))
  const { view, notices, refreshes } = await renderActions()

  const saved = await act(() =>
    view.result.current.handleSaveFriendsList({
      name: 'Raid',
      friendUserIds: [],
    }),
  )

  assert.equal(saved, false)
  assert.deepEqual(notices.at(-1), {
    tone: 'danger',
    message: 'That name is already used.',
  })
  assert.equal(refreshes(), 0)
})

test('choosing a Discord server sends the choice and refreshes', async () => {
  const calls = stubFetch(() => json(200, { servers: [] }))
  const { view, refreshes } = await renderActions()

  await act(() =>
    view.result.current.handleToggleDiscordServer('server-9', true),
  )

  assert.equal(calls.length, 1)
  assert.match(calls[0]!.url, /\/api\/discord-servers\/me\/server-9$/)
  assert.deepEqual(JSON.parse(calls[0]!.body!), { selected: true })
  assert.equal(refreshes(), 1)
})
