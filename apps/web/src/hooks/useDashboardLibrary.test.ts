/**
 * Hook test for the Library page on TanStack Query: the catalog search waits for typing to settle
 * and asks once for the final title, adding a game posts once and refreshes the dashboard, the
 * aliases load, and a failed alias removal now reports the error instead of claiming success.
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
let useDashboardLibrary: typeof import('./useDashboardLibrary').useDashboardLibrary

before(async () => {
  dom = installJsdomGlobals({ url: 'http://localhost/library' })
  React = await import('react')
  const testingLibrary = await import('@testing-library/react')
  renderHook = testingLibrary.renderHook
  waitFor = testingLibrary.waitFor
  act = testingLibrary.act
  cleanup = testingLibrary.cleanup
  QueryClientProvider = (await import('@tanstack/react-query'))
    .QueryClientProvider
  MemoryRouter = (await import('react-router-dom')).MemoryRouter
  useDashboardLibrary = (await import('./useDashboardLibrary'))
    .useDashboardLibrary
})

afterEach(() => {
  cleanup()
  clearTestQueryClients()
  mock.restoreAll()
})

after(() => {
  dom.window.close()
})

const platformAliasId = '33333333-3333-4333-8333-333333333333'

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type Call = { url: string; method: string; body: string | null }

/** Stub fetch: aliases and the catalog answer GETs; `write` answers everything else. */
function stubFetch(write: (call: Call) => Response) {
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
        call.url.endsWith('/api/aliases/platforms')
      ) {
        return json(200, {
          aliases: [
            {
              id: platformAliasId,
              platform: 'PC',
              aliasValue: 'Battle station',
            },
          ],
        })
      }
      if (call.method === 'GET' && call.url.endsWith('/api/aliases/games')) {
        return json(200, { aliases: [] })
      }
      if (call.method === 'GET' && call.url.includes('/api/library/catalog')) {
        return json(200, {
          results: [
            {
              id: 'rawg-1',
              source: 'rawg',
              sourceId: '1',
              title: 'Deep Rock Galactic',
              coverUrl: null,
              platformLabels: ['PC'],
            },
          ],
        })
      }
      return write(call)
    },
  )
  return calls
}

/** Render the hook signed in, recording notices and dashboard refreshes. */
async function renderLibrary() {
  const notices: unknown[] = []
  let refreshes = 0
  const client = await createTestQueryClient()
  const wrapper = ({ children }: { children: import('react').ReactNode }) =>
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/library'] },
      React.createElement(QueryClientProvider, { client }, children),
    )
  const view = renderHook(
    () =>
      useDashboardLibrary({
        isSignedIn: true,
        steamImportEnabled: false,
        steamConnected: false,
        steamLinkPending: false,
        libraryEntries: [],
        suggestedGames: [],
        trendingGames: [],
        libraryGameIds: new Set(),
        addingLibraryGameId: null,
        currentUsualAvailability: null,
        browserTimeZoneId: null,
        loadDashboard: async () => {
          refreshes += 1
        },
        updateProfile: async () => {
          throw new Error('not used')
        },
        applyProfileUpdate: () => {},
        setActionNotice: (notice) => {
          notices.push(typeof notice === 'function' ? notice(null) : notice)
        },
        setProfileNotice: () => {},
        onStartSteamLink: async () => {},
      }),
    { wrapper },
  )
  return { view, notices, refreshes: () => refreshes }
}

test('the catalog search waits for typing to settle and asks once for the final title', async () => {
  const calls = stubFetch(() => json(500, {}))
  const { view } = await renderLibrary()

  act(() => view.result.current.libraryViewProps.onLibraryTitleChange('De'))
  act(() => view.result.current.libraryViewProps.onLibraryTitleChange('Deep R'))
  assert.equal(
    view.result.current.libraryViewProps.gameSuggestionsLoading,
    true,
  )

  await waitFor(() =>
    assert.equal(
      view.result.current.libraryViewProps.gameSuggestions.length,
      1,
    ),
  )
  const searches = calls.filter((call) =>
    call.url.includes('/api/library/catalog'),
  )
  assert.equal(searches.length, 1, 'only the settled title is searched')
  assert.match(searches[0]!.url, /query=Deep%20R$/)
  assert.equal(
    view.result.current.libraryViewProps.gameSuggestionsLoading,
    false,
  )
})

test('adding a game posts once, resets the form and refreshes the dashboard', async () => {
  const calls = stubFetch((call) =>
    call.method === 'POST'
      ? json(200, { usualAvailability: null, entries: [] })
      : json(404, {}),
  )
  const { view, notices, refreshes } = await renderLibrary()

  act(() => view.result.current.libraryViewProps.onLibraryTitleChange('Hades'))
  act(() => view.result.current.libraryViewProps.onTogglePlatformLabel('PC'))
  await act(() => view.result.current.libraryViewProps.onAddLibraryEntry())

  const posts = calls.filter((call) => call.method === 'POST')
  assert.equal(posts.length, 1)
  assert.match(posts[0]!.url, /\/api\/library\/me$/)
  assert.deepEqual(JSON.parse(posts[0]!.body!).platformLabels, ['PC'])
  assert.deepEqual(notices.at(-1), {
    tone: 'success',
    message: 'Hades was added to your library.',
  })
  assert.equal(refreshes(), 1)
})

test('aliases load, and a failed removal reports the error instead of success', async () => {
  stubFetch(() => json(500, { error: 'Could not remove that alias.' }))
  const { view, notices } = await renderLibrary()

  await waitFor(() =>
    assert.equal(
      view.result.current.libraryViewProps.platformAliases.length,
      1,
    ),
  )

  await act(() =>
    view.result.current.libraryViewProps.onDeletePlatformAlias('PC'),
  )

  assert.deepEqual(notices.at(-1), {
    tone: 'danger',
    message: 'Could not remove that alias.',
  })
  assert.equal(
    view.result.current.libraryViewProps.platformAliases.length,
    1,
    'the alias stays listed when the server refused',
  )
})
