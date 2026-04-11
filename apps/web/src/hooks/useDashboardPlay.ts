import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useState } from 'react'
import type {
  ActivePlayIntent,
  LibraryEntry,
  PlayIntentNotifyScope,
  PlayIntentPreview,
  PlayIntentSelectionMode,
  UpsertPlayIntentResponse
} from '@game-is-up/shared'
import { upsertPlayIntentResponseSchema } from '@game-is-up/shared'
import {
  buildPlayIntentEndTimeInputValue,
  formatPlayIntentDurationLabel,
  maximumPlayIntentDurationMinutes,
  minimumPlayIntentDurationMinutes,
  parsePlayIntentDurationMinutes,
  parsePlayIntentEndAt,
  playIntentPresetDurations,
  toLocalDateTimeInputValue
} from '../components/dashboard/dashboardUtils'
import type { Notice, PlayIntentTimingMode } from '../components/dashboard/types'

export type DashboardPlayViewProps = {
  isSignedIn: boolean;
  activePlayIntent: ActivePlayIntent | null;
  canPostPlayIntent: boolean;
  playIntentNotifyScope: PlayIntentNotifyScope;
  onPlayIntentNotifyScopeChange: (scope: PlayIntentNotifyScope) => void;
  playIntentSelectionMode: PlayIntentSelectionMode;
  onPlayIntentSelectionModeChange: (mode: PlayIntentSelectionMode) => void;
  libraryEntries: LibraryEntry[];
  selectedPlayIntentGameIds: string[];
  onTogglePlayIntentGame: (gameId: string) => void;
  playIntentTimingMode: PlayIntentTimingMode;
  onPlayIntentTimingModeChange: (mode: PlayIntentTimingMode) => void;
  playIntentDurationMinutes: number;
  onPlayIntentPresetSelect: (durationMinutes: number) => void;
  playIntentCustomDurationInput: string;
  onPlayIntentCustomDurationInputChange: (value: string) => void;
  playIntentEndAtInput: string;
  onPlayIntentEndAtInputChange: (value: string) => void;
  minPlayIntentEndAtInput: string;
  maxPlayIntentEndAtInput: string;
  playIntentTimingHelperText: string;
  playIntentTimingHasError: boolean;
  playIntentNote: string;
  onPlayIntentNoteChange: (value: string) => void;
  playIntentSaving: boolean;
  onSavePlayIntent: () => Promise<void>;
  onClearPlayIntent: () => Promise<void>;
  playIntentPreviews: PlayIntentPreview[];
}

export function useDashboardPlay({
  isSignedIn,
  buildApiUrl,
  activePlayIntent,
  libraryEntries,
  playIntentPreviews,
  loadDashboard,
  setActivePlayIntent,
  setPlayIntentNotice
}: {
  isSignedIn: boolean;
  buildApiUrl: (path: string) => string;
  activePlayIntent: ActivePlayIntent | null;
  libraryEntries: LibraryEntry[];
  playIntentPreviews: PlayIntentPreview[];
  loadDashboard: () => Promise<void>;
  setActivePlayIntent: (intent: ActivePlayIntent | null) => void;
  setPlayIntentNotice: Dispatch<SetStateAction<Notice | null>>;
}) {
  const [playIntentSelectionMode, setPlayIntentSelectionMode] = useState<PlayIntentSelectionMode>('library')
  const [playIntentNotifyScope, setPlayIntentNotifyScope] = useState<PlayIntentNotifyScope>('discovery-and-friends')
  const [playIntentTimingMode, setPlayIntentTimingMode] = useState<PlayIntentTimingMode>('preset')
  const [playIntentDurationMinutes, setPlayIntentDurationMinutes] = useState(120)
  const [playIntentCustomDurationInput, setPlayIntentCustomDurationInput] = useState('120')
  const [playIntentEndAtInput, setPlayIntentEndAtInput] = useState(() => buildPlayIntentEndTimeInputValue(120))
  const [playIntentNote, setPlayIntentNote] = useState('')
  const [selectedPlayIntentGameIds, setSelectedPlayIntentGameIds] = useState<string[]>([])
  const [playIntentSaving, setPlayIntentSaving] = useState(false)

  const canPostPlayIntent = libraryEntries.length > 0
  const parsedPlayIntentCustomDurationMinutes = parsePlayIntentDurationMinutes(playIntentCustomDurationInput)
  const parsedPlayIntentEndAt = parsePlayIntentEndAt(playIntentEndAtInput)
  const resolvedPlayIntentDurationMinutes = playIntentTimingMode === 'custom'
    ? parsedPlayIntentCustomDurationMinutes
    : playIntentTimingMode === 'end-time'
      ? parsedPlayIntentEndAt
        ? Math.ceil((parsedPlayIntentEndAt.getTime() - Date.now()) / (60 * 1000))
        : null
      : playIntentDurationMinutes
  const playIntentTimingValidationMessage = playIntentTimingMode === 'custom'
    ? parsedPlayIntentCustomDurationMinutes == null
      ? `Enter a whole-number length between ${minimumPlayIntentDurationMinutes} minutes and 24 hours.`
      : parsedPlayIntentCustomDurationMinutes < minimumPlayIntentDurationMinutes
        ? `Calls to play must stay live for at least ${minimumPlayIntentDurationMinutes} minutes.`
        : parsedPlayIntentCustomDurationMinutes > maximumPlayIntentDurationMinutes
          ? 'Calls to play can stay live for up to 24 hours.'
          : null
    : playIntentTimingMode === 'end-time'
      ? parsedPlayIntentEndAt == null
        ? 'Choose a valid end time.'
        : resolvedPlayIntentDurationMinutes == null || resolvedPlayIntentDurationMinutes < minimumPlayIntentDurationMinutes
          ? `Choose an end time at least ${minimumPlayIntentDurationMinutes} minutes from now.`
          : resolvedPlayIntentDurationMinutes > maximumPlayIntentDurationMinutes
            ? 'Calls to play can stay live for up to 24 hours.'
            : null
      : null
  const playIntentPreviewEndsAt = playIntentTimingMode === 'end-time'
    ? parsedPlayIntentEndAt
    : resolvedPlayIntentDurationMinutes == null
      ? null
      : new Date(Date.now() + resolvedPlayIntentDurationMinutes * 60 * 1000)
  const minPlayIntentEndAtInput = buildPlayIntentEndTimeInputValue(minimumPlayIntentDurationMinutes)
  const maxPlayIntentEndAtInput = buildPlayIntentEndTimeInputValue(maximumPlayIntentDurationMinutes)
  const playIntentTimingHelperText = playIntentTimingValidationMessage
    ? playIntentTimingValidationMessage
    : playIntentPreviewEndsAt && resolvedPlayIntentDurationMinutes != null
      ? `Ends ${playIntentPreviewEndsAt.toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })} (${formatPlayIntentDurationLabel(resolvedPlayIntentDurationMinutes)}).`
      : 'Choose how long this call to play should stay visible.'
  const playIntentTimingHasError = playIntentTimingValidationMessage != null

  useEffect(() => {
    if (!activePlayIntent) {
      setPlayIntentSelectionMode('library')
      setPlayIntentNotifyScope('discovery-and-friends')
      setPlayIntentTimingMode('preset')
      setPlayIntentDurationMinutes(120)
      setPlayIntentCustomDurationInput('120')
      setPlayIntentEndAtInput(buildPlayIntentEndTimeInputValue(120))
      setPlayIntentNote('')
      setSelectedPlayIntentGameIds([])
      return
    }

    const durationMinutes = Math.max(
      30,
      Math.min(
        480,
        Math.round((new Date(activePlayIntent.windowEndsAt).getTime() - new Date(activePlayIntent.windowStartsAt).getTime()) / (60 * 1000))
      )
    )

    setPlayIntentSelectionMode(activePlayIntent.selectionMode)
    setPlayIntentNotifyScope(activePlayIntent.notifyScope)
    setPlayIntentTimingMode(playIntentPresetDurations.includes(durationMinutes as (typeof playIntentPresetDurations)[number]) ? 'preset' : 'end-time')
    setPlayIntentDurationMinutes(durationMinutes)
    setPlayIntentCustomDurationInput(String(durationMinutes))
    setPlayIntentEndAtInput(toLocalDateTimeInputValue(activePlayIntent.windowEndsAt))
    setPlayIntentNote(activePlayIntent.note)
    setSelectedPlayIntentGameIds(activePlayIntent.games.map((game) => game.id))
  }, [activePlayIntent])

  const togglePlayIntentGame = useCallback((gameId: string) => {
    setSelectedPlayIntentGameIds((current) =>
      current.includes(gameId)
        ? current.filter((entry) => entry !== gameId)
        : [...current, gameId]
    )
    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const handleSavePlayIntent = useCallback(async () => {
    if (!canPostPlayIntent) {
      setPlayIntentNotice({
        tone: 'danger',
        message: 'Add at least one game to your library before posting a call to play.'
      })
      return
    }

    if (playIntentSelectionMode === 'subset' && selectedPlayIntentGameIds.length === 0) {
      setPlayIntentNotice({
        tone: 'danger',
        message: 'Pick at least one game before posting a selected-games call to play.'
      })
      return
    }

    if (playIntentTimingValidationMessage) {
      setPlayIntentNotice({
        tone: 'danger',
        message: playIntentTimingValidationMessage
      })
      return
    }

    const timingPayload = playIntentTimingMode === 'end-time'
      ? { endAt: parsedPlayIntentEndAt?.toISOString() }
      : { durationMinutes: resolvedPlayIntentDurationMinutes ?? playIntentDurationMinutes }

    setPlayIntentSaving(true)
    setPlayIntentNotice(null)

    try {
      const response = await fetch(buildApiUrl('/api/play-intents/me'), {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          selectionMode: playIntentSelectionMode,
          notifyScope: playIntentNotifyScope,
          ...timingPayload,
          note: playIntentNote.trim() || undefined,
          gameIds: playIntentSelectionMode === 'subset' ? selectedPlayIntentGameIds : []
        })
      })

      const responseBody = (await response.json()) as UpsertPlayIntentResponse | { error?: string }

      if (!response.ok) {
        setPlayIntentNotice({
          tone: 'danger',
          message:
            typeof responseBody === 'object' && responseBody && 'error' in responseBody && typeof responseBody.error === 'string'
              ? responseBody.error
              : 'Unable to post your call to play right now.'
        })
        return
      }

      const parsedResponse = upsertPlayIntentResponseSchema.parse(responseBody)
      setActivePlayIntent(parsedResponse.activeIntent)
      setPlayIntentNotice({
        tone: 'success',
        message: parsedResponse.notifiedFriendCount > 0
          ? `Your call to play is live. ${parsedResponse.notifiedFriendCount} overlapping friend${parsedResponse.notifiedFriendCount === 1 ? '' : 's'} were notified.`
          : 'Your call to play is live. No overlapping friends matched it yet.'
      })
      void loadDashboard()
    } catch (error) {
      setPlayIntentNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to post your call to play right now.'
      })
    } finally {
      setPlayIntentSaving(false)
    }
  }, [
    buildApiUrl,
    canPostPlayIntent,
    loadDashboard,
    parsedPlayIntentEndAt,
    playIntentDurationMinutes,
    playIntentNote,
    playIntentNotifyScope,
    playIntentSelectionMode,
    playIntentTimingMode,
    playIntentTimingValidationMessage,
    resolvedPlayIntentDurationMinutes,
    selectedPlayIntentGameIds,
    setActivePlayIntent,
    setPlayIntentNotice
  ])

  const handleClearPlayIntent = useCallback(async () => {
    setPlayIntentSaving(true)
    setPlayIntentNotice(null)

    try {
      const response = await fetch(buildApiUrl('/api/play-intents/me'), {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const responseBody = (await response.json()) as { error?: string }
        setPlayIntentNotice({
          tone: 'danger',
          message: responseBody.error ?? 'Unable to clear your call to play right now.'
        })
        return
      }

      setActivePlayIntent(null)
      setPlayIntentNotice({
        tone: 'success',
        message: 'Your call to play is no longer live.'
      })
      void loadDashboard()
    } catch (error) {
      setPlayIntentNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to clear your call to play right now.'
      })
    } finally {
      setPlayIntentSaving(false)
    }
  }, [buildApiUrl, loadDashboard, setActivePlayIntent, setPlayIntentNotice])

  const handlePlayIntentNotifyScopeChange = useCallback((scope: PlayIntentNotifyScope) => {
    setPlayIntentNotifyScope(scope)
    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const handlePlayIntentSelectionModeChange = useCallback((mode: PlayIntentSelectionMode) => {
    setPlayIntentSelectionMode(mode)
    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const handlePlayIntentTimingModeChange = useCallback((mode: PlayIntentTimingMode) => {
    setPlayIntentTimingMode(mode)
    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const handlePlayIntentPresetSelect = useCallback((durationMinutes: number) => {
    setPlayIntentDurationMinutes(durationMinutes)
    setPlayIntentCustomDurationInput(String(durationMinutes))
    setPlayIntentEndAtInput(buildPlayIntentEndTimeInputValue(durationMinutes))
    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const handlePlayIntentCustomDurationInputChange = useCallback((value: string) => {
    setPlayIntentCustomDurationInput(value)

    const nextDurationMinutes = parsePlayIntentDurationMinutes(value)

    if (nextDurationMinutes != null) {
      setPlayIntentDurationMinutes(nextDurationMinutes)
      setPlayIntentEndAtInput(buildPlayIntentEndTimeInputValue(nextDurationMinutes))
    }

    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const handlePlayIntentEndAtInputChange = useCallback((value: string) => {
    setPlayIntentEndAtInput(value)
    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const handlePlayIntentNoteChange = useCallback((value: string) => {
    setPlayIntentNote(value)
    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const playViewProps: DashboardPlayViewProps = {
    isSignedIn,
    activePlayIntent,
    canPostPlayIntent,
    playIntentNotifyScope,
    onPlayIntentNotifyScopeChange: handlePlayIntentNotifyScopeChange,
    playIntentSelectionMode,
    onPlayIntentSelectionModeChange: handlePlayIntentSelectionModeChange,
    libraryEntries,
    selectedPlayIntentGameIds,
    onTogglePlayIntentGame: togglePlayIntentGame,
    playIntentTimingMode,
    onPlayIntentTimingModeChange: handlePlayIntentTimingModeChange,
    playIntentDurationMinutes,
    onPlayIntentPresetSelect: handlePlayIntentPresetSelect,
    playIntentCustomDurationInput,
    onPlayIntentCustomDurationInputChange: handlePlayIntentCustomDurationInputChange,
    playIntentEndAtInput,
    onPlayIntentEndAtInputChange: handlePlayIntentEndAtInputChange,
    minPlayIntentEndAtInput,
    maxPlayIntentEndAtInput,
    playIntentTimingHelperText,
    playIntentTimingHasError,
    playIntentNote,
    onPlayIntentNoteChange: handlePlayIntentNoteChange,
    playIntentSaving,
    onSavePlayIntent: handleSavePlayIntent,
    onClearPlayIntent: handleClearPlayIntent,
    playIntentPreviews
  }

  return {
    playViewProps
  }
}