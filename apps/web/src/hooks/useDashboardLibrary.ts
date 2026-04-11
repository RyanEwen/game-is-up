import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useState } from 'react'
import type {
  GameSearchResponse,
  GameSearchResult,
  LibraryEntry,
  LibraryEntryIntent,
  LibrarySuggestedGame,
  LibraryResponse,
  UserProfileResponse
} from '@game-is-up/shared'
import { gameSearchResponseSchema, libraryResponseSchema } from '@game-is-up/shared'
import type { DashboardLibraryQuickAddGame, Notice } from '../components/dashboard/types'

const defaultPlatformOptions = ['PC', 'Xbox', 'PlayStation', 'Switch', 'Mobile', 'macOS', 'Linux'] as const

export type DashboardLibraryViewProps = {
  isSignedIn: boolean;
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
  buildApiUrl,
  libraryEntries,
  suggestedGames,
  libraryGameIds,
  addingLibraryGameId,
  currentUsualAvailability,
  browserTimeZoneId,
  loadDashboard,
  updateProfile,
  applyProfileUpdate,
  setActionNotice,
  setProfileNotice,
  onAddGameToLibrary
}: {
  isSignedIn: boolean;
  buildApiUrl: (path: string) => string;
  libraryEntries: LibraryEntry[];
  suggestedGames: LibrarySuggestedGame[];
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  currentUsualAvailability: string | null;
  browserTimeZoneId: string | null;
  loadDashboard: () => Promise<void>;
  updateProfile: (profilePatch: { usualAvailability?: string; timezoneId?: string }) => Promise<UserProfileResponse>;
  applyProfileUpdate: (profile: UserProfileResponse) => void;
  setActionNotice: Dispatch<SetStateAction<Notice | null>>;
  setProfileNotice: Dispatch<SetStateAction<Notice | null>>;
  onAddGameToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
}) {
  const [libraryTitle, setLibraryTitle] = useState('')
  const [selectedPlatformLabels, setSelectedPlatformLabels] = useState<string[]>(['PC'])
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

  const editingLibraryEntry = libraryEntries.find((entry) => entry.id === editingLibraryEntryId) ?? null
  const platformOptions = [...new Set([
    ...(selectedCatalogResult?.platformLabels ?? []),
    ...selectedPlatformLabels,
    ...defaultPlatformOptions
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
    setSelectedPlatformLabels(['PC'])
    setLibraryAvailability('')
    setGameSuggestions([])
    setSelectedCatalogResult(null)
    setLibraryIntent('interested')
  }, [])

  const openLibraryEditor = useCallback(() => {
    setIsLibraryEditorOpen(true)
    setActionNotice(null)
  }, [setActionNotice])

  const handleEditLibraryEntry = useCallback((entry: LibraryEntry) => {
    setIsLibraryEditorOpen(true)
    setEditingLibraryEntryId(entry.id)
    setLibraryTitle(entry.title)
    setSelectedPlatformLabels(entry.platformLabels)
    setLibraryAvailability(entry.availabilitySource === 'game-specific' ? (entry.availability ?? '') : '')
    setGameSuggestions([])
    setSelectedCatalogResult(null)
    setLibraryIntent(entry.intent)
    setActionNotice({
      tone: 'neutral',
      message: `Editing ${entry.title} in the library form.`
    })
  }, [setActionNotice])

  const handleCancelLibraryEdit = useCallback(() => {
    setActionNotice(null)
    resetLibraryForm()
  }, [resetLibraryForm, setActionNotice])

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
          message:
            typeof responseBody === 'object' && responseBody && 'error' in responseBody && typeof responseBody.error === 'string'
              ? responseBody.error
              : 'Unable to add that game right now.'
        })
        return
      }

      libraryResponseSchema.parse(responseBody)
      resetLibraryForm()
      setActionNotice({
        tone: 'success',
        message: isEditingLibraryEntry ? `${title} was updated in your library.` : `${title} was added to your library.`
      })
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

  const libraryViewProps: DashboardLibraryViewProps = {
    isSignedIn,
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
    libraryGameIds,
    addingLibraryGameId,
    editingLibraryEntryId,
    removingLibraryEntryId,
    onEditLibraryEntry: handleEditLibraryEntry,
    onRemoveLibraryEntry: handleRemoveLibraryEntry,
    onAddGameToLibrary
  }

  return {
    profileSaving,
    libraryViewProps
  }
}