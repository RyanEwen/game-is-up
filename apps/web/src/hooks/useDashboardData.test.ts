/**
 * Hook test for the dashboard's data on TanStack Query: what loads for visitors, signed-in users
 * and admins; the first load showing nothing until everything has answered; a refresh refetching
 * the same set; a failed always-loaded request becoming the dashboard error; and a saved profile
 * patched into the cache. `fetch` is stubbed per path.
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
let useDashboardData: typeof import('./useDashboardData').useDashboardData

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
  useDashboardData = (await import('./useDashboardData')).useDashboardData
})

afterEach(() => {
  cleanup()
  clearTestQueryClients()
  mock.restoreAll()
})

after(() => {
  dom.window.close()
})

const now = '2026-11-19T00:00:00.000Z'
const user = {
  id: '44444444-4444-4444-8444-444444444444',
  handle: 'raider',
  displayName: 'Raider',
  avatarUrl: null,
  timezoneId: 'America/Toronto',
  usualAvailability: null,
  discordAutoPromptPlayIntent: true,
  isAdmin: false,
  authProvider: 'discord',
}

/** Responses by path; a function lets a test hold one back or change it later. */
type Routes = Record<string, () => Response | Promise<Response>>

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function baseRoutes(session: {
  authenticated: boolean
  user: unknown
}): Routes {
  return {
    '/api/health': () =>
      json(200, {
        status: 'ok',
        service: 'api',
        timestamp: now,
        version: '0.1.0',
      }),
    '/api/auth/providers': () => json(200, { providers: [] }),
    '/api/auth/me': () =>
      json(200, {
        ...session,
        discordGraph: null,
        inviteAttribution: null,
        connectedProviders: [],
      }),
    '/api/discovery/feed': () =>
      json(200, { generatedAt: now, games: [], people: [] }),
    '/api/play-intents/feed': () =>
      json(200, { generatedAt: now, intents: [] }),
    '/api/library/me': () =>
      json(200, { usualAvailability: null, entries: [] }),
    '/api/play-intents/me': () => json(200, { activeIntent: null }),
    '/api/friends-lists': () => json(200, { lists: [] }),
    '/api/discord-servers/me': () => json(200, { servers: [] }),
    '/api/debug/admin': () => json(500, {}),
  }
}

/** Stub fetch from a route table, recording the paths requested. */
function stubFetch(routes: Routes) {
  const paths: string[] = []
  mock.method(globalThis, 'fetch', async (url: string) => {
    const path = new URL(String(url)).pathname
    paths.push(path)
    const route = routes[path]
    return route ? route() : json(404, {})
  })
  return paths
}

async function renderData() {
  const client = await createTestQueryClient()
  const wrapper = ({ children }: { children: import('react').ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
  return renderHook(() => useDashboardData(), { wrapper })
}

const phaseOne = [
  '/api/auth/me',
  '/api/auth/providers',
  '/api/discovery/feed',
  '/api/health',
  '/api/play-intents/feed',
]
const signedInOnly = [
  '/api/discord-servers/me',
  '/api/friends-lists',
  '/api/library/me',
  '/api/play-intents/me',
]

test('a visitor loads only the public resources, and state fills once they answer', async () => {
  const paths = stubFetch(baseRoutes({ authenticated: false, user: null }))
  const view = await renderData()

  await waitFor(() => assert.ok(view.result.current.state.session))
  assert.deepEqual([...new Set(paths)].sort(), phaseOne)
  assert.equal(view.result.current.state.library, null)
  assert.equal(view.result.current.state.error, null)
})

test('a signed-in user also loads their own resources, and the first load waits for them', async () => {
  let releaseLibrary: () => void = () => {}
  const routes = baseRoutes({ authenticated: true, user })
  routes['/api/library/me'] = () =>
    new Promise((resolve) => {
      releaseLibrary = () =>
        resolve(json(200, { usualAvailability: null, entries: [] }))
    })
  const paths = stubFetch(routes)
  const view = await renderData()

  await waitFor(() => assert.ok(paths.includes('/api/library/me')))
  assert.equal(
    view.result.current.state.session,
    null,
    'nothing shows while the library is still loading',
  )

  releaseLibrary()
  await waitFor(() => assert.ok(view.result.current.state.library))
  const loaded = view.result.current.state
  assert.ok(loaded.session?.authenticated)
  assert.deepEqual(
    [...new Set(paths)].sort(),
    [...phaseOne, ...signedInOnly].sort(),
  )
  assert.ok(
    !paths.includes('/api/debug/admin'),
    'only admins load the debug snapshot',
  )
})

test('a refresh refetches the same set, and a profile save patches the cache', async () => {
  const paths = stubFetch(baseRoutes({ authenticated: true, user }))
  const view = await renderData()
  await waitFor(() => assert.ok(view.result.current.state.library))

  paths.length = 0
  await act(() => view.result.current.refreshDashboard())
  assert.deepEqual(
    [...new Set(paths)].sort(),
    [...phaseOne, ...signedInOnly].sort(),
  )

  act(() =>
    view.result.current.applyProfileToCache({
      timezoneId: 'Europe/Paris',
      usualAvailability: 'Weeknights',
      discordAutoPromptPlayIntent: false,
    } as Parameters<typeof view.result.current.applyProfileToCache>[0]),
  )
  await waitFor(() =>
    assert.equal(
      view.result.current.state.session?.user?.timezoneId,
      'Europe/Paris',
    ),
  )
  assert.equal(
    view.result.current.state.library?.usualAvailability,
    'Weeknights',
  )
})

test('a failed public resource becomes the dashboard error', async () => {
  const routes = baseRoutes({ authenticated: false, user: null })
  routes['/api/discovery/feed'] = () =>
    json(503, { error: 'Discovery is down.' })
  stubFetch(routes)
  const view = await renderData()

  await waitFor(() =>
    assert.equal(view.result.current.state.error, 'Discovery is down.'),
  )
})
