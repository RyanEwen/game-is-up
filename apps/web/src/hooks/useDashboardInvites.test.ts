/**
 * Hook test for the Discord invite flow on TanStack Query: members load per active server, a send
 * goes out as one mutation and reports its result, and a failed load shows a notice that a retry
 * clears. `fetch` is stubbed; each test gets a fresh query client.
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
let useDashboardInvites: typeof import('./useDashboardInvites').useDashboardInvites

before(async () => {
  dom = installJsdomGlobals({ url: 'http://localhost/network' })
  React = await import('react')
  const testingLibrary = await import('@testing-library/react')
  renderHook = testingLibrary.renderHook
  waitFor = testingLibrary.waitFor
  act = testingLibrary.act
  cleanup = testingLibrary.cleanup
  QueryClientProvider = (await import('@tanstack/react-query'))
    .QueryClientProvider
  useDashboardInvites = (await import('./useDashboardInvites'))
    .useDashboardInvites
})

afterEach(() => {
  cleanup()
  clearTestQueryClients()
  mock.restoreAll()
})

after(() => {
  dom.window.close()
})

const server = {
  id: 'server-1',
  name: 'Late Queue',
  selected: true,
} as Parameters<
  typeof useDashboardInvites
>[0]['availableDiscoveryServers'][number]

const member = {
  id: 'discord-member-1',
  username: 'raider',
  displayName: 'Raider',
  profileDisplayName: 'Raider',
  avatarUrl: null,
  isAppUser: false,
  appUserId: null,
  appDisplayName: null,
  appHandle: null,
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Render the hook signed in, with one selected server, recording action notices. */
async function renderInvites() {
  const notices: unknown[] = []
  const client = await createTestQueryClient()
  const wrapper = ({ children }: { children: import('react').ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
  const view = renderHook(
    () =>
      useDashboardInvites({
        session: null,
        isSignedIn: true,
        availableDiscoveryServers: [server],
        setActionNotice: (notice) => {
          notices.push(notice)
        },
      }),
    { wrapper },
  )
  return { view, notices }
}

test('members load for the active server, and a send posts the selection once', async () => {
  const calls: { url: string; method: string; body: string | null }[] = []
  mock.method(
    globalThis,
    'fetch',
    async (url: string, init: RequestInit = {}) => {
      calls.push({
        url: String(url),
        method: init.method ?? 'GET',
        body: (init.body as string) ?? null,
      })
      if (String(url).endsWith('/members')) {
        return json(200, {
          serverId: 'server-1',
          serverName: 'Late Queue',
          members: [member],
        })
      }
      return json(200, {
        serverId: 'server-1',
        serverName: 'Late Queue',
        sentCount: 1,
        failedCount: 0,
        results: [
          {
            memberId: member.id,
            displayName: 'Raider',
            username: 'raider',
            status: 'sent',
            error: null,
          },
        ],
      })
    },
  )

  const { view, notices } = await renderInvites()
  await waitFor(() =>
    assert.equal(
      view.result.current.inviteOverviewProps.inviteMembers.length,
      1,
    ),
  )
  assert.equal(
    view.result.current.inviteOverviewProps.inviteMembersLoading,
    false,
  )

  act(() =>
    view.result.current.inviteOverviewProps.onToggleInviteUser(member.id),
  )
  await act(() => view.result.current.inviteOverviewProps.onSendBotInvites())

  const sends = calls.filter((call) => call.method === 'POST')
  assert.equal(sends.length, 1)
  assert.match(sends[0]!.url, /\/api\/discord-servers\/me\/server-1\/invites$/)
  assert.deepEqual(JSON.parse(sends[0]!.body!).memberIds, [member.id])
  assert.equal(
    view.result.current.inviteOverviewProps.inviteSendSummary?.sentCount,
    1,
  )
  assert.deepEqual(notices.at(-1), {
    tone: 'success',
    message: 'Sent 1 invite from Late Queue.',
  })
})

test('a failed members load shows the server message, and a retry clears it', async () => {
  let fail = true
  mock.method(globalThis, 'fetch', async () =>
    fail
      ? json(503, { error: 'Discord is not answering right now.' })
      : json(200, {
          serverId: 'server-1',
          serverName: 'Late Queue',
          members: [member],
        }),
  )

  const { view } = await renderInvites()
  await waitFor(() =>
    assert.deepEqual(
      view.result.current.inviteOverviewProps.inviteMembersNotice,
      {
        tone: 'danger',
        message: 'Discord is not answering right now.',
      },
    ),
  )

  fail = false
  act(() => view.result.current.inviteOverviewProps.onRetryInviteMembers())
  await waitFor(() =>
    assert.equal(
      view.result.current.inviteOverviewProps.inviteMembers.length,
      1,
    ),
  )
  assert.equal(
    view.result.current.inviteOverviewProps.inviteMembersNotice,
    null,
  )
})

test('a picked server that is deselected falls back to the first, and returns when reselected', async () => {
  mock.method(globalThis, 'fetch', async () =>
    json(200, { serverId: 'x', serverName: 'x', members: [] }),
  )
  const other = { ...server, id: 'server-2', name: 'Night Shift' }
  const client = await createTestQueryClient()
  const wrapper = ({ children }: { children: import('react').ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
  const view = renderHook(
    ({ servers }: { servers: (typeof server)[] }) =>
      useDashboardInvites({
        session: null,
        isSignedIn: true,
        availableDiscoveryServers: servers,
        setActionNotice: () => {},
      }),
    { wrapper, initialProps: { servers: [server, other] } },
  )
  const activeId = () =>
    view.result.current.inviteOverviewProps.activeInviteServer?.id ?? null

  assert.equal(activeId(), 'server-1', 'the first selected server by default')
  act(() =>
    view.result.current.inviteOverviewProps.onSelectInviteServer('server-2'),
  )
  assert.equal(activeId(), 'server-2')

  view.rerender({ servers: [server, { ...other, selected: false }] })
  assert.equal(
    activeId(),
    'server-1',
    'falls back while the pick is not selected',
  )

  view.rerender({ servers: [server, other] })
  assert.equal(activeId(), 'server-2', 'the pick returns when reselected')
})
