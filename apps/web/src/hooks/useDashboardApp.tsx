import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import type {
  ActivePlayIntent,
  AuthProvidersResponse,
  AuthSessionResponse,
  DiscordServerPreferencesResponse,
  DiscoveryFeed,
  HealthResponse,
  LibraryResponse,
  PlayIntentCurrentResponse,
  PlayIntentFeed,
  UserProfileResponse
} from '@game-is-up/shared'
import {
  authProvidersResponseSchema,
  authSessionResponseSchema,
  discordServerPreferencesResponseSchema,
  discoveryFeedSchema,
  healthResponseSchema,
  libraryResponseSchema,
  playIntentCurrentResponseSchema,
  playIntentFeedSchema,
  userProfileResponseSchema
} from '@game-is-up/shared'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import type { FriendTarget, Notice } from '../components/dashboard/types'
import { useDashboardInvites } from './useDashboardInvites'
import { useDashboardLibrary } from './useDashboardLibrary'
import { useDashboardPlay } from './useDashboardPlay'

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const apiBaseUrl = configuredApiBaseUrl != null ? configuredApiBaseUrl.replace(/\/$/, '') : 'http://localhost:4000'
const apiReconnectPollMs = 5000
const mobileAuthRedirectUrl = 'gameisup://auth'

type LoadState = {
  activePlayIntent: ActivePlayIntent | null;
  session: AuthSessionResponse | null;
  auth: AuthProvidersResponse | null;
  discordServers: DiscordServerPreferencesResponse | null;
  discovery: DiscoveryFeed | null;
  health: HealthResponse | null;
  library: LibraryResponse | null;
  playIntents: PlayIntentFeed | null;
  error: string | null;
};

const initialState: LoadState = {
  activePlayIntent: null,
  session: null,
  auth: null,
  discordServers: null,
  discovery: null,
  health: null,
  library: null,
  playIntents: null,
  error: null
}

function useTimedNotice(notice: Notice | null, setNotice: Dispatch<SetStateAction<Notice | null>>) {
  useEffect(() => {
    if (!notice) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setNotice(null)
    }, 5000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [notice, setNotice])
}

function getBrowserTimeZoneId(): string | null {
  try {
    const timezoneId = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim()

    return timezoneId ? timezoneId : null
  } catch {
    return null
  }
}

function buildApiUrl(path: string): string {
  return `${apiBaseUrl}${path}`
}

export function useDashboardApp() {
  const [state, setState] = useState<LoadState>(initialState)
  const [authNotice, setAuthNotice] = useState<Notice | null>(null)
  const [actionNotice, setActionNotice] = useState<Notice | null>(null)
  const [profileNotice, setProfileNotice] = useState<Notice | null>(null)
  const [playIntentNotice, setPlayIntentNotice] = useState<Notice | null>(null)
  const [friendPendingId, setFriendPendingId] = useState<string | null>(null)
  const [serverPreferencePendingId, setServerPreferencePendingId] = useState<string | null>(null)
  const lastHandledAuthUrlRef = useRef<string | null>(null)
  const timezoneSyncPendingIdRef = useRef<string | null>(null)
  const isNativeApp = Capacitor.isNativePlatform()
  const browserTimeZoneId = getBrowserTimeZoneId()

  const isSignedIn = Boolean(state.session?.authenticated && state.session.user)
  const libraryEntries = state.library?.entries ?? []
  const discoveryGames = state.discovery?.games ?? []
  const discoveryPeople = state.discovery?.people ?? []
  const overlapGames = discoveryGames.filter((game) => game.sharedWithViewer)
  const browseGames = discoveryGames.filter((game) => !game.sharedWithViewer)
  const hasLibraryEntries = libraryEntries.length > 0
  const hasDiscoveryGames = discoveryGames.length > 0
  const hasDiscoveryPeople = discoveryPeople.length > 0
  const hasDiscoveryContent = hasDiscoveryGames || hasDiscoveryPeople
  const hasPlayIntentPreviews = Boolean(state.playIntents && state.playIntents.intents.length > 0)
  const showSignedInOnboarding = isSignedIn && !hasLibraryEntries && !hasDiscoveryContent && !hasPlayIntentPreviews
  const availableDiscoveryServers = (state.discordServers?.servers ?? []).filter((server) => server.botPresent)
  const selectedDiscoveryServerCount = availableDiscoveryServers.filter((server) => server.selected).length
  const noDiscoveryServersSelected = isSignedIn && availableDiscoveryServers.length > 0 && selectedDiscoveryServerCount === 0
  const discordProvider = state.auth?.providers.find((provider) => provider.id === 'discord') ?? null
  const currentUsualAvailability = state.library?.usualAvailability ?? state.session?.user?.usualAvailability ?? null

  const toastNotices = [
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

  const applyAuthNotice = useCallback((status: string, reason: string | null) => {
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
        message: 'Discord sign-in was canceled. Game Is Up currently needs Discord server access to build your mutual-server discovery graph. Direct Discord friend import is still pending Discord approval.'
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

  const loadDashboard = useCallback(async () => {
    const requestInit = {
      credentials: 'include' as const
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

      const [discoveryResponse, playIntentsResponse, libraryResponse, currentPlayIntentResponse] = await Promise.all([
        fetch(buildApiUrl('/api/discovery/feed'), requestInit),
        fetch(buildApiUrl('/api/play-intents/feed'), requestInit),
        parsedSession.authenticated ? fetch(buildApiUrl('/api/library/me'), requestInit) : Promise.resolve(null),
        parsedSession.authenticated ? fetch(buildApiUrl('/api/play-intents/me'), requestInit) : Promise.resolve(null)
      ])

      const [discoveryJson, playIntentsJson] = await Promise.all([
        discoveryResponse.json(),
        playIntentsResponse.json()
      ])

      const discordServersResponse = parsedSession.authenticated ? await fetch(buildApiUrl('/api/discord-servers/me'), requestInit) : null

      let library: LibraryResponse | null = null
      let activePlayIntentState: ActivePlayIntent | null = null
      let discordServers: DiscordServerPreferencesResponse | null = null

      if (libraryResponse) {
        const libraryJson = await libraryResponse.json()
        library = libraryResponseSchema.parse(libraryJson)
      }

      if (currentPlayIntentResponse) {
        const currentPlayIntentJson = (await currentPlayIntentResponse.json()) as PlayIntentCurrentResponse
        activePlayIntentState = playIntentCurrentResponseSchema.parse(currentPlayIntentJson).activeIntent
      }

      if (discordServersResponse) {
        const discordServersJson = await discordServersResponse.json()
        discordServers = discordServerPreferencesResponseSchema.parse(discordServersJson)
      }

      setState({
        activePlayIntent: activePlayIntentState,
        session: parsedSession,
        health: healthResponseSchema.parse(healthJson),
        auth: authProvidersResponseSchema.parse(authJson),
        discordServers,
        discovery: discoveryFeedSchema.parse(discoveryJson),
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

  const updateProfile = useCallback(async (profilePatch: { usualAvailability?: string; timezoneId?: string }) => {
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
      throw new Error(
        typeof responseBody === 'object' && responseBody && 'error' in responseBody && typeof responseBody.error === 'string'
          ? responseBody.error
          : 'Unable to update your profile right now.'
      )
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
              usualAvailability: parsedProfile.usualAvailability
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

  const setActivePlayIntent = useCallback((activePlayIntent: ActivePlayIntent | null) => {
    setState((current) => ({
      ...current,
      activePlayIntent
    }))
  }, [])

  const { profileSaving, libraryViewProps } = useDashboardLibrary({
    isSignedIn,
    buildApiUrl,
    libraryEntries,
    currentUsualAvailability,
    browserTimeZoneId,
    loadDashboard,
    updateProfile,
    applyProfileUpdate,
    setActionNotice,
    setProfileNotice
  })

  const { playViewProps } = useDashboardPlay({
    isSignedIn,
    buildApiUrl,
    activePlayIntent: state.activePlayIntent,
    libraryEntries,
    playIntentPreviews: state.playIntents?.intents ?? [],
    loadDashboard,
    setActivePlayIntent,
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

  const completeMobileAuth = useCallback(async (handoff: string) => {
    const response = await fetch(buildApiUrl('/api/auth/mobile-complete'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ handoff })
    })

    if (!response.ok) {
      const responseBody = (await response.json()) as { error?: string }
      throw new Error(responseBody.error ?? 'Unable to finish mobile sign-in.')
    }
  }, [])

  const handleAuthRedirect = useCallback(async (urlString: string, options?: { clearBrowserUrl?: boolean; closeBrowser?: boolean }) => {
    const url = new URL(urlString)
    const params = url.searchParams
    const auth = params.get('auth')
    const status = params.get('status')
    const reason = params.get('reason')
    const handoff = params.get('handoff')

    if (auth !== 'discord' || !status) {
      return false
    }

    try {
      if (status === 'success' && handoff) {
        await completeMobileAuth(handoff)
        await loadDashboard()
      }

      applyAuthNotice(status, reason)
    } catch (error) {
      setAuthNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to finish mobile sign-in.'
      })
    } finally {
      if (options?.closeBrowser && isNativeApp) {
        try {
          await Browser.close()
        } catch {
          // Browser.close is not supported in every native path.
        }
      }

      if (options?.clearBrowserUrl) {
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    }

    return true
  }, [applyAuthNotice, completeMobileAuth, isNativeApp, loadDashboard])

  useEffect(() => {
    void handleAuthRedirect(window.location.href, { clearBrowserUrl: true })
  }, [handleAuthRedirect])

  useEffect(() => {
    if (!isNativeApp) {
      return
    }

    let listener: { remove: () => Promise<void> } | null = null

    const handleNativeAuthUrl = async (urlString: string) => {
      if (lastHandledAuthUrlRef.current === urlString) {
        return
      }

      lastHandledAuthUrlRef.current = urlString
      await handleAuthRedirect(urlString, { closeBrowser: true })
    }

    const registerListener = async () => {
      listener = await CapacitorApp.addListener('appUrlOpen', (event) => {
        const url = new URL(event.url)

        if (url.protocol !== 'gameisup:' || url.host !== 'auth') {
          return
        }

        void handleNativeAuthUrl(event.url)
      })

      const launchUrl = await CapacitorApp.getLaunchUrl()

      if (launchUrl?.url) {
        const url = new URL(launchUrl.url)

        if (url.protocol === 'gameisup:' && url.host === 'auth') {
          await handleNativeAuthUrl(launchUrl.url)
        }
      }
    }

    void registerListener()

    return () => {
      if (listener) {
        void listener.remove()
      }
    }
  }, [handleAuthRedirect, isNativeApp])

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
    if (isNativeApp) {
      await Browser.open({
        url: buildApiUrl(`/api/auth/discord/login?returnTo=${encodeURIComponent(mobileAuthRedirectUrl)}`)
      })
      return
    }

    window.location.assign(buildApiUrl(`/api/auth/discord/login?returnTo=${encodeURIComponent(window.location.href)}`))
  }, [isNativeApp])

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
          message:
            typeof responseBody === 'object' && responseBody && 'error' in responseBody && typeof responseBody.error === 'string'
              ? responseBody.error
              : 'Unable to update this server setting right now.'
        })
        return
      }

      discordServerPreferencesResponseSchema.parse(responseBody)
      setActionNotice({
        tone: 'success',
        message: nextSelected ? 'That server will now help you find players.' : 'That server will no longer be used to find players.'
      })
      await loadDashboard()
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to update this server setting right now.'
      })
    } finally {
      setServerPreferencePendingId(null)
    }
  }, [loadDashboard])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  return {
    layoutProps: {
      toastNotices,
      onboarding: showSignedInOnboarding ? (
        <EmptyStateCard
          title="Your account is live, but it does not have any game data yet"
          body="Right now the discovery and play-intent sections are driven entirely by your own library overlap and friends list. Since your freshly created account has not added games, friends, or availability yet, those sections collapse to empty results instead of showing the seeded demo user experience."
          chips={['Add library flow live', 'Friends unlock overlap', 'Play intent needs games first']}
        />
      ) : undefined
    },
    overviewViewProps: {
      session: state.session,
      discordEnabled: Boolean(discordProvider?.enabled),
      hasDiscordScopeWarning: Boolean(discordProvider?.gatedScopes.length),
      isSignedIn,
      availableDiscoveryServers,
      hasSyncedDiscordServers: Boolean(state.discordServers?.servers.length),
      serverPreferencePendingId,
      onLogout: handleLogout,
      onDiscordLogin: handleDiscordLogin,
      onToggleDiscordServer: handleToggleDiscordServer,
      ...inviteOverviewProps
    },
    libraryViewProps,
    playViewProps,
    discoveryViewProps: {
      error: state.error,
      overlapGames,
      browseGames,
      discoveryPeople,
      noDiscoveryServersSelected,
      isSignedIn,
      friendPendingId,
      onToggleFriend: handleToggleFriend
    }
  }
}