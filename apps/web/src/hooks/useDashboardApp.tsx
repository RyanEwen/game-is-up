/**
 * Top-level dashboard data hook composed by `Dashboard.tsx`.
 *
 * Owns the dashboard's bootstrap fetch, the per-route data loaders
 * (overview, play, library, invites), Server-Sent Event invalidation wiring,
 * notice/banner state, and the cross-cutting actions (sign-out, route
 * synchronization, focus refetches). Sub-hooks `useDashboardPlay`,
 * `useDashboardLibrary`, and `useDashboardInvites` are composed inside this
 * hook so views see one consolidated API surface rather than juggling
 * several smaller hooks.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ActivePlayIntent,
  AuthProvidersResponse,
  AuthSessionResponse,
  DebugAdminResponse,
  DiscordServerPreferencesResponse,
  DiscoveryFeed,
  DiscoveryGame,
  GameDetails,
  GameDetailsResponse,
  DiscoveryPerson,
  DiscoveryPersonGame,
  FriendsList,
  HealthResponse,
  LibraryEntry,
  LibraryResponse,
  PlayIntentCurrentResponse,
  PlayIntentFeed,
  SteamLinkIntentResponse,
  UserProfileResponse
} from '@game-is-up/shared'
import { buildApiIssueMessage } from '../components/dashboard/apiIssue'
import {
  authProvidersResponseSchema,
  authSessionResponseSchema,
  debugAdminResponseSchema,
  deleteFriendsListResponseSchema,
  discordServerPreferencesResponseSchema,
  discoveryFeedSchema,
  extractErrorMessage,
  friendsListResponseSchema,
  friendsListsResponseSchema,
  gameDetailsResponseSchema,
  healthResponseSchema,
  libraryResponseSchema,
  playIntentCurrentResponseSchema,
  playIntentFeedSchema,
  steamLinkIntentResponseSchema,
  userProfileResponseSchema
} from '@game-is-up/shared'
import { Button, Card, Chip, Stack, Typography } from '@mui/joy'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import type { DashboardGameDetailsTarget, DashboardLibraryQuickAddGame, FriendTarget, Notice } from '../components/dashboard/types'
import { useDashboardInvites } from './useDashboardInvites'
import { useDashboardLibrary } from './useDashboardLibrary'
import { useDashboardPlay } from './useDashboardPlay'
import { useDashboardSseInvalidation } from './useDashboardSseInvalidation'
import { useTimedNotice } from './useTimedNotice'
import { checkForAppUpdate } from '../lib/appUpdate'
import { buildAbsoluteApiUrl, buildApiUrl } from '../lib/apiUrl'
import {
  type BeforeInstallPromptEvent,
  getBrowserTimeZoneId,
  getInstallSupport,
  getIsInstalledBrowserApp
} from '../lib/browserEnv'

const apiReconnectPollMs = 5000
const emptyLibraryEntries: LibraryResponse['entries'] = []
const inviteAttributionOnboardingWindowMs = 14 * 24 * 60 * 60 * 1000

type LoadState = {
  activePlayIntent: ActivePlayIntent | null;
  session: AuthSessionResponse | null;
  auth: AuthProvidersResponse | null;
  debugAdmin: DebugAdminResponse | null;
  discordServers: DiscordServerPreferencesResponse | null;
  discovery: DiscoveryFeed | null;
  friendsLists: FriendsList[];
  health: HealthResponse | null;
  library: LibraryResponse | null;
  playIntents: PlayIntentFeed | null;
  error: string | null;
};

const initialState: LoadState = {
  activePlayIntent: null,
  session: null,
  auth: null,
  debugAdmin: null,
  discordServers: null,
  discovery: null,
  friendsLists: [],
  health: null,
  library: null,
  playIntents: null,
  error: null
}

export function useDashboardApp() {
  const [state, setState] = useState<LoadState>(initialState)
  const [authNotice, setAuthNotice] = useState<Notice | null>(null)
  const [actionNotice, setActionNotice] = useState<Notice | null>(null)
  const [profileNotice, setProfileNotice] = useState<Notice | null>(null)
  const [playIntentNotice, setPlayIntentNotice] = useState<Notice | null>(null)
  const [discordAutoPromptPlayIntentSaving, setDiscordAutoPromptPlayIntentSaving] = useState(false)
  const [steamLinkPending, setSteamLinkPending] = useState(false)
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installPromptPending, setInstallPromptPending] = useState(false)
  const [friendPendingId, setFriendPendingId] = useState<string | null>(null)
  const [friendsListMutationPending, setFriendsListMutationPending] = useState(false)
  const [addingLibraryGameId, setAddingLibraryGameId] = useState<string | null>(null)
  const [discordServerRefreshPending, setDiscordServerRefreshPending] = useState(false)
  const [serverPreferencePendingId, setServerPreferencePendingId] = useState<string | null>(null)
  const [gameDetailsTarget, setGameDetailsTarget] = useState<DashboardGameDetailsTarget | null>(null)
  const [gameDetailsByKey, setGameDetailsByKey] = useState<Record<string, GameDetails | null>>({})
  const [gameDetailsErrorByKey, setGameDetailsErrorByKey] = useState<Record<string, string>>({})
  const [gameDetailsLoadingKey, setGameDetailsLoadingKey] = useState<string | null>(null)
  const timezoneSyncPendingIdRef = useRef<string | null>(null)
  const sseRefreshTimeoutIdRef = useRef<number | null>(null)
  const sseDeferredRefreshRef = useRef(false)
  const showDebugView = Boolean(state.session?.user?.isAdmin)
  const browserTimeZoneId = getBrowserTimeZoneId()
  const isInstalledBrowserApp = getIsInstalledBrowserApp()
  const installSupport = !isInstalledBrowserApp ? getInstallSupport(installPromptEvent) : null

  const isSignedIn = Boolean(state.session?.authenticated && state.session.user)
  const selectedGameDetailsKey = gameDetailsTarget ? `${gameDetailsTarget.source}:${gameDetailsTarget.sourceId}` : null
  const libraryEntries = state.library?.entries ?? emptyLibraryEntries
  const suggestedLibraryGames = state.library?.suggestedGames ?? []
  const trendingLibraryGames = state.library?.trendingGames ?? []
  const discoveryGames = state.discovery?.games ?? []
  const discoveryPeople = state.discovery?.people ?? []
  const playIntentFriendOptions = discoveryPeople
    .filter((person: DiscoveryPerson) => person.isFriend)
    .map((person: DiscoveryPerson) => ({
      id: person.id,
      handle: person.handle,
      displayName: person.displayName,
      avatarUrl: person.avatarUrl
    }))
    .sort((left: { id: string; handle: string; displayName: string; avatarUrl: string | null }, right: { id: string; handle: string; displayName: string; avatarUrl: string | null }) => left.displayName.localeCompare(right.displayName))
  const addedFriendCount = playIntentFriendOptions.length
  const overlapGames = discoveryGames.filter((game: DiscoveryGame) => game.sharedWithViewer)
  const browseGames = discoveryGames.filter((game: DiscoveryGame) => !game.sharedWithViewer)
  const hasLibraryEntries = libraryEntries.length > 0
  const hasDiscoveryGames = discoveryGames.length > 0
  const hasDiscoveryPeople = discoveryPeople.length > 0
  const hasDiscoveryContent = hasDiscoveryGames || hasDiscoveryPeople
  const hasPlayIntentPreviews = Boolean(
    state.playIntents && state.playIntents.intents.some((intent) => intent.status === 'active' && intent.appliesToViewer)
  )
  const showSignedInOnboarding = isSignedIn && !hasLibraryEntries && !hasDiscoveryContent && !hasPlayIntentPreviews
  const availableDiscoveryServers = (state.discordServers?.servers ?? []).filter((server: DiscordServerPreferencesResponse['servers'][number]) => server.botPresent)
  const playIntentDiscordServerOptions = availableDiscoveryServers.filter((server: DiscordServerPreferencesResponse['servers'][number]) => server.selected)
  const selectedDiscoveryServerCount = availableDiscoveryServers.filter((server: DiscordServerPreferencesResponse['servers'][number]) => server.selected).length
  const noDiscoveryServersSelected = isSignedIn && availableDiscoveryServers.length > 0 && selectedDiscoveryServerCount === 0
  const libraryGameIds = new Set<string>(libraryEntries.map((entry: LibraryEntry) => entry.gameId))
  const libraryEntryIdsByGameId = new Map<string, string>(libraryEntries.map((entry: LibraryEntry) => [entry.gameId, entry.id]))
  const hasLoadedAudienceContext = state.discovery != null
  const playIntentDefaultAudienceCount = discoveryPeople.filter((person: DiscoveryPerson) => person.games.some((game: DiscoveryPersonGame) => libraryGameIds.has(game.id))).length
  const playIntentUnavailableAudienceMessage = hasLoadedAudienceContext && isSignedIn && !state.activePlayIntent && hasLibraryEntries && playIntentDefaultAudienceCount === 0
    ? noDiscoveryServersSelected
      ? 'You do not have any Discord servers in your network right now, so nobody can receive a call to play. Select at least one Discord server to form your network first.'
      : discoveryPeople.length === 0
        ? 'You do not have anyone in your network who can receive a call to play yet. Select at least one Discord server to form your network first.'
        : 'Nobody in your network has games in their library that match yours, so nobody can receive a call to play yet. Add more games to your library or wait for others to add more that match yours.'
    : null
  const discordProvider = state.auth?.providers.find((provider: AuthProvidersResponse['providers'][number]) => provider.id === 'discord') ?? null
  const steamProvider = state.auth?.providers.find((provider: AuthProvidersResponse['providers'][number]) => provider.id === 'steam') ?? null
  const steamConnected = Boolean(state.session?.connectedProviders.includes('steam'))
  const currentUsualAvailability = state.library?.usualAvailability ?? state.session?.user?.usualAvailability ?? null
  const friendPeople = [...discoveryPeople].filter((person) => person.isFriend).sort((left, right) => left.displayName.localeCompare(right.displayName))
  const addableFriendPeople = [...discoveryPeople].filter((person) => person.friendEligible).sort((left, right) => left.displayName.localeCompare(right.displayName))
  const friendsLists = state.friendsLists
  const latestInviteAttribution = state.session?.inviteAttribution ?? null
  const latestInviteAcceptedAt = latestInviteAttribution ? new Date(latestInviteAttribution.acceptedAt).getTime() : 0
  const hasRecentInviteAttribution = latestInviteAttribution != null
    && Number.isFinite(latestInviteAcceptedAt)
    && Date.now() - latestInviteAcceptedAt <= inviteAttributionOnboardingWindowMs
  const inviterAlreadyFriend = latestInviteAttribution?.inviterUserId != null
    ? friendPeople.some((person) => person.id === latestInviteAttribution.inviterUserId)
    : false
  const showInviteAttributionOnboarding = isSignedIn && hasRecentInviteAttribution && (showSignedInOnboarding || !inviterAlreadyFriend)
  const toastNotices = [
    state.error
      ? { id: 'api-issue', notice: { tone: 'warning' as const, message: buildApiIssueMessage(state.error) } }
      : null,
    actionNotice
      ? { id: 'action', notice: actionNotice, dismiss: () => setActionNotice(null) }
      : null,
    authNotice
      ? { id: 'auth', notice: authNotice, dismiss: () => setAuthNotice(null) }
      : null,
    profileNotice
      ? { id: 'profile', notice: profileNotice, dismiss: () => setProfileNotice(null) }
      : null,
    playIntentNotice
      ? { id: 'play-intent', notice: playIntentNotice, dismiss: () => setPlayIntentNotice(null) }
      : null
  ].filter((toast): toast is { id: string; notice: Notice; dismiss: () => void } => toast != null)

  const applyAuthNotice = useCallback((auth: string, status: string, reason: string | null) => {
    if (auth === 'steam') {
      if (status === 'success') {
        setAuthNotice({
          tone: 'success',
          message: 'Steam account connected. Review the import list and choose which games to add.'
        })
        return
      }

      setAuthNotice({
        tone: 'danger',
        message: `Steam link failed${reason ? `: ${reason}` : '.'}`
      })
      return
    }

    if (status === 'success') {
      setAuthNotice({
        tone: 'success',
        message: 'Signed in with Discord.'
      })
      return
    }

    if (reason === 'access_denied') {
      setAuthNotice({
        tone: 'danger',
        message: "Discord sign-in was canceled. Game's Up needs your Discord connection to sync servers and keep your network current."
      })
      return
    }

    setAuthNotice({
      tone: 'danger',
      message: `Discord sign-in failed${reason ? `: ${reason}` : '.'}`
    })
  }, [])

  useTimedNotice(actionNotice, setActionNotice)
  useTimedNotice(authNotice, setAuthNotice)
  useTimedNotice(profileNotice, setProfileNotice)
  useTimedNotice(playIntentNotice, setPlayIntentNotice)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPromptEvent(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setInstallPromptEvent(null)
      setInstallPromptPending(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const loadDashboard = useCallback(async () => {
    const requestInit = {
      credentials: 'include' as const
    }

    async function readOptionalJson<TParsed>(
      response: Response | null,
      parser: (json: unknown) => TParsed,
      label: string
    ): Promise<TParsed | null> {
      if (!response) {
        return null
      }

      if (!response.ok) {
        console.error(`${label} request failed`, response.status, response.statusText)
        return null
      }

      return parser(await response.json())
    }

    try {
      const [healthResponse, authResponse, sessionResponse] = await Promise.all([
        fetch(buildApiUrl('/api/health'), requestInit),
        fetch(buildApiUrl('/api/auth/providers'), requestInit),
        fetch(buildApiUrl('/api/auth/me'), requestInit)
      ])

      const [healthJson, authJson, sessionJson] = await Promise.all([
        healthResponse.json(),
        authResponse.json(),
        sessionResponse.json()
      ])

      const parsedSession = authSessionResponseSchema.parse(sessionJson)

      const [discoveryResponse, playIntentsResponse, libraryResponse, currentPlayIntentResponse, friendsListsResponse, debugResponse] = await Promise.all([
        fetch(buildApiUrl('/api/discovery/feed'), requestInit),
        fetch(buildApiUrl('/api/play-intents/feed'), requestInit),
        parsedSession.authenticated ? fetch(buildApiUrl('/api/library/me'), requestInit) : Promise.resolve(null),
        parsedSession.authenticated ? fetch(buildApiUrl('/api/play-intents/me'), requestInit) : Promise.resolve(null),
        parsedSession.authenticated ? fetch(buildApiUrl('/api/friends-lists'), requestInit) : Promise.resolve(null),
        parsedSession.authenticated && parsedSession.user?.isAdmin ? fetch(buildApiUrl('/api/debug/admin'), requestInit) : Promise.resolve(null)
      ])

      const [discoveryJson, playIntentsJson] = await Promise.all([
        discoveryResponse.json(),
        playIntentsResponse.json()
      ])

      const discordServersResponse = parsedSession.authenticated ? await fetch(buildApiUrl('/api/discord-servers/me'), requestInit) : null

      let library: LibraryResponse | null = null
      let activePlayIntentState: ActivePlayIntent | null = null
      let debugAdmin: DebugAdminResponse | null = null
      let discordServers: DiscordServerPreferencesResponse | null = null

      library = await readOptionalJson(
        libraryResponse,
        (libraryJson) => libraryResponseSchema.parse(libraryJson),
        'Library'
      )

      const currentPlayIntentState = await readOptionalJson(
        currentPlayIntentResponse,
        (currentPlayIntentJson) => playIntentCurrentResponseSchema.parse(currentPlayIntentJson as PlayIntentCurrentResponse),
        'Current play intent'
      )
      activePlayIntentState = currentPlayIntentState?.activeIntent ?? null

      discordServers = await readOptionalJson(
        discordServersResponse,
        (discordServersJson) => discordServerPreferencesResponseSchema.parse(discordServersJson),
        'Discord servers'
      )

      const friendsListsState = await readOptionalJson(
        friendsListsResponse,
        (friendsListsJson) => friendsListsResponseSchema.parse(friendsListsJson),
        'Friends lists'
      )

      if (debugResponse) {
        if (debugResponse.ok) {
          try {
            const debugJson = await debugResponse.json()
            debugAdmin = debugAdminResponseSchema.parse(debugJson)
          } catch (error) {
            console.error('Debug admin payload parse failed', error)
          }
        } else {
          console.error('Debug admin request failed', debugResponse.status, debugResponse.statusText)
        }
      }

      setState({
        activePlayIntent: activePlayIntentState,
        session: parsedSession,
        health: healthResponseSchema.parse(healthJson),
        auth: authProvidersResponseSchema.parse(authJson),
        debugAdmin,
        discordServers,
        discovery: discoveryFeedSchema.parse(discoveryJson),
        friendsLists: friendsListsState?.lists ?? [],
        playIntents: playIntentFeedSchema.parse(playIntentsJson),
        library,
        error: null
      })
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Unknown error'
      }))
    }
  }, [])

  const scheduleDashboardRefreshFromInvalidation = useCallback(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (window.navigator.onLine === false || document.visibilityState !== 'visible') {
      sseDeferredRefreshRef.current = true
      return
    }

    if (sseRefreshTimeoutIdRef.current != null) {
      return
    }

    sseRefreshTimeoutIdRef.current = window.setTimeout(() => {
      sseRefreshTimeoutIdRef.current = null
      sseDeferredRefreshRef.current = false
      void loadDashboard()
    }, 250)
  }, [loadDashboard])

  const updateProfile = useCallback(async (profilePatch: { usualAvailability?: string; timezoneId?: string; discordAutoPromptPlayIntent?: boolean }) => {
    const response = await fetch(buildApiUrl('/api/profile/me'), {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(profilePatch)
    })

    const responseBody = (await response.json()) as UserProfileResponse | { error?: string }

    if (!response.ok) {
      throw new Error(extractErrorMessage(responseBody, 'Unable to update your profile right now.'))
    }

    return userProfileResponseSchema.parse(responseBody)
  }, [])

  const applyProfileUpdate = useCallback((parsedProfile: UserProfileResponse) => {
    timezoneSyncPendingIdRef.current = parsedProfile.timezoneId
    setState((current) => ({
      ...current,
      session: current.session?.authenticated && current.session.user
        ? {
            ...current.session,
            user: {
              ...current.session.user,
              timezoneId: parsedProfile.timezoneId,
              usualAvailability: parsedProfile.usualAvailability,
              discordAutoPromptPlayIntent: parsedProfile.discordAutoPromptPlayIntent
            }
          }
        : current.session,
      library: current.library
        ? {
            ...current.library,
            usualAvailability: parsedProfile.usualAvailability
          }
        : current.library
    }))
  }, [])

  const handleDiscordAutoPromptPlayIntentChange = useCallback(async (nextEnabled: boolean) => {
    if (!isSignedIn || discordAutoPromptPlayIntentSaving) {
      return
    }

    setDiscordAutoPromptPlayIntentSaving(true)
    setProfileNotice(null)

    try {
      const parsedProfile = await updateProfile({
        discordAutoPromptPlayIntent: nextEnabled
      })

      applyProfileUpdate(parsedProfile)
      setProfileNotice({
        tone: 'success',
        message: nextEnabled
          ? 'Discord can now prompt you to create a call to play when it sees you start a game.'
          : 'Automatic Discord call-to-play prompts are now off.'
      })
      await loadDashboard()
    } catch (error) {
      setProfileNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to update your Discord prompt setting right now.'
      })
    } finally {
      setDiscordAutoPromptPlayIntentSaving(false)
    }
  }, [applyProfileUpdate, discordAutoPromptPlayIntentSaving, isSignedIn, loadDashboard, updateProfile])

  const handleAddGameToLibrary = useCallback(async ({ gameId, title, coverUrl, platformLabels }: DashboardLibraryQuickAddGame) => {
    const alreadyInLibrary = libraryEntries.some((entry: LibraryEntry) => entry.gameId === gameId)

    if (!isSignedIn) {
      setActionNotice({
        tone: 'danger',
        message: 'Sign in before adding games to your library.'
      })
      return
    }

    if (alreadyInLibrary) {
      setActionNotice({
        tone: 'neutral',
        message: `${title} is already in your library.`
      })
      return
    }

    const normalizedPlatformLabels = [...new Set(platformLabels.map((platformLabel) => platformLabel.trim()).filter(Boolean))]

    if (normalizedPlatformLabels.length === 0) {
      setActionNotice({
        tone: 'danger',
        message: `Unable to add ${title} because it does not have any platform data yet.`
      })
      return
    }

    setAddingLibraryGameId(gameId)
    setActionNotice(null)

    try {
      const response = await fetch(buildApiUrl('/api/library/me'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          platformLabels: normalizedPlatformLabels,
          intent: 'interested',
          catalogMatch: {
            source: 'local',
            sourceId: gameId,
            title,
            coverUrl,
            platformLabels: normalizedPlatformLabels
          }
        })
      })

      const responseBody = (await response.json()) as LibraryResponse | { error?: string }

      if (!response.ok) {
        setActionNotice({
          tone: 'danger',
          message: extractErrorMessage(responseBody, `Unable to add ${title} right now.`)
        })
        return
      }

      libraryResponseSchema.parse(responseBody)
      setActionNotice({
        tone: 'success',
        message: `${title} was added to your library.`
      })
      await loadDashboard()
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : `Unable to add ${title} right now.`
      })
    } finally {
      setAddingLibraryGameId(null)
    }
  }, [isSignedIn, libraryEntries, loadDashboard])

  const handleSteamLink = useCallback(async () => {
    if (!isSignedIn || steamLinkPending) {
      return
    }

    setSteamLinkPending(true)
    setActionNotice(null)
    setAuthNotice(null)

    try {
      const response = await fetch(buildApiUrl('/api/auth/steam/link-intent'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          returnTo: window.location.href
        })
      })

      const responseBody = (await response.json()) as SteamLinkIntentResponse | { error?: string }

      if (!response.ok) {
        setActionNotice({
          tone: 'danger',
          message: extractErrorMessage(responseBody, 'Unable to start Steam linking right now.')
        })
        return
      }

      const parsed = steamLinkIntentResponseSchema.parse(responseBody)

      window.location.assign(parsed.authorizationUrl)
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to start Steam linking right now.'
      })
    } finally {
      setSteamLinkPending(false)
    }
  }, [isSignedIn, steamLinkPending])

  const { profileSaving, libraryViewProps, openLibraryEditorForGame } = useDashboardLibrary({
    isSignedIn,
    steamImportEnabled: Boolean(steamProvider?.enabled),
    steamConnected,
    steamLinkPending,
    buildApiUrl,
    libraryEntries,
    suggestedGames: suggestedLibraryGames,
    trendingGames: trendingLibraryGames,
    libraryGameIds,
    addingLibraryGameId,
    currentUsualAvailability,
    browserTimeZoneId,
    loadDashboard,
    updateProfile,
    applyProfileUpdate,
    setActionNotice,
    setProfileNotice,
    onStartSteamLink: handleSteamLink,
    onAddGameToLibrary: handleAddGameToLibrary
  })

  const { playViewProps } = useDashboardPlay({
    isSignedIn,
    isAdmin: Boolean(state.session?.user?.isAdmin),
    buildApiUrl,
    activePlayIntent: state.activePlayIntent,
    libraryEntries,
    discoveryPeople,
    playIntentFriendOptions,
    friendsLists,
    playIntentDiscordServerOptions,
    playIntentPreviews: state.playIntents?.intents ?? [],
    loadDashboard,
    setPlayIntentNotice
  })

  const { inviteOverviewProps } = useDashboardInvites({
    buildApiUrl,
    session: state.session,
    isSignedIn,
    availableDiscoveryServers,
    setActionNotice
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && sseDeferredRefreshRef.current) {
        scheduleDashboardRefreshFromInvalidation()
      }
    }

    const handleOnline = () => {
      if (sseDeferredRefreshRef.current) {
        scheduleDashboardRefreshFromInvalidation()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)

      if (sseRefreshTimeoutIdRef.current != null) {
        window.clearTimeout(sseRefreshTimeoutIdRef.current)
        sseRefreshTimeoutIdRef.current = null
      }
    }
  }, [scheduleDashboardRefreshFromInvalidation])

  useDashboardSseInvalidation({
    enabled: isSignedIn,
    buildApiUrl,
    onInvalidation: scheduleDashboardRefreshFromInvalidation,
    // A deploy restarts the SSE stream, so checking the service worker here
    // helps signed-in users pick up the new web bundle promptly after reconnect.
    onOpen: checkForAppUpdate
  })

  useEffect(() => {
    if (!isSignedIn || !browserTimeZoneId || profileSaving) {
      return
    }

    const currentTimezoneId = state.session?.user?.timezoneId ?? null

    if (currentTimezoneId === browserTimeZoneId || timezoneSyncPendingIdRef.current === browserTimeZoneId) {
      return
    }

    timezoneSyncPendingIdRef.current = browserTimeZoneId

    void (async () => {
      try {
        const parsedProfile = await updateProfile({
          timezoneId: browserTimeZoneId
        })

        applyProfileUpdate(parsedProfile)
        await loadDashboard()
      } catch {
        timezoneSyncPendingIdRef.current = null
      }
    })()
  }, [applyProfileUpdate, browserTimeZoneId, isSignedIn, loadDashboard, profileSaving, state.session?.user?.timezoneId, updateProfile])

  const handleAuthRedirect = useCallback(async (urlString: string, options?: { clearBrowserUrl?: boolean }) => {
    const url = new URL(urlString)
    const params = url.searchParams
    const auth = params.get('auth')
    const status = params.get('status')
    const reason = params.get('reason')

    if ((auth !== 'discord' && auth !== 'steam') || !status) {
      return false
    }

    try {
      if (status === 'success') {
        await loadDashboard()
      }

      applyAuthNotice(auth, status, reason)
    } catch (error) {
      setAuthNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : auth === 'steam' ? 'Unable to finish Steam linking.' : 'Unable to finish sign-in.'
      })
    } finally {
      if (options?.clearBrowserUrl) {
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    }

    return true
  }, [applyAuthNotice, loadDashboard])

  useEffect(() => {
    void handleAuthRedirect(window.location.href, { clearBrowserUrl: true })
  }, [handleAuthRedirect])

  useEffect(() => {
    if (!state.error) {
      return
    }

    let cancelled = false
    let pollInFlight = false
    const requestInit = {
      credentials: 'include' as const
    }

    const pollApiHealth = async () => {
      if (pollInFlight) {
        return
      }

      pollInFlight = true

      try {
        const response = await fetch(buildApiUrl('/api/health'), requestInit)

        if (!response.ok) {
          return
        }

        const healthJson = await response.json()
        healthResponseSchema.parse(healthJson)

        if (!cancelled) {
          await loadDashboard()
        }
      } catch {
        return
      } finally {
        pollInFlight = false
      }
    }

    const intervalId = window.setInterval(() => {
      void pollApiHealth()
    }, apiReconnectPollMs)

    void pollApiHealth()

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [loadDashboard, state.error])

  const handleLogout = useCallback(async () => {
    await fetch(buildApiUrl('/api/auth/logout'), {
      method: 'POST',
      credentials: 'include'
    })

    window.location.reload()
  }, [])

  const handleDiscordLogin = useCallback(async () => {
    const loginUrl = buildAbsoluteApiUrl(`/api/auth/discord/login?returnTo=${encodeURIComponent(window.location.href)}`)

    window.location.assign(loginUrl)
  }, [])

  const handleInstallApp = useCallback(async () => {
    if (installPromptPending) {
      return
    }

    if (!installSupport) {
      return
    }

    if (installSupport === 'ios-manual') {
      setActionNotice({
        tone: 'neutral',
        message: 'Open Safari\'s Share menu and choose Add to Home Screen.'
      })
      return
    }

    if (!installPromptEvent) {
      setActionNotice({
        tone: 'neutral',
        message: 'Open your browser menu and choose Install app or Add to Home screen.'
      })
      return
    }

    setInstallPromptPending(true)

    try {
      await installPromptEvent.prompt()
      const choice = await installPromptEvent.userChoice

      if (choice.outcome === 'accepted') {
        setInstallPromptEvent(null)
      }
    } finally {
      setInstallPromptPending(false)
    }
  }, [installPromptEvent, installPromptPending, installSupport])

  const openGameDetails = useCallback((target: DashboardGameDetailsTarget) => {
    setGameDetailsTarget(target)
  }, [])

  const closeGameDetails = useCallback(() => {
    setGameDetailsTarget(null)
  }, [])

  useEffect(() => {
    if (!gameDetailsTarget || !selectedGameDetailsKey) {
      return
    }

    if (Object.prototype.hasOwnProperty.call(gameDetailsByKey, selectedGameDetailsKey) || gameDetailsErrorByKey[selectedGameDetailsKey]) {
      return
    }

    let cancelled = false
    setGameDetailsLoadingKey(selectedGameDetailsKey)

    void (async () => {
      try {
        const response = await fetch(buildApiUrl(`/api/library/catalog/${encodeURIComponent(gameDetailsTarget.source)}/${encodeURIComponent(gameDetailsTarget.sourceId)}/details`), {
          credentials: 'include'
        })
        const responseBody = (await response.json()) as GameDetailsResponse | { error?: string }

        if (!response.ok) {
          throw new Error(extractErrorMessage(responseBody, 'Unable to load game details right now.'))
        }

        const parsed = gameDetailsResponseSchema.parse(responseBody)

        if (cancelled) {
          return
        }

        setGameDetailsByKey((current) => ({
          ...current,
          [selectedGameDetailsKey]: parsed.game
        }))
      } catch (error) {
        if (cancelled) {
          return
        }

        setGameDetailsErrorByKey((current) => ({
          ...current,
          [selectedGameDetailsKey]: error instanceof Error ? error.message : 'Unable to load game details right now.'
        }))
      } finally {
        if (!cancelled) {
          setGameDetailsLoadingKey((current) => current === selectedGameDetailsKey ? null : current)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [gameDetailsByKey, gameDetailsErrorByKey, gameDetailsTarget, selectedGameDetailsKey])

  const handleToggleFriend = useCallback(async (target: FriendTarget) => {
    setFriendPendingId(target.id)
    setActionNotice(null)

    try {
      const response = await fetch(buildApiUrl(`/api/friends/${target.id}`), {
        method: target.friendEligible ? 'POST' : 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const responseBody = (await response.json()) as { error?: string }
        setActionNotice({
          tone: 'danger',
          message: responseBody.error ?? 'Unable to update friends right now.'
        })
        return
      }

      setActionNotice({
        tone: 'success',
        message: target.friendEligible
          ? `${target.displayName} was added to your friends list.`
          : `${target.displayName} was removed from your friends list.`
      })
      await loadDashboard()
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to update friends right now.'
      })
    } finally {
      setFriendPendingId(null)
    }
  }, [loadDashboard])

  const handleSaveFriendsList = useCallback(async (input: { listId?: string; name: string; friendUserIds: string[] }): Promise<boolean> => {
    setFriendsListMutationPending(true)
    setActionNotice(null)

    try {
      const isUpdate = Boolean(input.listId)
      const response = await fetch(
        buildApiUrl(isUpdate ? `/api/friends-lists/${input.listId}` : '/api/friends-lists'),
        {
          method: isUpdate ? 'PUT' : 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: input.name,
            friendUserIds: input.friendUserIds
          })
        }
      )

      const responseBody = (await response.json()) as { error?: string }

      if (!response.ok) {
        setActionNotice({
          tone: 'danger',
          message: extractErrorMessage(responseBody, 'Unable to save that friends list right now.')
        })
        return false
      }

      const parsed = friendsListResponseSchema.parse(responseBody)
      setActionNotice({
        tone: 'success',
        message: isUpdate
          ? `Updated the "${parsed.list.name}" friends list.`
          : `Created the "${parsed.list.name}" friends list.`
      })
      await loadDashboard()
      return true
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to save that friends list right now.'
      })
      return false
    } finally {
      setFriendsListMutationPending(false)
    }
  }, [loadDashboard])

  const handleDeleteFriendsList = useCallback(async (listId: string): Promise<boolean> => {
    setFriendsListMutationPending(true)
    setActionNotice(null)

    try {
      const response = await fetch(buildApiUrl(`/api/friends-lists/${listId}`), {
        method: 'DELETE',
        credentials: 'include'
      })

      const responseBody = (await response.json()) as { error?: string }

      if (!response.ok) {
        setActionNotice({
          tone: 'danger',
          message: extractErrorMessage(responseBody, 'Unable to delete that friends list right now.')
        })
        return false
      }

      const parsed = deleteFriendsListResponseSchema.parse(responseBody)
      setActionNotice({
        tone: parsed.status === 'deleted' ? 'success' : 'danger',
        message: parsed.message
      })
      await loadDashboard()
      return parsed.status === 'deleted'
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to delete that friends list right now.'
      })
      return false
    } finally {
      setFriendsListMutationPending(false)
    }
  }, [loadDashboard])

  const handleToggleDiscordServer = useCallback(async (serverId: string, nextSelected: boolean) => {
    setServerPreferencePendingId(serverId)
    setActionNotice(null)

    try {
      const response = await fetch(buildApiUrl(`/api/discord-servers/me/${serverId}`), {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          selected: nextSelected
        })
      })

      const responseBody = (await response.json()) as DiscordServerPreferencesResponse | { error?: string }

      if (!response.ok) {
        setActionNotice({
          tone: 'danger',
          message: extractErrorMessage(responseBody, 'Unable to update your Discord server network right now.')
        })
        return
      }

      discordServerPreferencesResponseSchema.parse(responseBody)
      setActionNotice({
        tone: 'success',
        message: nextSelected ? 'Discord server added to your network.' : 'Discord server removed from your network.'
      })
      await loadDashboard()
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to update your Discord server network right now.'
      })
    } finally {
      setServerPreferencePendingId(null)
    }
  }, [loadDashboard])

  const handleRefreshDiscordServers = useCallback(async () => {
    if (discordServerRefreshPending) {
      return
    }

    setDiscordServerRefreshPending(true)
    setActionNotice(null)

    try {
      const response = await fetch(buildApiUrl('/api/discord-servers/me/refresh'), {
        method: 'POST',
        credentials: 'include'
      })

      const responseBody = (await response.json()) as DiscordServerPreferencesResponse | { error?: string }

      if (!response.ok) {
        setActionNotice({
          tone: 'danger',
          message: extractErrorMessage(responseBody, 'Unable to refresh your Discord server list right now.')
        })
        return
      }

      discordServerPreferencesResponseSchema.parse(responseBody)
      setActionNotice({
        tone: 'success',
        message: 'Discord servers refreshed from Discord.'
      })
      await loadDashboard()
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to refresh your Discord server list right now.'
      })
    } finally {
      setDiscordServerRefreshPending(false)
    }
  }, [discordServerRefreshPending, loadDashboard])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const inviteAttributionOnboarding = showInviteAttributionOnboarding && latestInviteAttribution ? (
    <Card
      variant="soft"
      sx={{
        p: 3,
        border: '1px solid #272f3c',
        backgroundColor: '#0b1220'
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Chip color="primary" variant="soft">Discord invite</Chip>
          {latestInviteAttribution.kind === 'direct' ? <Chip color="warning" variant="soft">Direct invite</Chip> : null}
          {latestInviteAttribution.serverName ? <Chip color="neutral" variant="outlined">{latestInviteAttribution.serverName}</Chip> : null}
          {latestInviteAttribution.memberCount != null ? (
            <Chip color="success" variant="soft">
              {latestInviteAttribution.memberCount} already around
            </Chip>
          ) : null}
        </Stack>
        <Typography level="title-lg">
          {latestInviteAttribution.inviterDisplayName
            ? `${latestInviteAttribution.inviterDisplayName} brought you in`
            : latestInviteAttribution.serverName
              ? `You joined through ${latestInviteAttribution.serverName}`
              : 'You joined through a Discord invite'}
        </Typography>
        <Typography level="body-md" sx={{ color: 'neutral.300' }}>
          {latestInviteAttribution.inviterDisplayName && latestInviteAttribution.serverName
            ? `${latestInviteAttribution.inviterDisplayName} invited you through ${latestInviteAttribution.serverName}. Add your games and connect with the people already there so calls to play can start finding you.`
            : latestInviteAttribution.inviterLabel && latestInviteAttribution.serverName
              ? `${latestInviteAttribution.inviterLabel} invited you through ${latestInviteAttribution.serverName}. Add your games and connect with the people already there so calls to play can start finding you.`
              : latestInviteAttribution.serverName
                ? `You came in through ${latestInviteAttribution.serverName}. Add your games and start building connections with the people already there.`
                : 'You arrived from a Discord invite. Add your games and connect with people already on Game\'s Up so the app can start matching you.'}
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          {!inviterAlreadyFriend && latestInviteAttribution.inviterUserId ? (
            <Button color="primary" onClick={() => window.location.assign('/friends')}>
              Open friends
            </Button>
          ) : null}
          {!hasLibraryEntries ? (
            <Button variant="outlined" color="neutral" onClick={() => window.location.assign('/library')}>
              Build your library
            </Button>
          ) : null}
        </Stack>
      </Stack>
    </Card>
  ) : null

  return {
    layoutProps: {
      toastNotices,
      isSignedIn,
      showDebugView,
      onboarding: inviteAttributionOnboarding || showSignedInOnboarding ? (
        <Stack spacing={2}>
          {inviteAttributionOnboarding}
          {showSignedInOnboarding ? (
            <EmptyStateCard
              title="Your account is live, but it does not have any game data yet"
              body="The discovery and play sections are driven by matching games between your library and the libraries of your friends and others in your network. Since your freshly created account has not added games, friends, or availability yet, those sections will be empty until you start filling out your profile."
            />
          ) : null}
        </Stack>
      ) : undefined
    },
    gameDetailsViewProps: {
      isOpen: gameDetailsTarget != null,
      target: gameDetailsTarget,
      gameDetails: selectedGameDetailsKey ? (gameDetailsByKey[selectedGameDetailsKey] ?? null) : null,
      loading: selectedGameDetailsKey != null && gameDetailsLoadingKey === selectedGameDetailsKey,
      error: selectedGameDetailsKey ? (gameDetailsErrorByKey[selectedGameDetailsKey] ?? null) : null,
      openGameDetails,
      closeGameDetails
    },
    overviewViewProps: {
      error: state.error,
      session: state.session,
      discordEnabled: Boolean(discordProvider?.enabled),
      discordBotInstallUrl: discordProvider?.serverInstallUrl ?? discordProvider?.installUrl ?? null,
      isSignedIn,
      availableDiscoveryServers,
      addedFriendCount,
      hasSyncedDiscordServers: Boolean(state.discordServers?.servers.length),
      discordServerRefreshPending,
      serverPreferencePendingId,
      onLogout: handleLogout,
      onDiscordLogin: handleDiscordLogin,
      onRefreshDiscordServers: handleRefreshDiscordServers,
      onToggleDiscordServer: handleToggleDiscordServer,
      installPrompt: isSignedIn && installSupport
        ? {
            label: 'Install app',
            pending: installPromptPending,
            onInstall: handleInstallApp
          }
        : undefined,
      ...inviteOverviewProps
    },
    libraryViewProps: {
      ...libraryViewProps,
      error: state.error
    },
    friendsViewProps: {
      error: state.error,
      isSignedIn,
      friends: friendPeople,
      addableFriends: addableFriendPeople,
      friendsLists,
      friendsListMutationPending,
      onSaveFriendsList: handleSaveFriendsList,
      onDeleteFriendsList: handleDeleteFriendsList,
      selectedDiscoveryServers: playIntentDiscordServerOptions,
      noDiscoveryServersSelected,
      libraryGameIds,
      libraryEntryIdsByGameId,
      addingLibraryGameId,
      removingLibraryEntryId: libraryViewProps.removingLibraryEntryId,
      friendPendingId,
      onToggleFriend: handleToggleFriend,
      onAddGameToLibrary: openLibraryEditorForGame,
      onRemoveLibraryEntry: libraryViewProps.onRemoveLibraryEntry,
      mutedPlayIntentUserIds: playViewProps.mutedPlayIntentUserIds,
      onMutePlayIntentUser: playViewProps.onMutePlayIntentUser,
      onUnmutePlayIntentUser: playViewProps.onUnmutePlayIntentUser
    },
    playViewProps: {
      ...playViewProps,
      error: state.error,
      isSignedIn,
      isAdmin: Boolean(state.session?.user?.isAdmin),
      playIntentUnavailableAudienceMessage,
      discordAutoPromptPlayIntent: state.session?.user?.discordAutoPromptPlayIntent ?? true,
      discordAutoPromptPlayIntentSaving,
      discoveryPeople,
      friendPendingId,
      onToggleFriend: handleToggleFriend,
      libraryGameIds,
      addingLibraryGameId,
      onAddGameToLibrary: handleAddGameToLibrary,
      onToggleDiscordAutoPromptPlayIntent: handleDiscordAutoPromptPlayIntentChange
    },
    discoveryViewProps: {
      error: state.error,
      discoveryLoading: state.discovery === null && !state.error,
      overlapGames,
      browseGames,
      trendingGames: trendingLibraryGames,
      discoveryPeople,
      selectedDiscoveryServers: playIntentDiscordServerOptions,
      noDiscoveryServersSelected,
      isSignedIn,
      libraryGameIds,
      libraryEntryIdsByGameId,
      addingLibraryGameId,
      removingLibraryEntryId: libraryViewProps.removingLibraryEntryId,
      friendPendingId,
      onToggleFriend: handleToggleFriend,
      onAddGameToLibrary: openLibraryEditorForGame,
      onRemoveLibraryEntry: libraryViewProps.onRemoveLibraryEntry,
      mutedPlayIntentUserIds: playViewProps.mutedPlayIntentUserIds,
      onMutePlayIntentUser: playViewProps.onMutePlayIntentUser,
      onUnmutePlayIntentUser: playViewProps.onUnmutePlayIntentUser
    },
    debugViewProps: {
      error: state.error,
      isSignedIn,
      debugAdmin: state.debugAdmin,
      debugLoading: showDebugView && isSignedIn && state.debugAdmin == null && !state.error,
      onRefreshDebug: loadDashboard
    }
  }
}