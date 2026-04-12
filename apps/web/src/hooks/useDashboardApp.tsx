import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import type {
  ActivePlayIntent,
  AuthProvidersResponse,
  AuthSessionResponse,
  DebugAdminResponse,
  DiscordServerPreferencesResponse,
  DiscoveryFeed,
  HealthResponse,
  LibraryResponse,
  PlayIntentCurrentResponse,
  PlayIntentFeed,
  SteamLinkIntentResponse,
  UserProfileResponse
} from '@game-is-up/shared'
import {
  authProvidersResponseSchema,
  authSessionResponseSchema,
  debugAdminResponseSchema,
  discordServerPreferencesResponseSchema,
  discoveryFeedSchema,
  healthResponseSchema,
  libraryResponseSchema,
  playIntentCurrentResponseSchema,
  playIntentFeedSchema,
  steamLinkIntentResponseSchema,
  userProfileResponseSchema
} from '@game-is-up/shared'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import type { DashboardLibraryQuickAddGame, FriendTarget, Notice } from '../components/dashboard/types'
import { useDashboardInvites } from './useDashboardInvites'
import { useDashboardLibrary } from './useDashboardLibrary'
import { useDashboardPlay } from './useDashboardPlay'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const apiBaseUrl = configuredApiBaseUrl != null ? configuredApiBaseUrl.replace(/\/$/, '') : 'http://localhost:4000'
const apiReconnectPollMs = 5000
const mobileAuthRedirectUrl = 'gameisup://auth'
const emptyLibraryEntries: LibraryResponse['entries'] = []

type LoadState = {
  activePlayIntent: ActivePlayIntent | null;
  session: AuthSessionResponse | null;
  auth: AuthProvidersResponse | null;
  debugAdmin: DebugAdminResponse | null;
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
  debugAdmin: null,
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
  if (!apiBaseUrl) {
    if (typeof window === 'undefined') {
      return path
    }

    return new URL(path, window.location.origin).toString()
  }

  return `${apiBaseUrl}${path}`
}

function buildAbsoluteApiUrl(path: string): string {
  if (typeof window !== 'undefined') {
    return new URL(buildApiUrl(path), window.location.origin).toString()
  }

  return buildApiUrl(path)
}

function getInstallSupport(installPromptEvent: BeforeInstallPromptEvent | null): 'prompt' | 'ios-manual' | null {
  if (typeof window === 'undefined') {
    return null
  }

  if (installPromptEvent) {
    return 'prompt'
  }

  const userAgent = window.navigator.userAgent.toLowerCase()
  const isiOS = /iphone|ipad|ipod/.test(userAgent)
  const isSafari = /safari/.test(userAgent) && !/crios|fxios|edgios|chrome|android/.test(userAgent)

  if (isiOS && isSafari) {
    return 'ios-manual'
  }

  return null
}

function getIsInstalledBrowserApp(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const navigator = window.navigator as NavigatorWithStandalone

  return navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: window-controls-overlay)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
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
  const [addingLibraryGameId, setAddingLibraryGameId] = useState<string | null>(null)
  const [serverPreferencePendingId, setServerPreferencePendingId] = useState<string | null>(null)
  const lastHandledAuthUrlRef = useRef<string | null>(null)
  const timezoneSyncPendingIdRef = useRef<string | null>(null)
  const isNativeApp = Capacitor.isNativePlatform()
  const showDebugView = import.meta.env.DEV
  const browserTimeZoneId = getBrowserTimeZoneId()
  const isInstalledBrowserApp = getIsInstalledBrowserApp()
  const installSupport = !isNativeApp && !isInstalledBrowserApp ? getInstallSupport(installPromptEvent) : null

  const isSignedIn = Boolean(state.session?.authenticated && state.session.user)
  const libraryEntries = state.library?.entries ?? emptyLibraryEntries
  const suggestedLibraryGames = state.library?.suggestedGames ?? []
  const discoveryGames = state.discovery?.games ?? []
  const discoveryPeople = state.discovery?.people ?? []
  const playIntentFriendOptions = discoveryPeople
    .filter((person) => person.isFriend)
    .map((person) => ({
      id: person.id,
      handle: person.handle,
      displayName: person.displayName,
      avatarUrl: person.avatarUrl
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
  const addedFriendCount = playIntentFriendOptions.length
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
  const steamProvider = state.auth?.providers.find((provider) => provider.id === 'steam') ?? null
  const steamConnected = Boolean(state.session?.connectedProviders.includes('steam'))
  const currentUsualAvailability = state.library?.usualAvailability ?? state.session?.user?.usualAvailability ?? null
  const libraryGameIds = new Set<string>(libraryEntries.map((entry) => entry.gameId))
  const libraryEntryIdsByGameId = new Map<string, string>(libraryEntries.map((entry) => [entry.gameId, entry.id]))

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
        message: 'Discord sign-in was canceled. Game Is Up currently needs Discord server access to build your network and find people around you. Direct Discord friend import is still pending Discord approval.'
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
    if (isNativeApp || typeof window === 'undefined') {
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
  }, [isNativeApp])

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

      const [discoveryResponse, playIntentsResponse, libraryResponse, currentPlayIntentResponse, debugResponse] = await Promise.all([
        fetch(buildApiUrl('/api/discovery/feed'), requestInit),
        fetch(buildApiUrl('/api/play-intents/feed'), requestInit),
        parsedSession.authenticated ? fetch(buildApiUrl('/api/library/me'), requestInit) : Promise.resolve(null),
        parsedSession.authenticated ? fetch(buildApiUrl('/api/play-intents/me'), requestInit) : Promise.resolve(null),
        parsedSession.authenticated && showDebugView ? fetch(buildApiUrl('/api/debug/admin'), requestInit) : Promise.resolve(null)
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

      if (debugResponse) {
        const debugJson = await debugResponse.json()
        debugAdmin = debugAdminResponseSchema.parse(debugJson)
      }

      setState({
        activePlayIntent: activePlayIntentState,
        session: parsedSession,
        health: healthResponseSchema.parse(healthJson),
        auth: authProvidersResponseSchema.parse(authJson),
        debugAdmin,
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
  }, [showDebugView])

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

  const setActivePlayIntent = useCallback((activePlayIntent: ActivePlayIntent | null) => {
    setState((current) => ({
      ...current,
      activePlayIntent
    }))
  }, [])

  const handleAddGameToLibrary = useCallback(async ({ gameId, title, coverUrl, platformLabels }: DashboardLibraryQuickAddGame) => {
    const alreadyInLibrary = libraryEntries.some((entry) => entry.gameId === gameId)

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
          message:
            typeof responseBody === 'object' && responseBody && 'error' in responseBody && typeof responseBody.error === 'string'
              ? responseBody.error
              : `Unable to add ${title} right now.`
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
          returnTo: isNativeApp ? mobileAuthRedirectUrl : window.location.href
        })
      })

      const responseBody = (await response.json()) as SteamLinkIntentResponse | { error?: string }

      if (!response.ok) {
        setActionNotice({
          tone: 'danger',
          message:
            typeof responseBody === 'object' && responseBody && 'error' in responseBody && typeof responseBody.error === 'string'
              ? responseBody.error
              : 'Unable to start Steam linking right now.'
        })
        return
      }

      const parsed = steamLinkIntentResponseSchema.parse(responseBody)

      if (isNativeApp) {
        await Browser.open({
          url: parsed.authorizationUrl
        })
        return
      }

      window.location.assign(parsed.authorizationUrl)
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to start Steam linking right now.'
      })
    } finally {
      setSteamLinkPending(false)
    }
  }, [isNativeApp, isSignedIn, steamLinkPending])

  const { profileSaving, libraryViewProps, openLibraryEditorForGame } = useDashboardLibrary({
    isSignedIn,
    steamImportEnabled: Boolean(steamProvider?.enabled),
    steamConnected,
    steamLinkPending,
    buildApiUrl,
    libraryEntries,
    suggestedGames: suggestedLibraryGames,
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
    buildApiUrl,
    activePlayIntent: state.activePlayIntent,
    libraryEntries,
    playIntentFriendOptions,
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

    if ((auth !== 'discord' && auth !== 'steam') || !status) {
      return false
    }

    try {
      if (status === 'success') {
        if (auth === 'discord' && handoff) {
          await completeMobileAuth(handoff)
        }

        await loadDashboard()
      }

      applyAuthNotice(auth, status, reason)
    } catch (error) {
      setAuthNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : auth === 'steam' ? 'Unable to finish Steam linking.' : 'Unable to finish mobile sign-in.'
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
    const loginUrl = buildAbsoluteApiUrl(`/api/auth/discord/login?returnTo=${encodeURIComponent(isNativeApp ? mobileAuthRedirectUrl : window.location.href)}`)

    if (isNativeApp) {
      await Browser.open({
        url: loginUrl
      })
      return
    }

    window.location.assign(loginUrl)
  }, [isNativeApp])

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
        message: nextSelected ? 'Game Is Up will now use that server to find people.' : 'Game Is Up will no longer use that server to find people.'
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
      showDebugView,
      installPrompt: installSupport
        ? {
            label: 'Install app',
            pending: installPromptPending,
            onInstall: handleInstallApp
          }
        : undefined,
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
      discordBotInstallUrl: discordProvider?.installUrl ?? null,
      hasDiscordScopeWarning: Boolean(discordProvider?.gatedScopes.length),
      isSignedIn,
      availableDiscoveryServers,
      addedFriendCount,
      hasSyncedDiscordServers: Boolean(state.discordServers?.servers.length),
      serverPreferencePendingId,
      onLogout: handleLogout,
      onDiscordLogin: handleDiscordLogin,
      onToggleDiscordServer: handleToggleDiscordServer,
      ...inviteOverviewProps
    },
    libraryViewProps,
    playViewProps: {
      ...playViewProps,
      isSignedIn,
      discordAutoPromptPlayIntent: state.session?.user?.discordAutoPromptPlayIntent ?? true,
      discordAutoPromptPlayIntentSaving,
      libraryGameIds,
      addingLibraryGameId,
      onAddGameToLibrary: handleAddGameToLibrary,
      onToggleDiscordAutoPromptPlayIntent: handleDiscordAutoPromptPlayIntentChange
    },
    discoveryViewProps: {
      error: state.error,
      overlapGames,
      browseGames,
      discoveryPeople,
      noDiscoveryServersSelected,
      isSignedIn,
      libraryGameIds,
      libraryEntryIdsByGameId,
      addingLibraryGameId,
      removingLibraryEntryId: libraryViewProps.removingLibraryEntryId,
      friendPendingId,
      onToggleFriend: handleToggleFriend,
      onAddGameToLibrary: openLibraryEditorForGame,
      onRemoveLibraryEntry: libraryViewProps.onRemoveLibraryEntry
    },
    debugViewProps: {
      isSignedIn,
      debugAdmin: state.debugAdmin,
      debugLoading: showDebugView && isSignedIn && state.debugAdmin == null && !state.error,
      onRefreshDebug: loadDashboard
    }
  }
}