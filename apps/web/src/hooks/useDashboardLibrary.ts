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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  GameSearchResponse,
  GameSearchResult,
  ImportSteamLibrarySelectionRequest,
  LibraryEntry,
  LibraryEntryIntent,
  LibrarySuggestedGame,
  LibraryTrendingGame,
  UserGameAlias,
  UserPlatformAlias,
  SteamLibraryImportPreviewResponse,
  UserProfileResponse,
} from '@game-is-up/shared'
import {
  gameSearchResponseSchema,
  libraryResponseSchema,
  steamLibraryImportPreviewResponseSchema,
  userGameAliasesResponseSchema,
  userPlatformAliasesResponseSchema,
} from '@game-is-up/shared'
import { apiRequest, noResponseBody } from '../lib/apiQuery'
import { queryKeys } from '../lib/queryKeys'
import type {
  DashboardLibraryQuickAddGame,
  Notice,
} from '../components/dashboard/types'
import { useLocation } from 'react-router-dom'
import { useResetOnChange } from './useResetOnChange'

/** How long the catalog search waits after the last keystroke before it asks the server. */
const catalogSearchDelayMs = 180
const emptyGameSuggestions: GameSearchResult[] = []
const emptyPlatformAliases: UserPlatformAlias[] = []
const emptyGameAliases: UserGameAlias[] = []

const defaultPlatformOptions = [
  'PC',
  'Xbox',
  'PlayStation',
  'Switch',
  'Mobile',
  'macOS',
  'Linux',
] as const

export type DashboardLibraryViewProps = {
  isSignedIn: boolean
  steamImportEnabled: boolean
  steamConnected: boolean
  steamLinkPending: boolean
  steamPreviewLoading: boolean
  steamImporting: boolean
  steamDisconnectPending: boolean
  isSteamImportModalOpen: boolean
  steamImportPreview: SteamLibraryImportPreviewResponse | null
  onStartSteamLink: () => Promise<void>
  onOpenSteamImport: () => Promise<void>
  onCloseSteamImport: () => void
  onRefreshSteamImport: () => Promise<void>
  onImportSteamGames: (
    games: ImportSteamLibrarySelectionRequest['games'],
  ) => Promise<void>
  onDisconnectSteam: () => Promise<void>
  usualAvailability: string
  profileSaving: boolean
  usualAvailabilityChanged: boolean
  usualAvailabilityButtonLabel: string
  usualAvailabilityHelperText: string
  onUsualAvailabilityChange: (value: string) => void
  onSaveUsualAvailability: () => Promise<void>
  isLibraryEditorOpen: boolean
  openLibraryEditor: () => void
  closeLibraryEditor: () => void
  editingLibraryEntry: LibraryEntry | null
  libraryTitle: string
  onLibraryTitleChange: (value: string) => void
  selectedCatalogResult: GameSearchResult | null
  gameSuggestions: GameSearchResponse['results']
  gameSuggestionsLoading: boolean
  onSelectSuggestion: (result: GameSearchResult) => void
  platformOptions: string[]
  selectedPlatformLabels: string[]
  onTogglePlatformLabel: (platform: string) => void
  libraryIntent: LibraryEntryIntent
  onLibraryIntentChange: (intent: LibraryEntryIntent) => void
  currentUsualAvailability: string | null
  libraryAvailability: string
  onLibraryAvailabilityChange: (value: string) => void
  librarySaving: boolean
  onAddLibraryEntry: () => Promise<void>
  onCancelLibraryEdit: () => void
  libraryEntries: LibraryEntry[]
  suggestedGames: LibrarySuggestedGame[]
  trendingGames: LibraryTrendingGame[]
  platformAliases: UserPlatformAlias[]
  gameAliases: UserGameAlias[]
  aliasSavingKey: string | null
  onSavePlatformAlias: (platform: string, aliasValue: string) => Promise<void>
  onDeletePlatformAlias: (platform: string) => Promise<void>
  onSaveGameAlias: (gameId: string, aliasValue: string) => Promise<void>
  onDeleteGameAlias: (gameId: string) => Promise<void>
  libraryGameIds: ReadonlySet<string>
  addingLibraryGameId: string | null
  editingLibraryEntryId: string | null
  removingLibraryEntryId: string | null
  onEditLibraryEntry: (entry: LibraryEntry) => void
  onRemoveLibraryEntry: (entryId: string) => Promise<void>
  onAddGameToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>
}

export function useDashboardLibrary({
  isSignedIn,
  steamImportEnabled,
  steamConnected,
  steamLinkPending,
  libraryEntries,
  suggestedGames,
  trendingGames,
  libraryGameIds,
  addingLibraryGameId,
  currentUsualAvailability,
  browserTimeZoneId,
  refreshAfterChange,
  updateProfile,
  applyProfileUpdate,
  setActionNotice,
  setProfileNotice,
  onStartSteamLink,
  onAddGameToLibrary,
}: {
  isSignedIn: boolean
  steamImportEnabled: boolean
  steamConnected: boolean
  steamLinkPending: boolean
  libraryEntries: LibraryEntry[]
  suggestedGames: LibrarySuggestedGame[]
  trendingGames: LibraryTrendingGame[]
  libraryGameIds: ReadonlySet<string>
  addingLibraryGameId: string | null
  currentUsualAvailability: string | null
  browserTimeZoneId: string | null
  refreshAfterChange: () => Promise<void>
  updateProfile: (profilePatch: {
    usualAvailability?: string
    timezoneId?: string
    discordAutoPromptPlayIntent?: boolean
  }) => Promise<UserProfileResponse>
  applyProfileUpdate: (profile: UserProfileResponse) => void
  setActionNotice: Dispatch<SetStateAction<Notice | null>>
  setProfileNotice: Dispatch<SetStateAction<Notice | null>>
  onStartSteamLink: () => Promise<void>
  onAddGameToLibrary?: (game: DashboardLibraryQuickAddGame) => Promise<void>
}) {
  const location = useLocation()
  const [libraryTitle, setLibraryTitle] = useState('')
  const [selectedPlatformLabels, setSelectedPlatformLabels] = useState<
    string[]
  >([])
  const [libraryAvailability, setLibraryAvailability] = useState('')
  const [usualAvailability, setUsualAvailability] = useState(
    currentUsualAvailability ?? '',
  )
  const [libraryIntent, setLibraryIntent] =
    useState<LibraryEntryIntent>('interested')
  const [profileSaving, setProfileSaving] = useState(false)
  const [selectedCatalogResult, setSelectedCatalogResult] =
    useState<GameSearchResult | null>(null)
  const [editingLibraryEntryId, setEditingLibraryEntryId] = useState<
    string | null
  >(null)
  const [isLibraryEditorOpen, setIsLibraryEditorOpen] = useState(false)
  const [isSteamImportModalOpen, setIsSteamImportModalOpen] = useState(false)

  const queryClient = useQueryClient()

  // Catalog search: a query per debounced title, so typing does not fire a request per key.
  const catalogTerm = editingLibraryEntryId ? '' : libraryTitle.trim()
  const [debouncedCatalogTerm, setDebouncedCatalogTerm] = useState(catalogTerm)
  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setDebouncedCatalogTerm(catalogTerm),
      catalogSearchDelayMs,
    )
    return () => window.clearTimeout(timeoutId)
  }, [catalogTerm])
  const catalogSearchEnabled = debouncedCatalogTerm.length >= 2
  const catalogQuery = useQuery({
    queryKey: queryKeys.libraryCatalog(debouncedCatalogTerm),
    queryFn: () =>
      apiRequest(
        `/api/library/catalog?query=${encodeURIComponent(debouncedCatalogTerm)}`,
        gameSearchResponseSchema,
        'Unable to search the game catalog right now.',
      ),
    enabled: catalogSearchEnabled,
  })
  const gameSuggestions =
    catalogTerm.length >= 2 && catalogTerm === debouncedCatalogTerm
      ? (catalogQuery.data?.results ?? emptyGameSuggestions)
      : emptyGameSuggestions
  // Loading from the first keystroke that qualifies, through the debounce and the request.
  const gameSuggestionsLoading =
    catalogTerm.length >= 2 &&
    (catalogTerm !== debouncedCatalogTerm || catalogQuery.isFetching)

  // The user's platform and game aliases, reloaded whenever the library changes.
  const platformAliasesQuery = useQuery({
    queryKey: queryKeys.platformAliases(),
    queryFn: () =>
      apiRequest(
        '/api/aliases/platforms',
        userPlatformAliasesResponseSchema,
        'Unable to load your platform aliases right now.',
      ),
    enabled: isSignedIn,
  })
  const gameAliasesQuery = useQuery({
    queryKey: queryKeys.gameAliases(),
    queryFn: () =>
      apiRequest(
        '/api/aliases/games',
        userGameAliasesResponseSchema,
        'Unable to load your game aliases right now.',
      ),
    enabled: isSignedIn,
  })
  const platformAliases =
    (isSignedIn ? platformAliasesQuery.data?.aliases : undefined) ??
    emptyPlatformAliases
  const gameAliases =
    (isSignedIn ? gameAliasesQuery.data?.aliases : undefined) ??
    emptyGameAliases
  const isFirstLibraryRender = useRef(true)
  useEffect(() => {
    if (isFirstLibraryRender.current) {
      isFirstLibraryRender.current = false
      return
    }
    void queryClient.invalidateQueries({ queryKey: ['aliases'] })
  }, [libraryEntries, queryClient])

  // The Steam library preview, fetched on demand when the import dialog opens or refreshes.
  const steamPreviewQuery = useQuery({
    queryKey: queryKeys.steamImportPreview(),
    queryFn: () =>
      apiRequest(
        '/api/library/imports/steam',
        steamLibraryImportPreviewResponseSchema,
        'Unable to load your Steam library right now.',
      ),
    enabled: false,
  })
  const steamImportPreview = steamPreviewQuery.data ?? null
  const steamPreviewLoading = steamPreviewQuery.isFetching

  const saveEntryMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest(
        '/api/library/me',
        libraryResponseSchema,
        'Unable to add that game right now.',
        { method: 'POST', body: JSON.stringify(body) },
      ),
  })
  const removeEntryMutation = useMutation({
    mutationFn: (entryId: string) =>
      apiRequest(
        `/api/library/me/${entryId}`,
        noResponseBody,
        'Unable to remove that game right now.',
        { method: 'DELETE' },
      ),
  })
  const steamImportMutation = useMutation({
    mutationFn: (games: ImportSteamLibrarySelectionRequest['games']) =>
      apiRequest(
        '/api/library/imports/steam',
        libraryResponseSchema,
        'Unable to import those Steam games right now.',
        { method: 'POST', body: JSON.stringify({ games }) },
      ),
  })
  const steamDisconnectMutation = useMutation({
    mutationFn: () =>
      apiRequest(
        '/api/auth/steam/link',
        noResponseBody,
        'Unable to disconnect Steam right now.',
        { method: 'DELETE' },
      ),
  })
  const savePlatformAliasMutation = useMutation({
    mutationFn: (variables: { platform: string; aliasValue: string }) =>
      apiRequest(
        `/api/aliases/platforms/${encodeURIComponent(variables.platform)}`,
        userPlatformAliasesResponseSchema,
        'Unable to save that platform alias right now.',
        {
          method: 'PUT',
          body: JSON.stringify({ aliasValue: variables.aliasValue }),
        },
      ),
  })
  const deletePlatformAliasMutation = useMutation({
    mutationFn: (platform: string) =>
      apiRequest(
        `/api/aliases/platforms/${encodeURIComponent(platform)}`,
        noResponseBody,
        'Unable to remove that platform alias right now.',
        { method: 'DELETE' },
      ),
  })
  const saveGameAliasMutation = useMutation({
    mutationFn: (variables: { gameId: string; aliasValue: string }) =>
      apiRequest(
        `/api/aliases/games/${variables.gameId}`,
        userGameAliasesResponseSchema,
        'Unable to save that game alias right now.',
        {
          method: 'PUT',
          body: JSON.stringify({ aliasValue: variables.aliasValue }),
        },
      ),
  })
  const deleteGameAliasMutation = useMutation({
    mutationFn: (gameId: string) =>
      apiRequest(
        `/api/aliases/games/${gameId}`,
        noResponseBody,
        'Unable to remove that game alias right now.',
        { method: 'DELETE' },
      ),
  })

  const librarySaving = saveEntryMutation.isPending
  const removingLibraryEntryId = removeEntryMutation.isPending
    ? (removeEntryMutation.variables ?? null)
    : null
  const steamImporting = steamImportMutation.isPending
  const steamDisconnectPending = steamDisconnectMutation.isPending
  // The alias row being saved or removed, as `platform:<name>` or `game:<id>`.
  const aliasSavingKey = savePlatformAliasMutation.isPending
    ? `platform:${savePlatformAliasMutation.variables?.platform}`
    : deletePlatformAliasMutation.isPending
      ? `platform:${deletePlatformAliasMutation.variables}`
      : saveGameAliasMutation.isPending
        ? `game:${saveGameAliasMutation.variables?.gameId}`
        : deleteGameAliasMutation.isPending
          ? `game:${deleteGameAliasMutation.variables}`
          : null

  /** The server's message for a failed request, or the caller's fallback. */
  const errorNotice = (error: unknown, fallback: string): Notice => ({
    tone: 'danger',
    message: error instanceof Error && error.message ? error.message : fallback,
  })

  const editingLibraryEntry =
    libraryEntries.find((entry) => entry.id === editingLibraryEntryId) ?? null
  const platformOptions = [
    ...new Set([
      ...defaultPlatformOptions,
      ...(selectedCatalogResult?.platformLabels ?? []),
      ...selectedPlatformLabels,
    ]),
  ]
  const usualAvailabilityChanged =
    usualAvailability.trim() !== (currentUsualAvailability ?? '')
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

  // A saved profile default replaces the draft.
  useResetOnChange([currentUsualAvailability], () =>
    setUsualAvailability(currentUsualAvailability ?? ''),
  )

  // Disconnecting Steam closes the import dialog and drops its now-stale preview from the cache.
  useResetOnChange([steamConnected], () => {
    if (!steamConnected) {
      setIsSteamImportModalOpen(false)
    }
  })
  useEffect(() => {
    if (!steamConnected) {
      queryClient.removeQueries({ queryKey: queryKeys.steamImportPreview() })
    }
  }, [queryClient, steamConnected])

  const handleLibraryTitleChange = useCallback(
    (nextTitle: string) => {
      setLibraryTitle(nextTitle)

      if (selectedCatalogResult && selectedCatalogResult.title !== nextTitle) {
        setSelectedCatalogResult(null)
      }
    },
    [selectedCatalogResult],
  )

  const togglePlatformLabel = useCallback((platformLabel: string) => {
    setSelectedPlatformLabels((current) =>
      current.includes(platformLabel)
        ? current.filter((entry) => entry !== platformLabel)
        : [...current, platformLabel],
    )
  }, [])

  const handleSelectSuggestion = useCallback((result: GameSearchResult) => {
    setSelectedCatalogResult(result)
    setLibraryTitle(result.title)
    setSelectedPlatformLabels([])
  }, [])

  const resetLibraryForm = useCallback(() => {
    setEditingLibraryEntryId(null)
    setIsLibraryEditorOpen(false)
    setLibraryTitle('')
    setSelectedPlatformLabels([])
    setLibraryAvailability('')
    setSelectedCatalogResult(null)
    setLibraryIntent('interested')
  }, [])

  const openLibraryEditor = useCallback(() => {
    setIsLibraryEditorOpen(true)
    setActionNotice(null)
  }, [setActionNotice])

  const openLibraryEditorForGame = useCallback(
    async ({
      gameId,
      title,
      coverUrl,
      platformLabels,
    }: DashboardLibraryQuickAddGame) => {
      if (!isSignedIn) {
        setActionNotice({
          tone: 'danger',
          message: 'Sign in before adding games to your library.',
        })
        return
      }

      if (libraryGameIds.has(gameId)) {
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

      setIsLibraryEditorOpen(true)
      setEditingLibraryEntryId(null)
      setLibraryTitle(title)
      setSelectedPlatformLabels(normalizedPlatformLabels)
      setLibraryAvailability('')
      setSelectedCatalogResult({
        id: gameId,
        source: 'local',
        sourceId: gameId,
        title,
        coverUrl,
        platformLabels: normalizedPlatformLabels,
        gameplayClassification: 'unknown',
      })
      setLibraryIntent('interested')
      setActionNotice(null)
    },
    [isSignedIn, libraryGameIds, setActionNotice],
  )

  const handleEditLibraryEntry = useCallback(
    (entry: LibraryEntry) => {
      setIsLibraryEditorOpen(true)
      setEditingLibraryEntryId(entry.id)
      setLibraryTitle(entry.title)
      setSelectedPlatformLabels(entry.platformLabels)
      setLibraryAvailability(
        entry.availabilitySource === 'game-specific'
          ? (entry.availability ?? '')
          : '',
      )
      setSelectedCatalogResult(null)
      setLibraryIntent(entry.intent)
      setActionNotice(null)
    },
    [setActionNotice],
  )

  const handleCancelLibraryEdit = useCallback(() => {
    setActionNotice(null)
    resetLibraryForm()
  }, [resetLibraryForm, setActionNotice])

  // Leaving the page closes the library editor (discarding its draft) and the import dialog.
  useResetOnChange([location.pathname], () => {
    if (isLibraryEditorOpen) {
      handleCancelLibraryEdit()
    }

    if (isSteamImportModalOpen) {
      setIsSteamImportModalOpen(false)
    }
  })

  const handleSaveUsualAvailability = useCallback(async () => {
    setProfileSaving(true)
    setActionNotice(null)
    setProfileNotice(null)

    try {
      const parsedProfile = await updateProfile({
        timezoneId: browserTimeZoneId ?? undefined,
        usualAvailability: usualAvailability.trim() || undefined,
      })

      applyProfileUpdate(parsedProfile)
      setProfileNotice({
        tone: 'success',
        message: usualAvailability.trim()
          ? 'Saved as your default play schedule.'
          : 'Cleared your default play schedule.',
      })
      void refreshAfterChange()
    } catch (error) {
      setProfileNotice({
        tone: 'danger',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to update your usual play schedule right now.',
      })
    } finally {
      setProfileSaving(false)
    }
  }, [
    applyProfileUpdate,
    browserTimeZoneId,
    refreshAfterChange,
    setActionNotice,
    setProfileNotice,
    updateProfile,
    usualAvailability,
  ])

  const fetchSteamImportPreview = useCallback(async () => {
    if (!steamImportEnabled) {
      setActionNotice({
        tone: 'neutral',
        message: 'Steam import is not configured in this environment yet.',
      })
      return null
    }

    if (!steamConnected) {
      return null
    }

    const result = await steamPreviewQuery.refetch()

    if (result.error) {
      setActionNotice(
        errorNotice(
          result.error,
          'Unable to load your Steam library right now.',
        ),
      )
      return null
    }

    return result.data ?? null
  }, [setActionNotice, steamConnected, steamImportEnabled, steamPreviewQuery])

  const handleOpenSteamImport = useCallback(async () => {
    setActionNotice(null)
    setIsSteamImportModalOpen(true)

    if (steamConnected && steamImportPreview == null) {
      await fetchSteamImportPreview()
    }
  }, [
    fetchSteamImportPreview,
    setActionNotice,
    steamConnected,
    steamImportPreview,
  ])

  const handleRefreshSteamImport = useCallback(async () => {
    await fetchSteamImportPreview()
  }, [fetchSteamImportPreview])

  const handleImportSteamGames = useCallback(
    async (games: ImportSteamLibrarySelectionRequest['games']) => {
      if (games.length === 0) {
        setActionNotice({
          tone: 'neutral',
          message: 'Choose at least one Steam game before importing.',
        })
        return
      }

      setActionNotice(null)

      try {
        await steamImportMutation.mutateAsync(games)
        setIsSteamImportModalOpen(false)
        setActionNotice({
          tone: 'success',
          message:
            games.length === 1
              ? 'Imported 1 Steam game into your library.'
              : `Imported ${games.length} Steam games into your library.`,
        })
        await refreshAfterChange()
        await fetchSteamImportPreview()
      } catch (error) {
        setActionNotice({
          tone: 'danger',
          message:
            error instanceof Error
              ? error.message
              : 'Unable to import those Steam games right now.',
        })
      }
    },
    [
      fetchSteamImportPreview,
      refreshAfterChange,
      setActionNotice,
      steamImportMutation,
    ],
  )

  const handleDisconnectSteam = useCallback(async () => {
    setActionNotice(null)

    try {
      await steamDisconnectMutation.mutateAsync()
    } catch (error) {
      setActionNotice(
        errorNotice(error, 'Unable to disconnect Steam right now.'),
      )
      return
    }

    queryClient.removeQueries({ queryKey: queryKeys.steamImportPreview() })
    setIsSteamImportModalOpen(false)
    setActionNotice({
      tone: 'success',
      message: 'Steam account disconnected.',
    })
    await refreshAfterChange()
  }, [
    refreshAfterChange,
    queryClient,
    setActionNotice,
    steamDisconnectMutation,
  ])

  const handleAddLibraryEntry = useCallback(async () => {
    const title = libraryTitle.trim()
    const platformLabels = [
      ...new Set(
        selectedPlatformLabels
          .map((platformLabel) => platformLabel.trim())
          .filter(Boolean),
      ),
    ]
    const isEditingLibraryEntry = Boolean(editingLibraryEntryId)

    if (!title || platformLabels.length === 0) {
      setActionNotice({
        tone: 'danger',
        message:
          'Add a game title and choose at least one platform before saving to your library.',
      })
      return
    }

    setActionNotice(null)

    try {
      await saveEntryMutation.mutateAsync({
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
              platformLabels: selectedCatalogResult.platformLabels,
            }
          : undefined,
      })
      resetLibraryForm()
      if (isEditingLibraryEntry) {
        setActionNotice(null)
      } else {
        setActionNotice({
          tone: 'success',
          message: `${title} was added to your library.`,
        })
      }
      await refreshAfterChange()
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to add that game right now.',
      })
    }
  }, [
    editingLibraryEntryId,
    libraryAvailability,
    libraryIntent,
    libraryTitle,
    refreshAfterChange,
    resetLibraryForm,
    saveEntryMutation,
    selectedCatalogResult,
    selectedPlatformLabels,
    setActionNotice,
  ])

  const handleRemoveLibraryEntry = useCallback(
    async (entryId: string) => {
      setActionNotice(null)

      try {
        await removeEntryMutation.mutateAsync(entryId)
      } catch (error) {
        setActionNotice(
          errorNotice(error, 'Unable to remove that game right now.'),
        )
        return
      }

      setActionNotice({
        tone: 'success',
        message: 'Removed that game from your library.',
      })

      if (entryId === editingLibraryEntryId) {
        resetLibraryForm()
      }

      await refreshAfterChange()
    },
    [
      editingLibraryEntryId,
      refreshAfterChange,
      removeEntryMutation,
      resetLibraryForm,
      setActionNotice,
    ],
  )

  const handleUsualAvailabilityChange = useCallback(
    (value: string) => {
      setUsualAvailability(value)
      setProfileNotice(null)
    },
    [setProfileNotice],
  )

  const handleLibraryIntentChange = useCallback(
    (intent: LibraryEntryIntent) => {
      setLibraryIntent(intent)
    },
    [],
  )

  const handleLibraryAvailabilityChange = useCallback((value: string) => {
    setLibraryAvailability(value)
  }, [])

  const handleSavePlatformAlias = useCallback(
    async (platform: string, aliasValue: string) => {
      const trimmedAlias = aliasValue.trim()

      if (!trimmedAlias) {
        return
      }

      try {
        const parsed = await savePlatformAliasMutation.mutateAsync({
          platform,
          aliasValue: trimmedAlias,
        })
        const nextAlias = parsed.aliases[0]

        if (!nextAlias) {
          return
        }

        queryClient.setQueryData(
          queryKeys.platformAliases(),
          (current: { aliases: UserPlatformAlias[] } | undefined) => ({
            aliases: [
              ...(current?.aliases ?? []).filter(
                (entry) => entry.platform !== nextAlias.platform,
              ),
              nextAlias,
            ].sort((left, right) =>
              left.platform.localeCompare(right.platform),
            ),
          }),
        )
        setActionNotice({
          tone: 'success',
          message: `Saved alias for ${platform}.`,
        })
      } catch (error) {
        setActionNotice(
          errorNotice(error, 'Unable to save that platform alias right now.'),
        )
      }
    },
    [savePlatformAliasMutation, queryClient, setActionNotice],
  )

  const handleDeletePlatformAlias = useCallback(
    async (platform: string) => {
      try {
        await deletePlatformAliasMutation.mutateAsync(platform)
      } catch (error) {
        setActionNotice(
          errorNotice(error, 'Unable to remove that platform alias right now.'),
        )
        return
      }

      queryClient.setQueryData(
        queryKeys.platformAliases(),
        (current: { aliases: UserPlatformAlias[] } | undefined) => ({
          aliases: (current?.aliases ?? []).filter(
            (entry) => entry.platform !== platform,
          ),
        }),
      )
      setActionNotice({
        tone: 'success',
        message: `Removed alias for ${platform}.`,
      })
    },
    [deletePlatformAliasMutation, queryClient, setActionNotice],
  )

  const handleSaveGameAlias = useCallback(
    async (gameId: string, aliasValue: string) => {
      const trimmedAlias = aliasValue.trim()

      if (!trimmedAlias) {
        return
      }

      try {
        const parsed = await saveGameAliasMutation.mutateAsync({
          gameId,
          aliasValue: trimmedAlias,
        })
        const nextAlias = parsed.aliases[0]

        if (!nextAlias) {
          return
        }

        queryClient.setQueryData(
          queryKeys.gameAliases(),
          (current: { aliases: UserGameAlias[] } | undefined) => ({
            aliases: [
              ...(current?.aliases ?? []).filter(
                (entry) => entry.gameId !== nextAlias.gameId,
              ),
              nextAlias,
            ].sort((left, right) =>
              left.gameTitle.localeCompare(right.gameTitle),
            ),
          }),
        )
        setActionNotice({
          tone: 'success',
          message: `Saved alias for ${nextAlias.gameTitle}.`,
        })
      } catch (error) {
        setActionNotice(
          errorNotice(error, 'Unable to save that game alias right now.'),
        )
      }
    },
    [saveGameAliasMutation, queryClient, setActionNotice],
  )

  const handleDeleteGameAlias = useCallback(
    async (gameId: string) => {
      try {
        await deleteGameAliasMutation.mutateAsync(gameId)
      } catch (error) {
        setActionNotice(
          errorNotice(error, 'Unable to remove that game alias right now.'),
        )
        return
      }

      queryClient.setQueryData(
        queryKeys.gameAliases(),
        (current: { aliases: UserGameAlias[] } | undefined) => ({
          aliases: (current?.aliases ?? []).filter(
            (entry) => entry.gameId !== gameId,
          ),
        }),
      )
      setActionNotice({ tone: 'success', message: 'Removed game alias.' })
    },
    [deleteGameAliasMutation, queryClient, setActionNotice],
  )

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
    onAddGameToLibrary: onAddGameToLibrary ?? openLibraryEditorForGame,
  }

  return {
    profileSaving,
    libraryViewProps,
    openLibraryEditorForGame,
  }
}
