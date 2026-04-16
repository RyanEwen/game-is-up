import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useState } from 'react'
import type {
  ActivePlayIntent,
  DiscordServerPreference,
  DiscordVoiceChannel,
  DiscoveryPerson,
  LibraryEntry,
  PlayIntentNotifyScope,
  PlayIntentPreview,
  PlayIntentRecipientResponseChoice,
  PlayIntentRecipientResponseResult,
  PlayIntentSelectionMode,
  UpsertPlayIntentResponse
} from '@game-is-up/shared'
import {
  discordVoiceChannelsResponseSchema,
  playIntentRecipientResponseResultSchema,
  upsertPlayIntentResponseSchema
} from '@game-is-up/shared'
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
import type { DashboardLibraryQuickAddGame, FriendTarget, Notice, PlayIntentStartMode, PlayIntentTimingMode } from '../components/dashboard/types'

function buildDefaultScheduledStartAtInput() {
  return toLocalDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000))
}

const defaultPlayIntentDurationMinutes: number = playIntentPresetDurations[0]

function personHasGameOverlap(person: DiscoveryPerson, gameIds: ReadonlySet<string>) {
  if (gameIds.size === 0) {
    return false
  }

  return person.games.some((game) => gameIds.has(game.id))
}

export type DashboardPlayViewProps = {
  isSignedIn: boolean;
  isAdmin: boolean;
  activePlayIntent: ActivePlayIntent | null;
  isPlayIntentComposerOpen: boolean;
  openPlayIntentComposer: () => void;
  closePlayIntentComposer: () => void;
  canPostPlayIntent: boolean;
  playIntentFilteredAudienceMessage: string | null;
  playIntentIncludeSelf: boolean;
  onPlayIntentIncludeSelfChange: (nextValue: boolean) => void;
  playIntentNotifyScope: PlayIntentNotifyScope;
  onPlayIntentNotifyScopeChange: (scope: PlayIntentNotifyScope) => void;
  playIntentFriendOptions: Array<Pick<DiscoveryPerson, 'id' | 'handle' | 'displayName' | 'avatarUrl'>>;
  playIntentDiscordServerOptions: DiscordServerPreference[];
  selectedPlayIntentTargetDiscordServerId: string;
  onPlayIntentTargetDiscordServerChange: (serverId: string) => void;
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
  playIntentTitle: string;
  onPlayIntentTitleChange: (value: string) => void;
  playIntentNote: string;
  onPlayIntentNoteChange: (value: string) => void;
  playIntentVoiceChannelId: string;
  playIntentVoiceChannelOptions: DiscordVoiceChannel[];
  onPlayIntentVoiceChannelSelect: (channelId: string | null) => void;
  playIntentSaving: boolean;
  onSavePlayIntent: () => Promise<void>;
  onClearPlayIntent: () => Promise<void>;
  playIntentPreviews: PlayIntentPreview[];
  playIntentResponsePendingIntentId: string | null;
  onRespondToPlayIntent: (playIntentId: string, responseChoice: PlayIntentRecipientResponseChoice) => Promise<void>;
  mutedPlayIntentUserIds: ReadonlySet<string>;
  onMutePlayIntentUser: (userId: string) => Promise<void>;
  onUnmutePlayIntentUser: (userId: string) => Promise<void>;
  discoveryPeople?: DiscoveryPerson[];
  friendPendingId?: string | null;
  onToggleFriend?: (target: FriendTarget) => Promise<void>;
  onAddGameToLibrary?: (game: DashboardLibraryQuickAddGame) => Promise<void>;
}

export function useDashboardPlay({
  isSignedIn,
  isAdmin,
  buildApiUrl,
  activePlayIntent,
  libraryEntries,
  discoveryPeople,
  playIntentFriendOptions,
  playIntentDiscordServerOptions,
  playIntentPreviews,
  loadDashboard,
  setActivePlayIntent,
  setPlayIntentNotice
}: {
  isSignedIn: boolean;
  isAdmin: boolean;
  buildApiUrl: (path: string) => string;
  activePlayIntent: ActivePlayIntent | null;
  libraryEntries: LibraryEntry[];
  discoveryPeople: DiscoveryPerson[];
  playIntentFriendOptions: Array<Pick<DiscoveryPerson, 'id' | 'handle' | 'displayName' | 'avatarUrl'>>;
  playIntentDiscordServerOptions: DiscordServerPreference[];
  playIntentPreviews: PlayIntentPreview[];
  loadDashboard: () => Promise<void>;
  setActivePlayIntent: (intent: ActivePlayIntent | null) => void;
  setPlayIntentNotice: Dispatch<SetStateAction<Notice | null>>;
}) {
  const [playIntentSelectionMode, setPlayIntentSelectionMode] = useState<PlayIntentSelectionMode>('library')
  const [playIntentNotifyScope, setPlayIntentNotifyScope] = useState<PlayIntentNotifyScope>('network')
  const [playIntentIncludeSelf, setPlayIntentIncludeSelf] = useState(false)
  const [playIntentStartMode, setPlayIntentStartMode] = useState<PlayIntentStartMode>('now')
  const [playIntentTimingMode, setPlayIntentTimingMode] = useState<PlayIntentTimingMode>('preset')
  const [playIntentDurationMinutes, setPlayIntentDurationMinutes] = useState(defaultPlayIntentDurationMinutes)
  const [playIntentCustomDurationInput, setPlayIntentCustomDurationInput] = useState(String(defaultPlayIntentDurationMinutes))
  const [playIntentStartAtInput, setPlayIntentStartAtInput] = useState(buildDefaultScheduledStartAtInput)
  const [playIntentEndAtInput, setPlayIntentEndAtInput] = useState(() => buildPlayIntentEndTimeInputValue(defaultPlayIntentDurationMinutes))
  const [playIntentTitle, setPlayIntentTitle] = useState('')
  const [playIntentNote, setPlayIntentNote] = useState('')
  const [playIntentVoiceChannelId, setPlayIntentVoiceChannelId] = useState('')
  const [playIntentVoiceChannelName, setPlayIntentVoiceChannelName] = useState('')
  const [playIntentVoiceChannelOptions, setPlayIntentVoiceChannelOptions] = useState<DiscordVoiceChannel[]>([])
  const [selectedPlayIntentGameIds, setSelectedPlayIntentGameIds] = useState<string[]>([])
  const [selectedPlayIntentTargetDiscordServerId, setSelectedPlayIntentTargetDiscordServerId] = useState('')
  const [selectedPlayIntentTargetUserIds, setSelectedPlayIntentTargetUserIds] = useState<string[]>([])
  const [mutedPlayIntentUserIds, setMutedPlayIntentUserIds] = useState<Set<string>>(new Set())
  const [playIntentResponsePendingIntentId, setPlayIntentResponsePendingIntentId] = useState<string | null>(null)
  const [playIntentSaving, setPlayIntentSaving] = useState(false)
  const [isPlayIntentComposerOpen, setIsPlayIntentComposerOpen] = useState(false)

  const canPostPlayIntent = libraryEntries.length > 0
  const libraryGameIdSet = new Set<string>(libraryEntries.map((entry) => entry.gameId))
  const selectedPlayIntentGameIdSet = new Set<string>(selectedPlayIntentGameIds)
  const currentPlayIntentGameIdSet = playIntentSelectionMode === 'library' ? libraryGameIdSet : selectedPlayIntentGameIdSet
  const selectedPlayIntentTargetUserIdSet = new Set<string>(selectedPlayIntentTargetUserIds)
  const friendDiscoveryPeople = discoveryPeople.filter((person) => person.isFriend)
  const targetedDiscoveryPeople = friendDiscoveryPeople.filter((person) => selectedPlayIntentTargetUserIdSet.has(person.id))
  const networkRecipientsForLibrary = discoveryPeople.filter((person) => personHasGameOverlap(person, libraryGameIdSet))
  const friendRecipientsForLibrary = friendDiscoveryPeople.filter((person) => personHasGameOverlap(person, libraryGameIdSet))
  const targetedRecipientsForLibrary = targetedDiscoveryPeople.filter((person) => personHasGameOverlap(person, libraryGameIdSet))
  const networkRecipientsForCurrentSelection = discoveryPeople.filter((person) => personHasGameOverlap(person, currentPlayIntentGameIdSet))
  const friendRecipientsForCurrentSelection = friendDiscoveryPeople.filter((person) => personHasGameOverlap(person, currentPlayIntentGameIdSet))
  const targetedRecipientsForCurrentSelection = targetedDiscoveryPeople.filter((person) => personHasGameOverlap(person, currentPlayIntentGameIdSet))
  const currentScopeLibraryRecipients = playIntentNotifyScope === 'network'
    ? networkRecipientsForLibrary
    : playIntentNotifyScope === 'friends-only'
      ? friendRecipientsForLibrary
      : playIntentNotifyScope === 'specific-friends'
        ? targetedRecipientsForLibrary
        : []
  const currentRecipients = playIntentNotifyScope === 'network'
    ? networkRecipientsForCurrentSelection
    : playIntentNotifyScope === 'friends-only'
      ? friendRecipientsForCurrentSelection
      : playIntentNotifyScope === 'specific-friends'
        ? targetedRecipientsForCurrentSelection
        : []
  const currentRecipientCount = currentRecipients.length + (isAdmin && playIntentIncludeSelf ? 1 : 0)
  const currentAudienceLabel = playIntentNotifyScope === 'network'
    ? 'your friends list or network'
    : playIntentNotifyScope === 'friends-only'
      ? 'your friends list'
      : playIntentNotifyScope === 'specific-friends'
        ? 'the friends you selected'
        : 'that Discord server'
  const playIntentFilteredAudienceMessage = !canPostPlayIntent
    ? null
    : playIntentNotifyScope === 'specific-friends' && selectedPlayIntentTargetUserIds.length === 0
      ? 'Choose at least one friend before posting a specific-friends call to play. Without a selection, nobody will receive it.'
      : playIntentNotifyScope === 'specific-discord-server' && !selectedPlayIntentTargetDiscordServerId
        ? 'Choose one Discord server before posting a server-targeted call to play.'
      : playIntentSelectionMode === 'subset' && selectedPlayIntentGameIds.length === 0
        ? 'Pick at least one game before posting a selected-games call to play. Without a selection, nobody will receive it.'
        : playIntentNotifyScope === 'specific-discord-server'
          ? null
        : currentRecipientCount > 0
          ? null
          : playIntentSelectionMode === 'subset' && currentScopeLibraryRecipients.length > 0
            ? 'With these game choices, nobody in your network matches right now. Pick different games or switch back to any game in your library.'
            : playIntentNotifyScope === 'specific-friends' && friendRecipientsForCurrentSelection.length > 0
              ? 'The friends you selected are not a match for this call to play right now. Pick different friends or widen the audience.'
              : playIntentNotifyScope === 'friends-only' && networkRecipientsForCurrentSelection.length > 0
                ? 'With friends-only selected, nobody in your network is a match right now. Switch back to your network or add friends who have games in their library that match yours.'
                : `No one in ${currentAudienceLabel} can currently receive this call to play.`
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
    if (!isSignedIn) {
      setPlayIntentVoiceChannelOptions([])
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const response = await fetch(buildApiUrl('/api/discord-servers/me/voice-channels'), {
          credentials: 'include'
        })

        if (!response.ok) {
          if (!cancelled) {
            setPlayIntentVoiceChannelOptions([])
          }
          return
        }

        const parsed = discordVoiceChannelsResponseSchema.parse(await response.json())

        if (!cancelled) {
          setPlayIntentVoiceChannelOptions(parsed.channels)
        }
      } catch {
        if (!cancelled) {
          setPlayIntentVoiceChannelOptions([])
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [buildApiUrl, isSignedIn])

  useEffect(() => {
    if (!isSignedIn) {
      setMutedPlayIntentUserIds(new Set())
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const response = await fetch(buildApiUrl('/api/play-intents/mutes'), {
          credentials: 'include'
        })

        if (!response.ok) {
          return
        }

        const responseBody = (await response.json()) as { mutes?: Array<{ mutedUserId: string }> }

        if (cancelled || !Array.isArray(responseBody.mutes)) {
          return
        }

        setMutedPlayIntentUserIds(new Set(responseBody.mutes.map((mute) => mute.mutedUserId)))
      } catch {
        if (!cancelled) {
          setMutedPlayIntentUserIds(new Set())
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [buildApiUrl, isSignedIn])

  useEffect(() => {
    if (!activePlayIntent) {
      setPlayIntentSelectionMode('library')
      setPlayIntentNotifyScope('network')
      setPlayIntentStartMode('now')
      setPlayIntentTimingMode('preset')
      setPlayIntentDurationMinutes(defaultPlayIntentDurationMinutes)
      setPlayIntentCustomDurationInput(String(defaultPlayIntentDurationMinutes))
      setPlayIntentStartAtInput(buildDefaultScheduledStartAtInput())
      setPlayIntentEndAtInput(buildPlayIntentEndTimeInputValue(defaultPlayIntentDurationMinutes))
      setPlayIntentTitle('')
      setPlayIntentNote('')
      setPlayIntentVoiceChannelId('')
      setPlayIntentVoiceChannelName('')
      setSelectedPlayIntentGameIds([])
      setSelectedPlayIntentTargetDiscordServerId('')
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
    setPlayIntentTitle(activePlayIntent.title)
    setPlayIntentNote(activePlayIntent.note)
    setPlayIntentVoiceChannelId(activePlayIntent.voiceChannelId ?? '')
    setPlayIntentVoiceChannelName(activePlayIntent.voiceChannelName ?? '')
    setSelectedPlayIntentGameIds(activePlayIntent.games.map((game) => game.id))
    setSelectedPlayIntentTargetDiscordServerId(activePlayIntent.targetServer?.id ?? '')
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

    if (playIntentNotifyScope === 'specific-discord-server' && !selectedPlayIntentTargetDiscordServerId) {
      setPlayIntentNotice({
        tone: 'danger',
        message: 'Choose one Discord server before posting a server-targeted call to play.'
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

    if (playIntentFilteredAudienceMessage) {
      setPlayIntentNotice({
        tone: 'danger',
        message: playIntentFilteredAudienceMessage
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
          title: playIntentTitle.trim() || undefined,
          selectionMode: playIntentSelectionMode,
          notifyScope: playIntentNotifyScope,
          includeSelf: isAdmin && playIntentIncludeSelf,
          ...schedulingPayload,
          ...timingPayload,
          note: playIntentNote.trim() || undefined,
          voiceChannelId: playIntentVoiceChannelId.trim() || undefined,
          voiceChannelName: playIntentVoiceChannelName.trim() || undefined,
          gameIds: playIntentSelectionMode === 'subset' ? selectedPlayIntentGameIds : [],
          targetUserIds: playIntentNotifyScope === 'specific-friends' ? selectedPlayIntentTargetUserIds : [],
          targetDiscordServerId: playIntentNotifyScope === 'specific-discord-server'
            ? selectedPlayIntentTargetDiscordServerId
            : undefined
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
            ? `Your call to play is scheduled. ${parsedResponse.notifiedFriendCount} ${parsedResponse.notifiedFriendCount === 1 ? 'person with a matching game was' : 'people with matching games were'} notified.`
            : 'Your call to play is scheduled. No Discord DMs were delivered yet.'
          : parsedResponse.notifiedFriendCount > 0
            ? `Your call to play is live. ${parsedResponse.notifiedFriendCount} ${parsedResponse.notifiedFriendCount === 1 ? 'person with a matching game was' : 'people with matching games were'} notified.`
            : 'Your call to play is live. No Discord DMs were delivered yet.'
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
    playIntentTitle,
    playIntentNote,
    playIntentVoiceChannelId,
    playIntentVoiceChannelName,
    playIntentNotifyScope,
    playIntentSelectionMode,
    playIntentStartMode,
    playIntentStartValidationMessage,
    playIntentFilteredAudienceMessage,
    isAdmin,
    playIntentIncludeSelf,
    playIntentTimingMode,
    playIntentTimingValidationMessage,
    parsedPlayIntentStartAt,
    resolvedPlayIntentDurationMinutes,
    selectedPlayIntentGameIds,
    selectedPlayIntentTargetDiscordServerId,
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

  const handlePlayIntentTargetDiscordServerChange = useCallback((serverId: string) => {
    setSelectedPlayIntentTargetDiscordServerId(serverId)
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

  const handlePlayIntentTitleChange = useCallback((value: string) => {
    setPlayIntentTitle(value)
    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const handlePlayIntentVoiceChannelSelect = useCallback((channelId: string | null) => {
    if (!channelId) {
      setPlayIntentVoiceChannelId('')
      setPlayIntentVoiceChannelName('')
      setPlayIntentNotice(null)
      return
    }

    const selectedChannel = playIntentVoiceChannelOptions.find((channel) => channel.id === channelId)

    if (!selectedChannel) {
      return
    }

    setPlayIntentVoiceChannelId(selectedChannel.id)
    setPlayIntentVoiceChannelName(selectedChannel.name)
    setPlayIntentNotice(null)
  }, [playIntentVoiceChannelOptions, setPlayIntentNotice])

  const handleMutePlayIntentUser = useCallback(async (userId: string) => {
    const response = await fetch(buildApiUrl(`/api/play-intents/mutes/${userId}`), {
      method: 'PUT',
      credentials: 'include'
    })

    if (response.ok) {
      setMutedPlayIntentUserIds((current) => new Set([...current, userId]))
      await loadDashboard()
    }
  }, [buildApiUrl, loadDashboard])

  const handleUnmutePlayIntentUser = useCallback(async (userId: string) => {
    const response = await fetch(buildApiUrl(`/api/play-intents/mutes/${userId}`), {
      method: 'DELETE',
      credentials: 'include'
    })

    if (response.ok) {
      setMutedPlayIntentUserIds((current) => {
        const next = new Set(current)
        next.delete(userId)
        return next
      })
      await loadDashboard()
    }
  }, [buildApiUrl, loadDashboard])

  const handleRespondToPlayIntent = useCallback(async (playIntentId: string, responseChoice: PlayIntentRecipientResponseChoice) => {
    setPlayIntentResponsePendingIntentId(playIntentId)
    setPlayIntentNotice(null)

    try {
      const response = await fetch(buildApiUrl(`/api/play-intents/${playIntentId}/respond`), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          choice: responseChoice
        })
      })

      const responseBody = (await response.json()) as PlayIntentRecipientResponseResult | { error?: string }

      if (!response.ok) {
        setPlayIntentNotice({
          tone: 'danger',
          message:
            typeof responseBody === 'object' && responseBody && 'error' in responseBody && typeof responseBody.error === 'string'
              ? responseBody.error
              : 'Unable to update your response right now.'
        })
        return
      }

      const parsed = playIntentRecipientResponseResultSchema.parse(responseBody)
      setPlayIntentNotice({
        tone: 'success',
        message: parsed.message
      })
      await loadDashboard()
    } catch (error) {
      setPlayIntentNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to update your response right now.'
      })
    } finally {
      setPlayIntentResponsePendingIntentId(null)
    }
  }, [buildApiUrl, loadDashboard, setPlayIntentNotice])

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
    isAdmin,
    activePlayIntent,
    isPlayIntentComposerOpen,
    openPlayIntentComposer,
    closePlayIntentComposer,
    canPostPlayIntent,
    playIntentFilteredAudienceMessage,
    playIntentIncludeSelf,
    onPlayIntentIncludeSelfChange: setPlayIntentIncludeSelf,
    playIntentNotifyScope,
    onPlayIntentNotifyScopeChange: handlePlayIntentNotifyScopeChange,
    playIntentFriendOptions,
    playIntentDiscordServerOptions,
    selectedPlayIntentTargetDiscordServerId,
    onPlayIntentTargetDiscordServerChange: handlePlayIntentTargetDiscordServerChange,
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
    playIntentTitle,
    onPlayIntentTitleChange: handlePlayIntentTitleChange,
    playIntentNote,
    onPlayIntentNoteChange: handlePlayIntentNoteChange,
    playIntentVoiceChannelId,
    playIntentVoiceChannelOptions,
    onPlayIntentVoiceChannelSelect: handlePlayIntentVoiceChannelSelect,
    playIntentSaving,
    onSavePlayIntent: handleSavePlayIntent,
    onClearPlayIntent: handleClearPlayIntent,
    playIntentPreviews,
    playIntentResponsePendingIntentId,
    onRespondToPlayIntent: handleRespondToPlayIntent,
    mutedPlayIntentUserIds,
    onMutePlayIntentUser: handleMutePlayIntentUser,
    onUnmutePlayIntentUser: handleUnmutePlayIntentUser
  }

  return {
    playViewProps
  }
}