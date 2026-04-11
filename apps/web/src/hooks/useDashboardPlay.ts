import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useState } from 'react'
import type {
  ActivePlayIntent,
  DiscoveryPerson,
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
  parseLocalDateTimeInput,
  parsePlayIntentDurationMinutes,
  parsePlayIntentEndAt,
  playIntentPresetDurations,
  toLocalDateTimeInputValue
} from '../components/dashboard/dashboardUtils'
import type { Notice, PlayIntentStartMode, PlayIntentTimingMode } from '../components/dashboard/types'

function buildDefaultScheduledStartAtInput() {
  return toLocalDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000))
}

export type DashboardPlayViewProps = {
  isSignedIn: boolean;
  activePlayIntent: ActivePlayIntent | null;
  isPlayIntentComposerOpen: boolean;
  openPlayIntentComposer: () => void;
  closePlayIntentComposer: () => void;
  canPostPlayIntent: boolean;
  playIntentNotifyScope: PlayIntentNotifyScope;
  onPlayIntentNotifyScopeChange: (scope: PlayIntentNotifyScope) => void;
  playIntentFriendOptions: Array<Pick<DiscoveryPerson, 'id' | 'handle' | 'displayName' | 'avatarUrl'>>;
  selectedPlayIntentTargetUserIds: string[];
  onTogglePlayIntentTargetUser: (userId: string) => void;
  playIntentSelectionMode: PlayIntentSelectionMode;
  onPlayIntentSelectionModeChange: (mode: PlayIntentSelectionMode) => void;
  libraryEntries: LibraryEntry[];
  selectedPlayIntentGameIds: string[];
  onTogglePlayIntentGame: (gameId: string) => void;
  playIntentStartMode: PlayIntentStartMode;
  onPlayIntentStartModeChange: (mode: PlayIntentStartMode) => void;
  playIntentStartAtInput: string;
  onPlayIntentStartAtInputChange: (value: string) => void;
  minPlayIntentStartAtInput: string;
  playIntentStartHelperText: string;
  playIntentStartHasError: boolean;
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
  playIntentFriendOptions,
  playIntentPreviews,
  loadDashboard,
  setActivePlayIntent,
  setPlayIntentNotice
}: {
  isSignedIn: boolean;
  buildApiUrl: (path: string) => string;
  activePlayIntent: ActivePlayIntent | null;
  libraryEntries: LibraryEntry[];
  playIntentFriendOptions: Array<Pick<DiscoveryPerson, 'id' | 'handle' | 'displayName' | 'avatarUrl'>>;
  playIntentPreviews: PlayIntentPreview[];
  loadDashboard: () => Promise<void>;
  setActivePlayIntent: (intent: ActivePlayIntent | null) => void;
  setPlayIntentNotice: Dispatch<SetStateAction<Notice | null>>;
}) {
  const [playIntentSelectionMode, setPlayIntentSelectionMode] = useState<PlayIntentSelectionMode>('library')
  const [playIntentNotifyScope, setPlayIntentNotifyScope] = useState<PlayIntentNotifyScope>('discovery-and-friends')
  const [playIntentStartMode, setPlayIntentStartMode] = useState<PlayIntentStartMode>('now')
  const [playIntentTimingMode, setPlayIntentTimingMode] = useState<PlayIntentTimingMode>('preset')
  const [playIntentDurationMinutes, setPlayIntentDurationMinutes] = useState(120)
  const [playIntentCustomDurationInput, setPlayIntentCustomDurationInput] = useState('120')
  const [playIntentStartAtInput, setPlayIntentStartAtInput] = useState(buildDefaultScheduledStartAtInput)
  const [playIntentEndAtInput, setPlayIntentEndAtInput] = useState(() => buildPlayIntentEndTimeInputValue(120))
  const [playIntentNote, setPlayIntentNote] = useState('')
  const [selectedPlayIntentGameIds, setSelectedPlayIntentGameIds] = useState<string[]>([])
  const [selectedPlayIntentTargetUserIds, setSelectedPlayIntentTargetUserIds] = useState<string[]>([])
  const [playIntentSaving, setPlayIntentSaving] = useState(false)
  const [isPlayIntentComposerOpen, setIsPlayIntentComposerOpen] = useState(false)

  const canPostPlayIntent = libraryEntries.length > 0
  const now = Date.now()
  const parsedPlayIntentStartAt = parseLocalDateTimeInput(playIntentStartAtInput)
  const parsedPlayIntentCustomDurationMinutes = parsePlayIntentDurationMinutes(playIntentCustomDurationInput)
  const parsedPlayIntentEndAt = parsePlayIntentEndAt(playIntentEndAtInput)
  const playIntentStartValidationMessage = playIntentStartMode === 'scheduled'
    ? parsedPlayIntentStartAt == null
      ? 'Choose a valid start time.'
      : parsedPlayIntentStartAt.getTime() <= now
        ? 'Choose a future start time or switch back to starting now.'
        : null
    : null
  const resolvedPlayIntentStartAt = playIntentStartMode === 'scheduled'
    ? parsedPlayIntentStartAt
    : new Date(now)
  const playIntentTimingBaseDate = resolvedPlayIntentStartAt ?? new Date(now)
  const resolvedPlayIntentDurationMinutes = playIntentTimingMode === 'custom'
    ? parsedPlayIntentCustomDurationMinutes
    : playIntentTimingMode === 'end-time'
      ? parsedPlayIntentEndAt
        ? Math.ceil((parsedPlayIntentEndAt.getTime() - playIntentTimingBaseDate.getTime()) / (60 * 1000))
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
      ? playIntentStartValidationMessage
        ? 'Choose a valid start time first.'
        : parsedPlayIntentEndAt == null
          ? 'Choose a valid end time.'
          : resolvedPlayIntentDurationMinutes == null || resolvedPlayIntentDurationMinutes < minimumPlayIntentDurationMinutes
            ? `Choose an end time at least ${minimumPlayIntentDurationMinutes} minutes after the session starts.`
            : resolvedPlayIntentDurationMinutes > maximumPlayIntentDurationMinutes
              ? 'Calls to play can stay live for up to 24 hours.'
              : null
      : null
  const playIntentPreviewEndsAt = playIntentTimingMode === 'end-time'
    ? parsedPlayIntentEndAt
    : resolvedPlayIntentDurationMinutes == null
      ? null
      : new Date(playIntentTimingBaseDate.getTime() + resolvedPlayIntentDurationMinutes * 60 * 1000)
  const minPlayIntentStartAtInput = toLocalDateTimeInputValue(new Date(now + 60 * 1000))
  const minPlayIntentEndAtInput = buildPlayIntentEndTimeInputValue(minimumPlayIntentDurationMinutes, playIntentTimingBaseDate)
  const maxPlayIntentEndAtInput = buildPlayIntentEndTimeInputValue(maximumPlayIntentDurationMinutes, playIntentTimingBaseDate)
  const playIntentStartHelperText = playIntentStartValidationMessage
    ? playIntentStartValidationMessage
    : playIntentStartMode === 'scheduled' && resolvedPlayIntentStartAt
      ? `Starts ${resolvedPlayIntentStartAt.toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })}.`
      : 'Friends can see this call to play as soon as you post it.'
  const playIntentStartHasError = playIntentStartValidationMessage != null
  const playIntentTimingHelperText = playIntentTimingValidationMessage
    ? playIntentTimingValidationMessage
    : playIntentPreviewEndsAt && resolvedPlayIntentDurationMinutes != null
      ? playIntentStartMode === 'scheduled' && resolvedPlayIntentStartAt
        ? `Starts ${resolvedPlayIntentStartAt.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          })} and ends ${playIntentPreviewEndsAt.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          })} (${formatPlayIntentDurationLabel(resolvedPlayIntentDurationMinutes)}).`
        : `Ends ${playIntentPreviewEndsAt.toLocaleString([], {
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
      setPlayIntentStartMode('now')
      setPlayIntentTimingMode('preset')
      setPlayIntentDurationMinutes(120)
      setPlayIntentCustomDurationInput('120')
      setPlayIntentStartAtInput(buildDefaultScheduledStartAtInput())
      setPlayIntentEndAtInput(buildPlayIntentEndTimeInputValue(120))
      setPlayIntentNote('')
      setSelectedPlayIntentGameIds([])
      setSelectedPlayIntentTargetUserIds([])
      return
    }

    const durationMinutes = Math.max(
      30,
      Math.min(
        480,
        Math.round((new Date(activePlayIntent.windowEndsAt).getTime() - new Date(activePlayIntent.windowStartsAt).getTime()) / (60 * 1000))
      )
    )
    const startsAt = new Date(activePlayIntent.windowStartsAt)
    const isScheduledIntent = startsAt.getTime() > Date.now() + 60 * 1000

    setPlayIntentSelectionMode(activePlayIntent.selectionMode)
    setPlayIntentNotifyScope(activePlayIntent.notifyScope)
    setPlayIntentStartMode(isScheduledIntent ? 'scheduled' : 'now')
    setPlayIntentTimingMode(playIntentPresetDurations.includes(durationMinutes as (typeof playIntentPresetDurations)[number]) ? 'preset' : 'end-time')
    setPlayIntentDurationMinutes(durationMinutes)
    setPlayIntentCustomDurationInput(String(durationMinutes))
    setPlayIntentStartAtInput(toLocalDateTimeInputValue(activePlayIntent.windowStartsAt))
    setPlayIntentEndAtInput(toLocalDateTimeInputValue(activePlayIntent.windowEndsAt))
    setPlayIntentNote(activePlayIntent.note)
    setSelectedPlayIntentGameIds(activePlayIntent.games.map((game) => game.id))
    setSelectedPlayIntentTargetUserIds(activePlayIntent.targetedFriends.map((friend) => friend.id))
  }, [activePlayIntent])

  const togglePlayIntentGame = useCallback((gameId: string) => {
    setSelectedPlayIntentGameIds((current) =>
      current.includes(gameId)
        ? current.filter((entry) => entry !== gameId)
        : [...current, gameId]
    )
    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const handleTogglePlayIntentTargetUser = useCallback((userId: string) => {
    setSelectedPlayIntentTargetUserIds((current) =>
      current.includes(userId)
        ? current.filter((entry) => entry !== userId)
        : [...current, userId]
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

    if (playIntentNotifyScope === 'specific-friends' && selectedPlayIntentTargetUserIds.length === 0) {
      setPlayIntentNotice({
        tone: 'danger',
        message: 'Choose at least one friend before posting a specific-friends call to play.'
      })
      return
    }

    if (playIntentStartValidationMessage) {
      setPlayIntentNotice({
        tone: 'danger',
        message: playIntentStartValidationMessage
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

    const schedulingPayload = playIntentStartMode === 'scheduled'
      ? { startAt: parsedPlayIntentStartAt?.toISOString() }
      : {}
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
          ...schedulingPayload,
          ...timingPayload,
          note: playIntentNote.trim() || undefined,
          gameIds: playIntentSelectionMode === 'subset' ? selectedPlayIntentGameIds : [],
          targetUserIds: playIntentNotifyScope === 'specific-friends' ? selectedPlayIntentTargetUserIds : []
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
      const isScheduledIntent = new Date(parsedResponse.activeIntent.windowStartsAt).getTime() > Date.now() + 60 * 1000
      setActivePlayIntent(parsedResponse.activeIntent)
      setIsPlayIntentComposerOpen(false)
      setPlayIntentNotice({
        tone: 'success',
        message: isScheduledIntent
          ? parsedResponse.notifiedFriendCount > 0
            ? `Your call to play is scheduled. ${parsedResponse.notifiedFriendCount} overlapping friend${parsedResponse.notifiedFriendCount === 1 ? '' : 's'} were notified.`
            : 'Your call to play is scheduled. No overlapping friends matched that time window yet.'
          : parsedResponse.notifiedFriendCount > 0
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
    playIntentStartMode,
    playIntentStartValidationMessage,
    playIntentTimingMode,
    playIntentTimingValidationMessage,
    parsedPlayIntentStartAt,
    resolvedPlayIntentDurationMinutes,
    selectedPlayIntentGameIds,
    selectedPlayIntentTargetUserIds,
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
      setIsPlayIntentComposerOpen(false)
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

  const handlePlayIntentStartModeChange = useCallback((mode: PlayIntentStartMode) => {
    setPlayIntentStartMode(mode)

    if (mode === 'now') {
      setPlayIntentStartAtInput(buildDefaultScheduledStartAtInput())

      if (playIntentTimingMode !== 'end-time') {
        setPlayIntentEndAtInput(buildPlayIntentEndTimeInputValue(playIntentDurationMinutes))
      }
    } else {
      const nextStartAt = parsedPlayIntentStartAt && parsedPlayIntentStartAt.getTime() > Date.now()
        ? parsedPlayIntentStartAt
        : new Date(Date.now() + 60 * 60 * 1000)

      setPlayIntentStartAtInput(toLocalDateTimeInputValue(nextStartAt))

      if (playIntentTimingMode !== 'end-time') {
        setPlayIntentEndAtInput(buildPlayIntentEndTimeInputValue(playIntentDurationMinutes, nextStartAt))
      }
    }

    setPlayIntentNotice(null)
  }, [parsedPlayIntentStartAt, playIntentDurationMinutes, playIntentTimingMode, setPlayIntentNotice])

  const handlePlayIntentTimingModeChange = useCallback((mode: PlayIntentTimingMode) => {
    setPlayIntentTimingMode(mode)

    if (mode === 'end-time') {
      setPlayIntentEndAtInput(buildPlayIntentEndTimeInputValue(
        playIntentDurationMinutes,
        playIntentStartMode === 'scheduled' && parsedPlayIntentStartAt ? parsedPlayIntentStartAt : new Date()
      ))
    }

    setPlayIntentNotice(null)
  }, [parsedPlayIntentStartAt, playIntentDurationMinutes, playIntentStartMode, setPlayIntentNotice])

  const handlePlayIntentPresetSelect = useCallback((durationMinutes: number) => {
    setPlayIntentDurationMinutes(durationMinutes)
    setPlayIntentTimingMode('preset')
    setPlayIntentCustomDurationInput(String(durationMinutes))

    const baseDate = playIntentStartMode === 'scheduled' && parsedPlayIntentStartAt
      ? parsedPlayIntentStartAt
      : new Date()

    setPlayIntentEndAtInput(buildPlayIntentEndTimeInputValue(durationMinutes, baseDate))
    setPlayIntentNotice(null)
  }, [parsedPlayIntentStartAt, playIntentStartMode, setPlayIntentNotice])

  const handlePlayIntentCustomDurationInputChange = useCallback((value: string) => {
    setPlayIntentCustomDurationInput(value)
    setPlayIntentTimingMode('custom')

    const nextDurationMinutes = parsePlayIntentDurationMinutes(value)

    if (nextDurationMinutes != null) {
      setPlayIntentDurationMinutes(nextDurationMinutes)

      const baseDate = playIntentStartMode === 'scheduled' && parsedPlayIntentStartAt
        ? parsedPlayIntentStartAt
        : new Date()

      setPlayIntentEndAtInput(buildPlayIntentEndTimeInputValue(nextDurationMinutes, baseDate))
    }

    setPlayIntentNotice(null)
  }, [parsedPlayIntentStartAt, playIntentStartMode, setPlayIntentNotice])

  const handlePlayIntentStartAtInputChange = useCallback((value: string) => {
    setPlayIntentStartAtInput(value)

    const nextStartAt = parseLocalDateTimeInput(value)

    if (nextStartAt && playIntentTimingMode !== 'end-time') {
      setPlayIntentEndAtInput(buildPlayIntentEndTimeInputValue(playIntentDurationMinutes, nextStartAt))
    }

    setPlayIntentNotice(null)
  }, [playIntentDurationMinutes, playIntentTimingMode, setPlayIntentNotice])

  const handlePlayIntentEndAtInputChange = useCallback((value: string) => {
    setPlayIntentTimingMode('end-time')
    setPlayIntentEndAtInput(value)
    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const handlePlayIntentNoteChange = useCallback((value: string) => {
    setPlayIntentNote(value)
    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const openPlayIntentComposer = useCallback(() => {
    setIsPlayIntentComposerOpen(true)
    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const closePlayIntentComposer = useCallback(() => {
    setIsPlayIntentComposerOpen(false)
    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const playViewProps: DashboardPlayViewProps = {
    isSignedIn,
    activePlayIntent,
    isPlayIntentComposerOpen,
    openPlayIntentComposer,
    closePlayIntentComposer,
    canPostPlayIntent,
    playIntentNotifyScope,
    onPlayIntentNotifyScopeChange: handlePlayIntentNotifyScopeChange,
    playIntentFriendOptions,
    selectedPlayIntentTargetUserIds,
    onTogglePlayIntentTargetUser: handleTogglePlayIntentTargetUser,
    playIntentSelectionMode,
    onPlayIntentSelectionModeChange: handlePlayIntentSelectionModeChange,
    libraryEntries,
    selectedPlayIntentGameIds,
    onTogglePlayIntentGame: togglePlayIntentGame,
    playIntentStartMode,
    onPlayIntentStartModeChange: handlePlayIntentStartModeChange,
    playIntentStartAtInput,
    onPlayIntentStartAtInputChange: handlePlayIntentStartAtInputChange,
    minPlayIntentStartAtInput,
    playIntentStartHelperText,
    playIntentStartHasError,
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