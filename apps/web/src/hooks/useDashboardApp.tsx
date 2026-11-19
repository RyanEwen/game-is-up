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
  AuthProvidersResponse,
  DiscordServerPreferencesResponse,
  DiscoveryGame,
  DiscoveryPerson,
  DiscoveryPersonGame,
  LibraryEntry,
  LibraryResponse,
  UserProfileResponse,
} from '@game-is-up/shared'
import { buildApiIssueMessage } from '../components/dashboard/apiIssue'
import {
  gameDetailsResponseSchema,
  libraryResponseSchema,
  steamLinkIntentResponseSchema,
  userProfileResponseSchema,
} from '@game-is-up/shared'
import { Button, Card, Chip, Stack, Typography } from '@mui/joy'
import SportsEsportsRoundedIcon from '@mui/icons-material/SportsEsportsRounded'
import { EmptyState } from '@dynamic-solutions-canada/web-app-kit'
import type {
  DashboardGameDetailsTarget,
  DashboardLibraryQuickAddGame,
  Notice,
} from '../components/dashboard/types'
import { useDashboardInvites } from './useDashboardInvites'
import { useDashboardLibrary } from './useDashboardLibrary'
import { useDashboardPlay } from './useDashboardPlay'
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiRequest, noResponseBody } from '../lib/apiQuery'
import { queryKeys } from '../lib/queryKeys'
import { useDashboardData } from './useDashboardData'
import { useDashboardNetworkActions } from './useDashboardNetworkActions'
import { useDashboardSseInvalidation } from './useDashboardSseInvalidation'
import { useTimedNotice } from './useTimedNotice'
import { checkForAppUpdate } from '../lib/appUpdate'
import { buildAbsoluteApiUrl, buildApiUrl } from '../lib/apiUrl'
import {
  type BeforeInstallPromptEvent,
  getBrowserTimeZoneId,
  getInstallSupport,
  getIsInstalledBrowserApp,
} from '../lib/browserEnv'
import { useNow } from './useNow'

const emptyLibraryEntries: LibraryResponse['entries'] = []
const inviteAttributionOnboardingWindowMs = 14 * 24 * 60 * 60 * 1000

export function useDashboardApp() {
  const { state, refreshDashboard, invalidateDomains, applyProfileToCache } =
    useDashboardData()
  // What each kind of change refreshes once the server has accepted it.
  const refreshNetwork = useCallback(
    () => invalidateDomains(['network']),
    [invalidateDomains],
  )
  const refreshPlay = useCallback(
    () => invalidateDomains(['play-intents', 'discovery']),
    [invalidateDomains],
  )
  const refreshLibrary = useCallback(
    () => invalidateDomains(['library', 'profile']),
    [invalidateDomains],
  )
  const [authNotice, setAuthNotice] = useState<Notice | null>(null)
  const [actionNotice, setActionNotice] = useState<Notice | null>(null)
  const now = useNow()
  const [profileNotice, setProfileNotice] = useState<Notice | null>(null)
  const [playIntentNotice, setPlayIntentNotice] = useState<Notice | null>(null)
  const [
    discordAutoPromptPlayIntentSaving,
    setDiscordAutoPromptPlayIntentSaving,
  ] = useState(false)
  const [installPromptEvent, setInstallPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [installPromptPending, setInstallPromptPending] = useState(false)
  const [gameDetailsTarget, setGameDetailsTarget] =
    useState<DashboardGameDetailsTarget | null>(null)
  const timezoneSyncPendingIdRef = useRef<string | null>(null)
  const sseRefreshTimeoutIdRef = useRef<number | null>(null)
  const sseDeferredRefreshRef = useRef(false)
  const ssePendingDomainsRef = useRef(new Set<string>())
  const showDebugView = Boolean(state.session?.user?.isAdmin)
  const browserTimeZoneId = getBrowserTimeZoneId()
  const isInstalledBrowserApp = getIsInstalledBrowserApp()
  const installSupport = !isInstalledBrowserApp
    ? getInstallSupport(installPromptEvent)
    : null

  const isSignedIn = Boolean(state.session?.authenticated && state.session.user)
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
      avatarUrl: person.avatarUrl,
    }))
    .sort(
      (
        left: {
          id: string
          handle: string
          displayName: string
          avatarUrl: string | null
        },
        right: {
          id: string
          handle: string
          displayName: string
          avatarUrl: string | null
        },
      ) => left.displayName.localeCompare(right.displayName),
    )
  const addedFriendCount = playIntentFriendOptions.length
  const overlapGames = discoveryGames.filter(
    (game: DiscoveryGame) => game.sharedWithViewer,
  )
  const browseGames = discoveryGames.filter(
    (game: DiscoveryGame) => !game.sharedWithViewer,
  )
  const hasLibraryEntries = libraryEntries.length > 0
  const hasDiscoveryGames = discoveryGames.length > 0
  const hasDiscoveryPeople = discoveryPeople.length > 0
  const hasDiscoveryContent = hasDiscoveryGames || hasDiscoveryPeople
  const hasPlayIntentPreviews = Boolean(
    state.playIntents &&
    state.playIntents.intents.some(
      (intent) => intent.status === 'active' && intent.appliesToViewer,
    ),
  )
  const showSignedInOnboarding =
    isSignedIn &&
    !hasLibraryEntries &&
    !hasDiscoveryContent &&
    !hasPlayIntentPreviews
  const availableDiscoveryServers = (
    state.discordServers?.servers ?? []
  ).filter(
    (server: DiscordServerPreferencesResponse['servers'][number]) =>
      server.botPresent,
  )
  const playIntentDiscordServerOptions = availableDiscoveryServers.filter(
    (server: DiscordServerPreferencesResponse['servers'][number]) =>
      server.selected,
  )
  const selectedDiscoveryServerCount = availableDiscoveryServers.filter(
    (server: DiscordServerPreferencesResponse['servers'][number]) =>
      server.selected,
  ).length
  const noDiscoveryServersSelected =
    isSignedIn &&
    availableDiscoveryServers.length > 0 &&
    selectedDiscoveryServerCount === 0
  const libraryGameIds = new Set<string>(
    libraryEntries.map((entry: LibraryEntry) => entry.gameId),
  )
  const libraryEntryIdsByGameId = new Map<string, string>(
    libraryEntries.map((entry: LibraryEntry) => [entry.gameId, entry.id]),
  )
  const hasLoadedAudienceContext = state.discovery != null
  const playIntentDefaultAudienceCount = discoveryPeople.filter(
    (person: DiscoveryPerson) =>
      person.games.some((game: DiscoveryPersonGame) =>
        libraryGameIds.has(game.id),
      ),
  ).length
  const playIntentUnavailableAudienceMessage =
    hasLoadedAudienceContext &&
    isSignedIn &&
    !state.activePlayIntent &&
    hasLibraryEntries &&
    playIntentDefaultAudienceCount === 0
      ? noDiscoveryServersSelected
        ? 'You do not have any Discord servers in your network right now, so nobody can receive a call to play. Select at least one Discord server to form your network first.'
        : discoveryPeople.length === 0
          ? 'You do not have anyone in your network who can receive a call to play yet. Select at least one Discord server to form your network first.'
          : 'Nobody in your network has games in their library that match yours, so nobody can receive a call to play yet. Add more games to your library or wait for others to add more that match yours.'
      : null
  const discordProvider =
    state.auth?.providers.find(
      (provider: AuthProvidersResponse['providers'][number]) =>
        provider.id === 'discord',
    ) ?? null
  const steamProvider =
    state.auth?.providers.find(
      (provider: AuthProvidersResponse['providers'][number]) =>
        provider.id === 'steam',
    ) ?? null
  const steamConnected = Boolean(
    state.session?.connectedProviders.includes('steam'),
  )
  const currentUsualAvailability =
    state.library?.usualAvailability ??
    state.session?.user?.usualAvailability ??
    null
  const friendPeople = [...discoveryPeople]
    .filter((person) => person.isFriend)
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
  const addableFriendPeople = [...discoveryPeople]
    .filter((person) => person.friendEligible)
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
  const friendsLists = state.friendsLists
  const latestInviteAttribution = state.session?.inviteAttribution ?? null
  const latestInviteAcceptedAt = latestInviteAttribution
    ? new Date(latestInviteAttribution.acceptedAt).getTime()
    : 0
  const hasRecentInviteAttribution =
    latestInviteAttribution != null &&
    Number.isFinite(latestInviteAcceptedAt) &&
    now - latestInviteAcceptedAt <= inviteAttributionOnboardingWindowMs
  const inviterAlreadyFriend =
    latestInviteAttribution?.inviterUserId != null
      ? friendPeople.some(
          (person) => person.id === latestInviteAttribution.inviterUserId,
        )
      : false
  const showInviteAttributionOnboarding =
    isSignedIn &&
    hasRecentInviteAttribution &&
    (showSignedInOnboarding || !inviterAlreadyFriend)
  const toastNotices = [
    state.error
      ? {
          id: 'api-issue',
          notice: {
            tone: 'warning' as const,
            message: buildApiIssueMessage(state.error),
          },
        }
      : null,
    actionNotice
      ? {
          id: 'action',
          notice: actionNotice,
          dismiss: () => setActionNotice(null),
        }
      : null,
    authNotice
      ? { id: 'auth', notice: authNotice, dismiss: () => setAuthNotice(null) }
      : null,
    profileNotice
      ? {
          id: 'profile',
          notice: profileNotice,
          dismiss: () => setProfileNotice(null),
        }
      : null,
    playIntentNotice
      ? {
          id: 'play-intent',
          notice: playIntentNotice,
          dismiss: () => setPlayIntentNotice(null),
        }
      : null,
  ].filter(
    (toast): toast is { id: string; notice: Notice; dismiss: () => void } =>
      toast != null,
  )

  const applyAuthNotice = useCallback(
    (auth: string, status: string, reason: string | null) => {
      if (auth === 'steam') {
        if (status === 'success') {
          setAuthNotice({
            tone: 'success',
            message:
              'Steam account connected. Review the import list and choose which games to add.',
          })
          return
        }

        setAuthNotice({
          tone: 'danger',
          message: `Steam link failed${reason ? `: ${reason}` : '.'}`,
        })
        return
      }

      if (status === 'success') {
        setAuthNotice({
          tone: 'success',
          message: 'Signed in with Discord.',
        })
        return
      }

      if (reason === 'access_denied') {
        setAuthNotice({
          tone: 'danger',
          message:
            "Discord sign-in was canceled. Game's Up needs your Discord connection to sync servers and keep your network current.",
        })
        return
      }

      setAuthNotice({
        tone: 'danger',
        message: `Discord sign-in failed${reason ? `: ${reason}` : '.'}`,
      })
    },
    [],
  )

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
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      )
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  /**
   * Refresh what a server event changed, a quarter-second later so a burst of events becomes
   * one refresh. While the tab is hidden or offline, the domains are collected and refreshed
   * when it comes back. Called with no domains, it only flushes what is already pending.
   */
  const scheduleDashboardRefreshFromInvalidation = useCallback(
    (domains: readonly string[] = []) => {
      if (typeof window === 'undefined') {
        return
      }

      for (const domain of domains) {
        ssePendingDomainsRef.current.add(domain)
      }

      if (ssePendingDomainsRef.current.size === 0) {
        return
      }

      if (
        window.navigator.onLine === false ||
        document.visibilityState !== 'visible'
      ) {
        sseDeferredRefreshRef.current = true
        return
      }

      if (sseRefreshTimeoutIdRef.current != null) {
        return
      }

      sseRefreshTimeoutIdRef.current = window.setTimeout(() => {
        sseRefreshTimeoutIdRef.current = null
        sseDeferredRefreshRef.current = false
        const pending = [...ssePendingDomainsRef.current]
        ssePendingDomainsRef.current.clear()
        void invalidateDomains(pending)
      }, 250)
    },
    [invalidateDomains],
  )

  const profileMutation = useMutation({
    mutationFn: (profilePatch: {
      usualAvailability?: string
      timezoneId?: string
      discordAutoPromptPlayIntent?: boolean
    }) =>
      apiRequest(
        '/api/profile/me',
        userProfileResponseSchema,
        'Unable to update your profile right now.',
        { method: 'PUT', body: JSON.stringify(profilePatch) },
      ),
  })
  const { mutateAsync: updateProfile } = profileMutation

  const quickAddMutation = useMutation({
    mutationFn: (variables: {
      gameId: string
      body: Record<string, unknown>
    }) =>
      apiRequest(
        '/api/library/me',
        libraryResponseSchema,
        'Unable to add that game right now.',
        { method: 'POST', body: JSON.stringify(variables.body) },
      ),
  })
  const addingLibraryGameId = quickAddMutation.isPending
    ? (quickAddMutation.variables?.gameId ?? null)
    : null

  const steamLinkMutation = useMutation({
    mutationFn: (returnTo: string) =>
      apiRequest(
        '/api/auth/steam/link-intent',
        steamLinkIntentResponseSchema,
        'Unable to start Steam linking right now.',
        { method: 'POST', body: JSON.stringify({ returnTo }) },
      ),
  })
  const steamLinkPending = steamLinkMutation.isPending

  const applyProfileUpdate = useCallback(
    (parsedProfile: UserProfileResponse) => {
      timezoneSyncPendingIdRef.current = parsedProfile.timezoneId
      applyProfileToCache(parsedProfile)
    },
    [applyProfileToCache],
  )

  const handleDiscordAutoPromptPlayIntentChange = useCallback(
    async (nextEnabled: boolean) => {
      if (!isSignedIn || discordAutoPromptPlayIntentSaving) {
        return
      }

      setDiscordAutoPromptPlayIntentSaving(true)
      setProfileNotice(null)

      try {
        const parsedProfile = await updateProfile({
          discordAutoPromptPlayIntent: nextEnabled,
        })

        applyProfileUpdate(parsedProfile)
        setProfileNotice({
          tone: 'success',
          message: nextEnabled
            ? 'Discord can now prompt you to create a call to play when it sees you start a game.'
            : 'Automatic Discord call-to-play prompts are now off.',
        })
        await invalidateDomains(['profile'])
      } catch (error) {
        setProfileNotice({
          tone: 'danger',
          message:
            error instanceof Error
              ? error.message
              : 'Unable to update your Discord prompt setting right now.',
        })
      } finally {
        setDiscordAutoPromptPlayIntentSaving(false)
      }
    },
    [
      applyProfileUpdate,
      discordAutoPromptPlayIntentSaving,
      invalidateDomains,
      isSignedIn,
      updateProfile,
    ],
  )

  const handleAddGameToLibrary = useCallback(
    async ({
      gameId,
      title,
      coverUrl,
      platformLabels,
    }: DashboardLibraryQuickAddGame) => {
      const alreadyInLibrary = libraryEntries.some(
        (entry: LibraryEntry) => entry.gameId === gameId,
      )

      if (!isSignedIn) {
        setActionNotice({
          tone: 'danger',
          message: 'Sign in before adding games to your library.',
        })
        return
      }

      if (alreadyInLibrary) {
        setActionNotice({
          tone: 'neutral',
          message: `${title} is already in your library.`,
        })
        return
      }

      const normalizedPlatformLabels = [
        ...new Set(
          platformLabels
            .map((platformLabel) => platformLabel.trim())
            .filter(Boolean),
        ),
      ]

      if (normalizedPlatformLabels.length === 0) {
        setActionNotice({
          tone: 'danger',
          message: `Unable to add ${title} because it does not have any platform data yet.`,
        })
        return
      }

      setActionNotice(null)

      try {
        await quickAddMutation.mutateAsync({
          gameId,
          body: {
            title,
            platformLabels: normalizedPlatformLabels,
            intent: 'interested',
            catalogMatch: {
              source: 'local',
              sourceId: gameId,
              title,
              coverUrl,
              platformLabels: normalizedPlatformLabels,
            },
          },
        })
      } catch (error) {
        setActionNotice({
          tone: 'danger',
          message:
            error instanceof Error && error.message
              ? error.message
              : `Unable to add ${title} right now.`,
        })
        return
      }

      setActionNotice({
        tone: 'success',
        message: `${title} was added to your library.`,
      })
      await invalidateDomains(['library'])
    },
    [invalidateDomains, isSignedIn, libraryEntries, quickAddMutation],
  )

  const handleSteamLink = useCallback(async () => {
    if (!isSignedIn || steamLinkPending) {
      return
    }

    setActionNotice(null)
    setAuthNotice(null)

    try {
      const parsed = await steamLinkMutation.mutateAsync(window.location.href)
      window.location.assign(parsed.authorizationUrl)
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message:
          error instanceof Error && error.message
            ? error.message
            : 'Unable to start Steam linking right now.',
      })
    }
  }, [isSignedIn, steamLinkMutation, steamLinkPending])

  const { profileSaving, libraryViewProps, openLibraryEditorForGame } =
    useDashboardLibrary({
      isSignedIn,
      steamImportEnabled: Boolean(steamProvider?.enabled),
      steamConnected,
      steamLinkPending,
      libraryEntries,
      suggestedGames: suggestedLibraryGames,
      trendingGames: trendingLibraryGames,
      libraryGameIds,
      addingLibraryGameId,
      currentUsualAvailability,
      browserTimeZoneId,
      refreshAfterChange: refreshLibrary,
      updateProfile,
      applyProfileUpdate,
      setActionNotice,
      setProfileNotice,
      onStartSteamLink: handleSteamLink,
      onAddGameToLibrary: handleAddGameToLibrary,
    })

  const { playViewProps } = useDashboardPlay({
    isSignedIn,
    isAdmin: Boolean(state.session?.user?.isAdmin),
    activePlayIntent: state.activePlayIntent,
    libraryEntries,
    discoveryPeople,
    playIntentFriendOptions,
    friendsLists,
    playIntentDiscordServerOptions,
    playIntentPreviews: state.playIntents?.intents ?? [],
    refreshAfterChange: refreshPlay,
    setPlayIntentNotice,
  })

  const { inviteOverviewProps } = useDashboardInvites({
    session: state.session,
    isSignedIn,
    availableDiscoveryServers,
    setActionNotice,
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        sseDeferredRefreshRef.current
      ) {
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
    onOpen: checkForAppUpdate,
  })

  useEffect(() => {
    if (!isSignedIn || !browserTimeZoneId || profileSaving) {
      return
    }

    const currentTimezoneId = state.session?.user?.timezoneId ?? null

    if (
      currentTimezoneId === browserTimeZoneId ||
      timezoneSyncPendingIdRef.current === browserTimeZoneId
    ) {
      return
    }

    timezoneSyncPendingIdRef.current = browserTimeZoneId

    void (async () => {
      try {
        const parsedProfile = await updateProfile({
          timezoneId: browserTimeZoneId,
        })

        applyProfileUpdate(parsedProfile)
        await invalidateDomains(['profile'])
      } catch {
        timezoneSyncPendingIdRef.current = null
      }
    })()
  }, [
    applyProfileUpdate,
    browserTimeZoneId,
    invalidateDomains,
    isSignedIn,
    profileSaving,
    state.session?.user?.timezoneId,
    updateProfile,
  ])

  const handleAuthRedirect = useCallback(
    async (urlString: string, options?: { clearBrowserUrl?: boolean }) => {
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
          await refreshDashboard()
        }

        applyAuthNotice(auth, status, reason)
      } catch (error) {
        setAuthNotice({
          tone: 'danger',
          message:
            error instanceof Error
              ? error.message
              : auth === 'steam'
                ? 'Unable to finish Steam linking.'
                : 'Unable to finish sign-in.',
        })
      } finally {
        if (options?.clearBrowserUrl) {
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          )
        }
      }

      return true
    },
    [applyAuthNotice, refreshDashboard],
  )

  // Read the OAuth result from the URL once on load and clear it from the address bar. This
  // synchronises with the browser URL, which is what effects are for, so the rule is waived here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync with the browser URL
    void handleAuthRedirect(window.location.href, { clearBrowserUrl: true })
  }, [handleAuthRedirect])

  const handleLogout = useCallback(async () => {
    try {
      await apiRequest(
        '/api/auth/logout',
        noResponseBody,
        'Unable to sign out right now.',
        { method: 'POST' },
      )
    } finally {
      // As before, reload whatever the answer: the page reflects the session the server now has.
      window.location.reload()
    }
  }, [])

  const handleDiscordLogin = useCallback(async () => {
    const loginUrl = buildAbsoluteApiUrl(
      `/api/auth/discord/login?returnTo=${encodeURIComponent(window.location.href)}`,
    )

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
        message: "Open Safari's Share menu and choose Add to Home Screen.",
      })
      return
    }

    if (!installPromptEvent) {
      setActionNotice({
        tone: 'neutral',
        message:
          'Open your browser menu and choose Install app or Add to Home screen.',
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

  // Details of the game whose dialog is open, cached per game (errors too, as before).
  const gameDetailsQuery = useQuery({
    queryKey: queryKeys.gameDetails(
      gameDetailsTarget?.source ?? '',
      gameDetailsTarget?.sourceId ?? '',
    ),
    queryFn: () =>
      apiRequest(
        `/api/library/catalog/${encodeURIComponent(gameDetailsTarget!.source)}/${encodeURIComponent(gameDetailsTarget!.sourceId)}/details`,
        gameDetailsResponseSchema,
        'Unable to load game details right now.',
      ),
    enabled: gameDetailsTarget !== null,
  })

  const {
    friendPendingId,
    friendsListMutationPending,
    serverPreferencePendingId,
    discordServerRefreshPending,
    handleToggleFriend,
    handleSaveFriendsList,
    handleDeleteFriendsList,
    handleToggleDiscordServer,
    handleRefreshDiscordServers,
  } = useDashboardNetworkActions({
    refreshAfterChange: refreshNetwork,
    setActionNotice,
  })

  const inviteAttributionOnboarding =
    showInviteAttributionOnboarding && latestInviteAttribution ? (
      <Card
        variant="soft"
        sx={{
          p: 3,
          border: '1px solid #272f3c',
          backgroundColor: '#0b1220',
        }}
      >
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Chip color="primary" variant="soft">
              Discord invite
            </Chip>
            {latestInviteAttribution.kind === 'direct' ? (
              <Chip color="warning" variant="soft">
                Direct invite
              </Chip>
            ) : null}
            {latestInviteAttribution.serverName ? (
              <Chip color="neutral" variant="outlined">
                {latestInviteAttribution.serverName}
              </Chip>
            ) : null}
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
            {latestInviteAttribution.inviterDisplayName &&
            latestInviteAttribution.serverName
              ? `${latestInviteAttribution.inviterDisplayName} invited you through ${latestInviteAttribution.serverName}. Add your games and connect with the people already there so calls to play can start finding you.`
              : latestInviteAttribution.inviterLabel &&
                  latestInviteAttribution.serverName
                ? `${latestInviteAttribution.inviterLabel} invited you through ${latestInviteAttribution.serverName}. Add your games and connect with the people already there so calls to play can start finding you.`
                : latestInviteAttribution.serverName
                  ? `You came in through ${latestInviteAttribution.serverName}. Add your games and start building connections with the people already there.`
                  : "You arrived from a Discord invite. Add your games and connect with people already on Game's Up so the app can start matching you."}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {!inviterAlreadyFriend && latestInviteAttribution.inviterUserId ? (
              <Button
                color="primary"
                onClick={() => window.location.assign('/friends')}
              >
                Open friends
              </Button>
            ) : null}
            {!hasLibraryEntries ? (
              <Button
                variant="outlined"
                color="neutral"
                onClick={() => window.location.assign('/library')}
              >
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
      onboarding:
        inviteAttributionOnboarding || showSignedInOnboarding ? (
          <Stack spacing={2}>
            {inviteAttributionOnboarding}
            {showSignedInOnboarding ? (
              <EmptyState
                icon={<SportsEsportsRoundedIcon />}
                title="Your account is live, but it does not have any game data yet"
                description="The discovery and play sections are driven by matching games between your library and the libraries of your friends and others in your network. Since your freshly created account has not added games, friends, or availability yet, those sections will be empty until you start filling out your profile."
              />
            ) : null}
          </Stack>
        ) : undefined,
    },
    gameDetailsViewProps: {
      isOpen: gameDetailsTarget != null,
      target: gameDetailsTarget,
      gameDetails: gameDetailsQuery.data?.game ?? null,
      loading: gameDetailsQuery.isFetching,
      error: gameDetailsQuery.error?.message ?? null,
      openGameDetails,
      closeGameDetails,
    },
    overviewViewProps: {
      error: state.error,
      session: state.session,
      discordEnabled: Boolean(discordProvider?.enabled),
      discordBotInstallUrl:
        discordProvider?.serverInstallUrl ??
        discordProvider?.installUrl ??
        null,
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
      installPrompt:
        isSignedIn && installSupport
          ? {
              label: 'Install app',
              pending: installPromptPending,
              onInstall: handleInstallApp,
            }
          : undefined,
      ...inviteOverviewProps,
    },
    libraryViewProps: {
      ...libraryViewProps,
      error: state.error,
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
      onUnmutePlayIntentUser: playViewProps.onUnmutePlayIntentUser,
    },
    playViewProps: {
      ...playViewProps,
      error: state.error,
      isSignedIn,
      isAdmin: Boolean(state.session?.user?.isAdmin),
      playIntentUnavailableAudienceMessage,
      discordAutoPromptPlayIntent:
        state.session?.user?.discordAutoPromptPlayIntent ?? true,
      discordAutoPromptPlayIntentSaving,
      discoveryPeople,
      friendPendingId,
      onToggleFriend: handleToggleFriend,
      libraryGameIds,
      addingLibraryGameId,
      onAddGameToLibrary: handleAddGameToLibrary,
      onToggleDiscordAutoPromptPlayIntent:
        handleDiscordAutoPromptPlayIntentChange,
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
      onUnmutePlayIntentUser: playViewProps.onUnmutePlayIntentUser,
    },
    debugViewProps: {
      error: state.error,
      isSignedIn,
      debugAdmin: state.debugAdmin,
      debugLoading:
        showDebugView && isSignedIn && state.debugAdmin == null && !state.error,
      onRefreshDebug: refreshDashboard,
    },
  }
}
