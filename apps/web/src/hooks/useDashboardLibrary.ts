/**
 * Library-page data and actions hook used by `useDashboardApp`.
 *
 * Loads the persisted library, the suggestion + trending sections, and the
 * Steam-import preview. Owns the search-and-add flow against the shared game
 * catalog (including diacritic-tolerant matching), the platform-tag editor,
 * the per-game intent toggles (own / wishlist / hide), and refresh
 * invalidations triggered by SSE.
 */

import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  GameSearchResponse,
  GameSearchResult,
  ImportSteamLibrarySelectionRequest,
  LibraryEntry,
  LibraryEntryIntent,
  LibrarySuggestedGame,
  LibraryTrendingGame,
  LibraryResponse,
  UserGameAlias,
  UserPlatformAlias,
  SteamLibraryImportPreviewResponse,
  UserProfileResponse
} from '@game-is-up/shared'
import {
  extractErrorMessage,
  gameSearchResponseSchema,
  libraryResponseSchema,
  steamLibraryImportPreviewResponseSchema,
  userGameAliasesResponseSchema,
  userPlatformAliasesResponseSchema
} from '@game-is-up/shared'
import type { DashboardLibraryQuickAddGame, Notice } from '../components/dashboard/types'
import { useLocation } from 'react-router-dom'

const defaultPlatformOptions = ['PC', 'Xbox', 'PlayStation', 'Switch', 'Mobile', 'macOS', 'Linux'] as const

export type DashboardLibraryViewProps = {
  isSignedIn: boolean;
  steamImportEnabled: boolean;
  steamConnected: boolean;
  steamLinkPending: boolean;
  steamPreviewLoading: boolean;
  steamImporting: boolean;
  steamDisconnectPending: boolean;
  isSteamImportModalOpen: boolean;
  steamImportPreview: SteamLibraryImportPreviewResponse | null;
  onStartSteamLink: () => Promise<void>;
  onOpenSteamImport: () => Promise<void>;
  onCloseSteamImport: () => void;
  onRefreshSteamImport: () => Promise<void>;
  onImportSteamGames: (games: ImportSteamLibrarySelectionRequest['games']) => Promise<void>;
  onDisconnectSteam: () => Promise<void>;
  usualAvailability: string;
  profileSaving: boolean;
  usualAvailabilityChanged: boolean;
  usualAvailabilityButtonLabel: string;
  usualAvailabilityHelperText: string;
  onUsualAvailabilityChange: (value: string) => void;
  onSaveUsualAvailability: () => Promise<void>;
  isLibraryEditorOpen: boolean;
  openLibraryEditor: () => void;
  closeLibraryEditor: () => void;
  editingLibraryEntry: LibraryEntry | null;
  libraryTitle: string;
  onLibraryTitleChange: (value: string) => void;
  selectedCatalogResult: GameSearchResult | null;
  gameSuggestions: GameSearchResponse['results'];
  gameSuggestionsLoading: boolean;
  onSelectSuggestion: (result: GameSearchResult) => void;
  platformOptions: string[];
  selectedPlatformLabels: string[];
  onTogglePlatformLabel: (platform: string) => void;
  libraryIntent: LibraryEntryIntent;
  onLibraryIntentChange: (intent: LibraryEntryIntent) => void;
  currentUsualAvailability: string | null;
  libraryAvailability: string;
  onLibraryAvailabilityChange: (value: string) => void;
  librarySaving: boolean;
  onAddLibraryEntry: () => Promise<void>;
  onCancelLibraryEdit: () => void;
  libraryEntries: LibraryEntry[];
  suggestedGames: LibrarySuggestedGame[];
  trendingGames: LibraryTrendingGame[];
  platformAliases: UserPlatformAlias[];
  gameAliases: UserGameAlias[];
  aliasSavingKey: string | null;
  onSavePlatformAlias: (platform: string, aliasValue: string) => Promise<void>;
  onDeletePlatformAlias: (platform: string) => Promise<void>;
  onSaveGameAlias: (gameId: string, aliasValue: string) => Promise<void>;
  onDeleteGameAlias: (gameId: string) => Promise<void>;
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  editingLibraryEntryId: string | null;
  removingLibraryEntryId: string | null;
  onEditLibraryEntry: (entry: LibraryEntry) => void;
  onRemoveLibraryEntry: (entryId: string) => Promise<void>;
  onAddGameToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
}

export function useDashboardLibrary({
  isSignedIn,
  steamImportEnabled,
  steamConnected,
  steamLinkPending,
  buildApiUrl,
  libraryEntries,
  suggestedGames,
  trendingGames,
  libraryGameIds,
  addingLibraryGameId,
  currentUsualAvailability,
  browserTimeZoneId,
  loadDashboard,
  updateProfile,
  applyProfileUpdate,
  setActionNotice,
  setProfileNotice,
  onStartSteamLink,
  onAddGameToLibrary
}: {
  isSignedIn: boolean;
  steamImportEnabled: boolean;
  steamConnected: boolean;
  steamLinkPending: boolean;
  buildApiUrl: (path: string) => string;
  libraryEntries: LibraryEntry[];
  suggestedGames: LibrarySuggestedGame[];
  trendingGames: LibraryTrendingGame[];
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  currentUsualAvailability: string | null;
  browserTimeZoneId: string | null;
  loadDashboard: () => Promise<void>;
  updateProfile: (profilePatch: { usualAvailability?: string; timezoneId?: string; discordAutoPromptPlayIntent?: boolean }) => Promise<UserProfileResponse>;
  applyProfileUpdate: (profile: UserProfileResponse) => void;
  setActionNotice: Dispatch<SetStateAction<Notice | null>>;
  setProfileNotice: Dispatch<SetStateAction<Notice | null>>;
  onStartSteamLink: () => Promise<void>;
  onAddGameToLibrary?: (game: DashboardLibraryQuickAddGame) => Promise<void>;
}) {
  const location = useLocation()
  const previousPathnameRef = useRef(location.pathname)
  const [libraryTitle, setLibraryTitle] = useState('')
  const [selectedPlatformLabels, setSelectedPlatformLabels] = useState<string[]>([])
  const [libraryAvailability, setLibraryAvailability] = useState('')
  const [usualAvailability, setUsualAvailability] = useState('')
  const [libraryIntent, setLibraryIntent] = useState<LibraryEntryIntent>('interested')
  const [librarySaving, setLibrarySaving] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [gameSuggestions, setGameSuggestions] = useState<GameSearchResponse['results']>([])
  const [gameSuggestionsLoading, setGameSuggestionsLoading] = useState(false)
  const [selectedCatalogResult, setSelectedCatalogResult] = useState<GameSearchResult | null>(null)
  const [editingLibraryEntryId, setEditingLibraryEntryId] = useState<string | null>(null)
  const [removingLibraryEntryId, setRemovingLibraryEntryId] = useState<string | null>(null)
  const [isLibraryEditorOpen, setIsLibraryEditorOpen] = useState(false)
  const [steamImportPreview, setSteamImportPreview] = useState<SteamLibraryImportPreviewResponse | null>(null)
  const [steamPreviewLoading, setSteamPreviewLoading] = useState(false)
  const [steamImporting, setSteamImporting] = useState(false)
  const [steamDisconnectPending, setSteamDisconnectPending] = useState(false)
  const [isSteamImportModalOpen, setIsSteamImportModalOpen] = useState(false)
  const [platformAliases, setPlatformAliases] = useState<UserPlatformAlias[]>([])
  const [gameAliases, setGameAliases] = useState<UserGameAlias[]>([])
  const [aliasSavingKey, setAliasSavingKey] = useState<string | null>(null)

  const editingLibraryEntry = libraryEntries.find((entry) => entry.id === editingLibraryEntryId) ?? null
  const platformOptions = [...new Set([
    ...defaultPlatformOptions,
    ...(selectedCatalogResult?.platformLabels ?? []),
    ...selectedPlatformLabels
  ])]
  const usualAvailabilityChanged = usualAvailability.trim() !== (currentUsualAvailability ?? '')
  const usualAvailabilityButtonLabel = profileSaving
    ? 'Saving schedule...'
    : !usualAvailabilityChanged && currentUsualAvailability
      ? 'Saved'
      : 'Save usual schedule'
  const usualAvailabilityHelperText = usualAvailabilityChanged
    ? 'Save to update your profile default for games that do not have their own schedule override.'
    : currentUsualAvailability
      ? 'Used for games that do not have their own schedule override.'
      : 'No default schedule yet. Leave a game override blank to keep it unscheduled.'

  useEffect(() => {
    if (editingLibraryEntryId) {
      setGameSuggestions([])
      setGameSuggestionsLoading(false)
      return
    }

    const query = libraryTitle.trim()

    if (query.length < 2) {
      setGameSuggestions([])
      setGameSuggestionsLoading(false)
      return
    }

    let cancelled = false
    setGameSuggestionsLoading(true)

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(buildApiUrl(`/api/library/catalog?query=${encodeURIComponent(query)}`), {
            credentials: 'include'
          })
          const responseJson = await response.json()

          if (cancelled) {
            return
          }

          const parsed = gameSearchResponseSchema.parse(responseJson)
          setGameSuggestions(parsed.results)
        } catch {
          if (!cancelled) {
            setGameSuggestions([])
          }
        } finally {
          if (!cancelled) {
            setGameSuggestionsLoading(false)
          }
        }
      })()
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [buildApiUrl, editingLibraryEntryId, libraryTitle])

  useEffect(() => {
    setUsualAvailability(currentUsualAvailability ?? '')
  }, [currentUsualAvailability])

  useEffect(() => {
    if (steamConnected) {
      return
    }

    setSteamImportPreview(null)
    setIsSteamImportModalOpen(false)
  }, [steamConnected])

  useEffect(() => {
    if (!isSignedIn) {
      setPlatformAliases([])
      setGameAliases([])
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const [platformResponse, gameResponse] = await Promise.all([
          fetch(buildApiUrl('/api/aliases/platforms'), { credentials: 'include' }),
          fetch(buildApiUrl('/api/aliases/games'), { credentials: 'include' })
        ])

        if (!platformResponse.ok || !gameResponse.ok) {
          return
        }

        const [platformBody, gameBody] = await Promise.all([
          platformResponse.json(),
          gameResponse.json()
        ])

        if (cancelled) {
          return
        }

        const parsedPlatforms = userPlatformAliasesResponseSchema.parse(platformBody)
        const parsedGames = userGameAliasesResponseSchema.parse(gameBody)
        setPlatformAliases(parsedPlatforms.aliases)
        setGameAliases(parsedGames.aliases)
      } catch {
        if (!cancelled) {
          setPlatformAliases([])
          setGameAliases([])
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [buildApiUrl, isSignedIn, libraryEntries])

  const handleLibraryTitleChange = useCallback((nextTitle: string) => {
    setLibraryTitle(nextTitle)

    if (selectedCatalogResult && selectedCatalogResult.title !== nextTitle) {
      setSelectedCatalogResult(null)
    }
  }, [selectedCatalogResult])

  const togglePlatformLabel = useCallback((platformLabel: string) => {
    setSelectedPlatformLabels((current) =>
      current.includes(platformLabel)
        ? current.filter((entry) => entry !== platformLabel)
        : [...current, platformLabel]
    )
  }, [])

  const handleSelectSuggestion = useCallback((result: GameSearchResult) => {
    setSelectedCatalogResult(result)
    setLibraryTitle(result.title)
    setSelectedPlatformLabels([])
    setGameSuggestions([])
  }, [])

  const resetLibraryForm = useCallback(() => {
    setEditingLibraryEntryId(null)
    setIsLibraryEditorOpen(false)
    setLibraryTitle('')
    setSelectedPlatformLabels([])
    setLibraryAvailability('')
    setGameSuggestions([])
    setSelectedCatalogResult(null)
    setLibraryIntent('interested')
  }, [])

  const openLibraryEditor = useCallback(() => {
    setIsLibraryEditorOpen(true)
    setActionNotice(null)
  }, [setActionNotice])

  const openLibraryEditorForGame = useCallback(async ({ gameId, title, coverUrl, platformLabels }: DashboardLibraryQuickAddGame) => {
    if (!isSignedIn) {
      setActionNotice({
        tone: 'danger',
        message: 'Sign in before adding games to your library.'
      })
      return
    }

    if (libraryGameIds.has(gameId)) {
      setActionNotice({
        tone: 'neutral',
        message: `${title} is already in your library.`
      })
      return
    }

    const normalizedPlatformLabels = [...new Set(platformLabels.map((platformLabel) => platformLabel.trim()).filter(Boolean))]

    setIsLibraryEditorOpen(true)
    setEditingLibraryEntryId(null)
    setLibraryTitle(title)
    setSelectedPlatformLabels(normalizedPlatformLabels)
    setLibraryAvailability('')
    setGameSuggestions([])
    setSelectedCatalogResult({
      id: gameId,
      source: 'local',
      sourceId: gameId,
      title,
      coverUrl,
      platformLabels: normalizedPlatformLabels,
      gameplayClassification: 'unknown'
    })
    setLibraryIntent('interested')
    setActionNotice(null)
  }, [isSignedIn, libraryGameIds, setActionNotice])

  const handleEditLibraryEntry = useCallback((entry: LibraryEntry) => {
    setIsLibraryEditorOpen(true)
    setEditingLibraryEntryId(entry.id)
    setLibraryTitle(entry.title)
    setSelectedPlatformLabels(entry.platformLabels)
    setLibraryAvailability(entry.availabilitySource === 'game-specific' ? (entry.availability ?? '') : '')
    setGameSuggestions([])
    setSelectedCatalogResult(null)
    setLibraryIntent(entry.intent)
    setActionNotice(null)
  }, [setActionNotice])

  const handleCancelLibraryEdit = useCallback(() => {
    setActionNotice(null)
    resetLibraryForm()
  }, [resetLibraryForm, setActionNotice])

  useEffect(() => {
    if (previousPathnameRef.current === location.pathname) {
      return
    }

    previousPathnameRef.current = location.pathname

    if (isLibraryEditorOpen) {
      handleCancelLibraryEdit()
    }

    if (isSteamImportModalOpen) {
      setIsSteamImportModalOpen(false)
    }
  }, [handleCancelLibraryEdit, isLibraryEditorOpen, isSteamImportModalOpen, location.pathname])

  const handleSaveUsualAvailability = useCallback(async () => {
    setProfileSaving(true)
    setActionNotice(null)
    setProfileNotice(null)

    try {
      const parsedProfile = await updateProfile({
        timezoneId: browserTimeZoneId ?? undefined,
        usualAvailability: usualAvailability.trim() || undefined
      })

      applyProfileUpdate(parsedProfile)
      setProfileNotice({
        tone: 'success',
        message: usualAvailability.trim()
          ? 'Saved as your default play schedule.'
          : 'Cleared your default play schedule.'
      })
      void loadDashboard()
    } catch (error) {
      setProfileNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to update your usual play schedule right now.'
      })
    } finally {
      setProfileSaving(false)
    }
  }, [applyProfileUpdate, browserTimeZoneId, loadDashboard, setActionNotice, setProfileNotice, updateProfile, usualAvailability])

  const fetchSteamImportPreview = useCallback(async () => {
    if (!steamImportEnabled) {
      setActionNotice({
        tone: 'neutral',
        message: 'Steam import is not configured in this environment yet.'
      })
      return null
    }

    if (!steamConnected) {
      return null
    }

    setSteamPreviewLoading(true)

    try {
      const response = await fetch(buildApiUrl('/api/library/imports/steam'), {
        credentials: 'include'
      })
      const responseBody = (await response.json()) as SteamLibraryImportPreviewResponse | { error?: string }

      if (!response.ok) {
        setActionNotice({
          tone: 'danger',
          message: extractErrorMessage(responseBody, 'Unable to load your Steam library right now.')
        })
        return null
      }

      const parsed = steamLibraryImportPreviewResponseSchema.parse(responseBody)
      setSteamImportPreview(parsed)

      return parsed
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to load your Steam library right now.'
      })
      return null
    } finally {
      setSteamPreviewLoading(false)
    }
  }, [buildApiUrl, setActionNotice, steamConnected, steamImportEnabled])

  const handleOpenSteamImport = useCallback(async () => {
    setActionNotice(null)
    setIsSteamImportModalOpen(true)

    if (steamConnected && steamImportPreview == null) {
      await fetchSteamImportPreview()
    }
  }, [fetchSteamImportPreview, setActionNotice, steamConnected, steamImportPreview])

  const handleRefreshSteamImport = useCallback(async () => {
    await fetchSteamImportPreview()
  }, [fetchSteamImportPreview])

  const handleImportSteamGames = useCallback(async (games: ImportSteamLibrarySelectionRequest['games']) => {
    if (games.length === 0) {
      setActionNotice({
        tone: 'neutral',
        message: 'Choose at least one Steam game before importing.'
      })
      return
    }

    setSteamImporting(true)
    setActionNotice(null)

    try {
      const response = await fetch(buildApiUrl('/api/library/imports/steam'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          games
        })
      })
      const responseBody = (await response.json()) as LibraryResponse | { error?: string }

      if (!response.ok) {
        setActionNotice({
          tone: 'danger',
          message: extractErrorMessage(responseBody, 'Unable to import those Steam games right now.')
        })
        return
      }

      libraryResponseSchema.parse(responseBody)
      setIsSteamImportModalOpen(false)
      setActionNotice({
        tone: 'success',
        message: games.length === 1 ? 'Imported 1 Steam game into your library.' : `Imported ${games.length} Steam games into your library.`
      })
      await loadDashboard()
      await fetchSteamImportPreview()
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to import those Steam games right now.'
      })
    } finally {
      setSteamImporting(false)
    }
  }, [buildApiUrl, fetchSteamImportPreview, loadDashboard, setActionNotice])

  const handleDisconnectSteam = useCallback(async () => {
    setSteamDisconnectPending(true)
    setActionNotice(null)

    try {
      const response = await fetch(buildApiUrl('/api/auth/steam/link'), {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const responseBody = (await response.json()) as { error?: string }
        setActionNotice({
          tone: 'danger',
          message: responseBody.error ?? 'Unable to disconnect Steam right now.'
        })
        return
      }

      setSteamImportPreview(null)
      setIsSteamImportModalOpen(false)
      setActionNotice({
        tone: 'success',
        message: 'Steam account disconnected.'
      })
      await loadDashboard()
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to disconnect Steam right now.'
      })
    } finally {
      setSteamDisconnectPending(false)
    }
  }, [buildApiUrl, loadDashboard, setActionNotice])

  const handleAddLibraryEntry = useCallback(async () => {
    const title = libraryTitle.trim()
    const platformLabels = [...new Set(selectedPlatformLabels.map((platformLabel) => platformLabel.trim()).filter(Boolean))]
    const isEditingLibraryEntry = Boolean(editingLibraryEntryId)

    if (!title || platformLabels.length === 0) {
      setActionNotice({
        tone: 'danger',
        message: 'Add a game title and choose at least one platform before saving to your library.'
      })
      return
    }

    setLibrarySaving(true)
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
          platformLabels,
          intent: libraryIntent,
          availability: libraryAvailability.trim() || undefined,
          catalogMatch: selectedCatalogResult
            ? {
                source: selectedCatalogResult.source,
                sourceId: selectedCatalogResult.sourceId,
                title: selectedCatalogResult.title,
                coverUrl: selectedCatalogResult.coverUrl,
                platformLabels: selectedCatalogResult.platformLabels
              }
            : undefined
        })
      })

      const responseBody = (await response.json()) as LibraryResponse | { error?: string }

      if (!response.ok) {
        setActionNotice({
          tone: 'danger',
          message: extractErrorMessage(responseBody, 'Unable to add that game right now.')
        })
        return
      }

      libraryResponseSchema.parse(responseBody)
      resetLibraryForm()
      if (isEditingLibraryEntry) {
        setActionNotice(null)
      } else {
        setActionNotice({
          tone: 'success',
          message: `${title} was added to your library.`
        })
      }
      await loadDashboard()
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to add that game right now.'
      })
    } finally {
      setLibrarySaving(false)
    }
  }, [buildApiUrl, editingLibraryEntryId, libraryAvailability, libraryIntent, libraryTitle, loadDashboard, resetLibraryForm, selectedCatalogResult, selectedPlatformLabels, setActionNotice])

  const handleRemoveLibraryEntry = useCallback(async (entryId: string) => {
    setRemovingLibraryEntryId(entryId)
    setActionNotice(null)

    try {
      const response = await fetch(buildApiUrl(`/api/library/me/${entryId}`), {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const responseBody = (await response.json()) as { error?: string }
        setActionNotice({
          tone: 'danger',
          message: responseBody.error ?? 'Unable to remove that game right now.'
        })
        return
      }

      setActionNotice({
        tone: 'success',
        message: 'Removed that game from your library.'
      })

      if (entryId === editingLibraryEntryId) {
        resetLibraryForm()
      }

      await loadDashboard()
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to remove that game right now.'
      })
    } finally {
      setRemovingLibraryEntryId(null)
    }
  }, [buildApiUrl, editingLibraryEntryId, loadDashboard, resetLibraryForm, setActionNotice])

  const handleUsualAvailabilityChange = useCallback((value: string) => {
    setUsualAvailability(value)
    setProfileNotice(null)
  }, [setProfileNotice])

  const handleLibraryIntentChange = useCallback((intent: LibraryEntryIntent) => {
    setLibraryIntent(intent)
  }, [])

  const handleLibraryAvailabilityChange = useCallback((value: string) => {
    setLibraryAvailability(value)
  }, [])

  const handleSavePlatformAlias = useCallback(async (platform: string, aliasValue: string) => {
    const trimmedAlias = aliasValue.trim()

    if (!trimmedAlias) {
      return
    }

    setAliasSavingKey(`platform:${platform}`)

    try {
      const response = await fetch(buildApiUrl(`/api/aliases/platforms/${encodeURIComponent(platform)}`), {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ aliasValue: trimmedAlias })
      })

      if (!response.ok) {
        const body = (await response.json()) as { error?: string }
        setActionNotice({ tone: 'danger', message: body.error ?? 'Unable to save that platform alias right now.' })
        return
      }

      const parsed = userPlatformAliasesResponseSchema.parse(await response.json())
      const nextAlias = parsed.aliases[0]

      if (!nextAlias) {
        return
      }

      setPlatformAliases((current) => {
        const others = current.filter((entry) => entry.platform !== nextAlias.platform)
        return [...others, nextAlias].sort((left, right) => left.platform.localeCompare(right.platform))
      })
      setActionNotice({ tone: 'success', message: `Saved alias for ${platform}.` })
    } catch (error) {
      setActionNotice({ tone: 'danger', message: error instanceof Error ? error.message : 'Unable to save that platform alias right now.' })
    } finally {
      setAliasSavingKey(null)
    }
  }, [buildApiUrl, setActionNotice])

  const handleDeletePlatformAlias = useCallback(async (platform: string) => {
    setAliasSavingKey(`platform:${platform}`)

    try {
      await fetch(buildApiUrl(`/api/aliases/platforms/${encodeURIComponent(platform)}`), {
        method: 'DELETE',
        credentials: 'include'
      })

      setPlatformAliases((current) => current.filter((entry) => entry.platform !== platform))
      setActionNotice({ tone: 'success', message: `Removed alias for ${platform}.` })
    } catch (error) {
      setActionNotice({ tone: 'danger', message: error instanceof Error ? error.message : 'Unable to remove that platform alias right now.' })
    } finally {
      setAliasSavingKey(null)
    }
  }, [buildApiUrl, setActionNotice])

  const handleSaveGameAlias = useCallback(async (gameId: string, aliasValue: string) => {
    const trimmedAlias = aliasValue.trim()

    if (!trimmedAlias) {
      return
    }

    setAliasSavingKey(`game:${gameId}`)

    try {
      const response = await fetch(buildApiUrl(`/api/aliases/games/${gameId}`), {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ aliasValue: trimmedAlias })
      })

      if (!response.ok) {
        const body = (await response.json()) as { error?: string }
        setActionNotice({ tone: 'danger', message: body.error ?? 'Unable to save that game alias right now.' })
        return
      }

      const parsed = userGameAliasesResponseSchema.parse(await response.json())
      const nextAlias = parsed.aliases[0]

      if (!nextAlias) {
        return
      }

      setGameAliases((current) => {
        const others = current.filter((entry) => entry.gameId !== nextAlias.gameId)
        return [...others, nextAlias].sort((left, right) => left.gameTitle.localeCompare(right.gameTitle))
      })
      setActionNotice({ tone: 'success', message: `Saved alias for ${nextAlias.gameTitle}.` })
    } catch (error) {
      setActionNotice({ tone: 'danger', message: error instanceof Error ? error.message : 'Unable to save that game alias right now.' })
    } finally {
      setAliasSavingKey(null)
    }
  }, [buildApiUrl, setActionNotice])

  const handleDeleteGameAlias = useCallback(async (gameId: string) => {
    setAliasSavingKey(`game:${gameId}`)

    try {
      await fetch(buildApiUrl(`/api/aliases/games/${gameId}`), {
        method: 'DELETE',
        credentials: 'include'
      })

      setGameAliases((current) => current.filter((entry) => entry.gameId !== gameId))
      setActionNotice({ tone: 'success', message: 'Removed game alias.' })
    } catch (error) {
      setActionNotice({ tone: 'danger', message: error instanceof Error ? error.message : 'Unable to remove that game alias right now.' })
    } finally {
      setAliasSavingKey(null)
    }
  }, [buildApiUrl, setActionNotice])

  const libraryViewProps: DashboardLibraryViewProps = {
    isSignedIn,
    steamImportEnabled,
    steamConnected,
    steamLinkPending,
    steamPreviewLoading,
    steamImporting,
    steamDisconnectPending,
    isSteamImportModalOpen,
    steamImportPreview,
    onStartSteamLink,
    onOpenSteamImport: handleOpenSteamImport,
    onCloseSteamImport: () => setIsSteamImportModalOpen(false),
    onRefreshSteamImport: handleRefreshSteamImport,
    onImportSteamGames: handleImportSteamGames,
    onDisconnectSteam: handleDisconnectSteam,
    usualAvailability,
    profileSaving,
    usualAvailabilityChanged,
    usualAvailabilityButtonLabel,
    usualAvailabilityHelperText,
    onUsualAvailabilityChange: handleUsualAvailabilityChange,
    onSaveUsualAvailability: handleSaveUsualAvailability,
    isLibraryEditorOpen,
    openLibraryEditor,
    closeLibraryEditor: handleCancelLibraryEdit,
    editingLibraryEntry,
    libraryTitle,
    onLibraryTitleChange: handleLibraryTitleChange,
    selectedCatalogResult,
    gameSuggestions,
    gameSuggestionsLoading,
    onSelectSuggestion: handleSelectSuggestion,
    platformOptions,
    selectedPlatformLabels,
    onTogglePlatformLabel: togglePlatformLabel,
    libraryIntent,
    onLibraryIntentChange: handleLibraryIntentChange,
    currentUsualAvailability,
    libraryAvailability,
    onLibraryAvailabilityChange: handleLibraryAvailabilityChange,
    librarySaving,
    onAddLibraryEntry: handleAddLibraryEntry,
    onCancelLibraryEdit: handleCancelLibraryEdit,
    libraryEntries,
    suggestedGames,
    trendingGames,
    platformAliases,
    gameAliases,
    aliasSavingKey,
    onSavePlatformAlias: handleSavePlatformAlias,
    onDeletePlatformAlias: handleDeletePlatformAlias,
    onSaveGameAlias: handleSaveGameAlias,
    onDeleteGameAlias: handleDeleteGameAlias,
    libraryGameIds,
    addingLibraryGameId,
    editingLibraryEntryId,
    removingLibraryEntryId,
    onEditLibraryEntry: handleEditLibraryEntry,
    onRemoveLibraryEntry: handleRemoveLibraryEntry,
    onAddGameToLibrary: onAddGameToLibrary ?? openLibraryEditorForGame
  }

  return {
    profileSaving,
    libraryViewProps,
    openLibraryEditorForGame
  }
}