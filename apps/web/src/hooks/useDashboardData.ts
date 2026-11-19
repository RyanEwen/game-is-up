/**
 * The dashboard's server data, loaded with TanStack Query (UI-7).
 *
 * One query per resource, gated the way the old single `loadDashboard()` was: the health, auth
 * providers, session, discovery feed and call-to-play feed always load; the library, the current
 * call to play, friends lists and Discord servers only once the session says signed in; the debug
 * snapshot only for admins. A failure of one of the always-loaded resources is the dashboard's
 * `error` (the "temporarily unavailable" notice), and those queries keep retrying every few seconds
 * until the API answers again. A failure of a signed-in resource is logged and reads as empty, as
 * before.
 *
 * `state` keeps the old all-at-once behaviour for the first load: it stays empty until every
 * query that should load has answered, so a page never shows half a dashboard (for example "your
 * library is empty" while the library is still on its way). Later refreshes update each part as it
 * arrives, keeping the previous data meanwhile.
 */
import { useCallback, useEffect, useMemo } from 'react'
import {
  useQueries,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query'
import type {
  ActivePlayIntent,
  AuthProvidersResponse,
  AuthSessionResponse,
  DebugAdminResponse,
  DiscordServerPreferencesResponse,
  DiscoveryFeed,
  FriendsList,
  HealthResponse,
  LibraryResponse,
  PlayIntentFeed,
  UserProfileResponse,
} from '@game-is-up/shared'
import {
  authProvidersResponseSchema,
  authSessionResponseSchema,
  debugAdminResponseSchema,
  discordServerPreferencesResponseSchema,
  discoveryFeedSchema,
  friendsListsResponseSchema,
  healthResponseSchema,
  libraryResponseSchema,
  playIntentCurrentResponseSchema,
  playIntentFeedSchema,
} from '@game-is-up/shared'
import { apiRequest, type ResponseParser } from '../lib/apiQuery'
import {
  dashboardResourceKeys,
  invalidationKeysForDomains,
  invalidationPrefixesForDomains,
} from '../lib/dashboardInvalidation'

/** What the dashboard renders from; the same shape `loadDashboard()` used to fill. */
export type DashboardLoadState = {
  activePlayIntent: ActivePlayIntent | null
  session: AuthSessionResponse | null
  auth: AuthProvidersResponse | null
  debugAdmin: DebugAdminResponse | null
  discordServers: DiscordServerPreferencesResponse | null
  discovery: DiscoveryFeed | null
  friendsLists: FriendsList[]
  health: HealthResponse | null
  library: LibraryResponse | null
  playIntents: PlayIntentFeed | null
  error: string | null
}

/** How often a failing always-loaded request is retried while the API is unavailable. */
const apiReconnectPollMs = 5000
const emptyFriendsLists: FriendsList[] = []

/** A GET of one dashboard resource, parsed with its shared schema. */
function load<T>(path: string, schema: ResponseParser<T>, label: string) {
  return () => apiRequest(path, schema, `${label} request failed.`)
}

/** Retry every few seconds while this query is failing, and not at all otherwise. */
function pollWhileFailing(query: { state: { status: string } }) {
  return query.state.status === 'error' ? apiReconnectPollMs : false
}

/** Log a failed signed-in resource once per error, as the old loader did. */
function useLogFailure(result: UseQueryResult, label: string) {
  const { error } = result
  useEffect(() => {
    if (error) {
      console.error(`${label} request failed`, error)
    }
  }, [error, label])
}

export function useDashboardData() {
  const queryClient = useQueryClient()

  // Phase 1: what every visitor loads.
  const [health, authProviders, session, discoveryFeed, playIntentFeed] =
    useQueries({
      queries: [
        {
          queryKey: dashboardResourceKeys.health,
          queryFn: load('/api/health', healthResponseSchema, 'Health'),
          refetchInterval: pollWhileFailing,
        },
        {
          queryKey: dashboardResourceKeys.authProviders,
          queryFn: load(
            '/api/auth/providers',
            authProvidersResponseSchema,
            'Auth providers',
          ),
          refetchInterval: pollWhileFailing,
        },
        {
          queryKey: dashboardResourceKeys.session,
          queryFn: load('/api/auth/me', authSessionResponseSchema, 'Session'),
          refetchInterval: pollWhileFailing,
        },
        {
          queryKey: dashboardResourceKeys.discoveryFeed,
          queryFn: load(
            '/api/discovery/feed',
            discoveryFeedSchema,
            'Discovery feed',
          ),
          refetchInterval: pollWhileFailing,
        },
        {
          queryKey: dashboardResourceKeys.playIntentFeed,
          queryFn: load(
            '/api/play-intents/feed',
            playIntentFeedSchema,
            'Call to play feed',
          ),
          refetchInterval: pollWhileFailing,
        },
      ],
    })

  // Phase 2: what only a signed-in user (or an admin) loads.
  const sessionData = session.data
  const signedIn = Boolean(sessionData?.authenticated)
  const isAdmin = Boolean(
    sessionData?.authenticated && sessionData.user?.isAdmin,
  )

  const library = useQuery({
    queryKey: dashboardResourceKeys.library,
    queryFn: load('/api/library/me', libraryResponseSchema, 'Library'),
    enabled: signedIn,
  })
  const currentPlayIntent = useQuery({
    queryKey: dashboardResourceKeys.currentPlayIntent,
    queryFn: load(
      '/api/play-intents/me',
      playIntentCurrentResponseSchema,
      'Current play intent',
    ),
    enabled: signedIn,
  })
  const friendsLists = useQuery({
    queryKey: dashboardResourceKeys.friendsLists,
    queryFn: load(
      '/api/friends-lists',
      friendsListsResponseSchema,
      'Friends lists',
    ),
    enabled: signedIn,
  })
  const discordServers = useQuery({
    queryKey: dashboardResourceKeys.discordServers,
    queryFn: load(
      '/api/discord-servers/me',
      discordServerPreferencesResponseSchema,
      'Discord servers',
    ),
    enabled: signedIn,
  })
  const debugAdmin = useQuery({
    queryKey: dashboardResourceKeys.debugAdmin,
    queryFn: load('/api/debug/admin', debugAdminResponseSchema, 'Debug admin'),
    enabled: isAdmin,
  })

  useLogFailure(library, 'Library')
  useLogFailure(currentPlayIntent, 'Current play intent')
  useLogFailure(friendsLists, 'Friends lists')
  useLogFailure(discordServers, 'Discord servers')
  useLogFailure(debugAdmin, 'Debug admin')

  const coreQueries = [
    health,
    authProviders,
    session,
    discoveryFeed,
    playIntentFeed,
  ]
  const coreError = coreQueries.find((query) => query.error)?.error ?? null

  // The first load is all-or-nothing: wait until every query that should load has answered
  // (with data or an error) before showing any of it.
  const signedInQueries = signedIn
    ? [library, currentPlayIntent, friendsLists, discordServers]
    : []
  const adminQueries = isAdmin ? [debugAdmin] : []
  const firstLoadSettled =
    session.status !== 'pending' &&
    [...coreQueries, ...signedInQueries, ...adminQueries].every(
      (query) => query.status !== 'pending',
    )

  const state = useMemo<DashboardLoadState>(() => {
    const error = coreError ? coreError.message || 'Unknown error' : null

    if (!firstLoadSettled) {
      return { ...emptyState, error }
    }

    return {
      activePlayIntent: signedIn
        ? (currentPlayIntent.data?.activeIntent ?? null)
        : null,
      session: session.data ?? null,
      health: health.data ?? null,
      auth: authProviders.data ?? null,
      debugAdmin: isAdmin ? (debugAdmin.data ?? null) : null,
      discordServers: signedIn ? (discordServers.data ?? null) : null,
      discovery: discoveryFeed.data ?? null,
      friendsLists: signedIn
        ? (friendsLists.data?.lists ?? emptyFriendsLists)
        : emptyFriendsLists,
      playIntents: playIntentFeed.data ?? null,
      library: signedIn ? (library.data ?? null) : null,
      error,
    }
  }, [
    authProviders.data,
    coreError,
    currentPlayIntent.data,
    debugAdmin.data,
    discordServers.data,
    discoveryFeed.data,
    firstLoadSettled,
    friendsLists.data,
    health.data,
    isAdmin,
    library.data,
    playIntentFeed.data,
    session.data,
    signedIn,
  ])

  /** Refetch every dashboard resource, as `loadDashboard()` did; resolves when they are back. */
  const refreshDashboard = useCallback(async () => {
    await invalidateKeys(queryClient, Object.values(dashboardResourceKeys))
  }, [queryClient])

  /** Refetch what a server-sent event's domains can have changed. */
  const invalidateDomains = useCallback(
    async (domains: readonly string[]) => {
      await Promise.all([
        invalidateKeys(queryClient, invalidationKeysForDomains(domains)),
        ...invalidationPrefixesForDomains(domains).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ])
    },
    [queryClient],
  )

  /** Apply a saved profile to the cached session and library without a refetch. */
  const applyProfileToCache = useCallback(
    (profile: UserProfileResponse) => {
      queryClient.setQueryData<AuthSessionResponse>(
        dashboardResourceKeys.session,
        (current) =>
          current?.authenticated && current.user
            ? {
                ...current,
                user: {
                  ...current.user,
                  timezoneId: profile.timezoneId,
                  usualAvailability: profile.usualAvailability,
                  discordAutoPromptPlayIntent:
                    profile.discordAutoPromptPlayIntent,
                },
              }
            : current,
      )
      queryClient.setQueryData<LibraryResponse>(
        dashboardResourceKeys.library,
        (current) =>
          current
            ? { ...current, usualAvailability: profile.usualAvailability }
            : current,
      )
    },
    [queryClient],
  )

  return { state, refreshDashboard, invalidateDomains, applyProfileToCache }
}

const emptyState: DashboardLoadState = {
  activePlayIntent: null,
  session: null,
  auth: null,
  debugAdmin: null,
  discordServers: null,
  discovery: null,
  friendsLists: emptyFriendsLists,
  health: null,
  library: null,
  playIntents: null,
  error: null,
}

/** Invalidate (and so refetch, where active) each key, resolving once all have settled. */
async function invalidateKeys(
  queryClient: ReturnType<typeof useQueryClient>,
  keys: readonly QueryKey[],
) {
  await Promise.all(
    keys.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey, exact: true }),
    ),
  )
}
