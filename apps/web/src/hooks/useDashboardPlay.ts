import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useState } from 'react'
import type {
  ActivePlayIntent,
  DiscordServerPreference,
  DiscordVoiceChannel,
  DiscoveryPerson,
  LibraryEntry,
  PlayIntentDetail,
  PlayIntentNotifyScope,
  PlayIntentPreview,
  PlayIntentRecipientResponseChoice,
  PlayIntentRecipientResponseResult,
  PlayIntentSelectionMode,
  UpsertPlayIntentResponse
} from '@game-is-up/shared'
import {
  discordVoiceChannelsResponseSchema,
  playIntentDiscordSpaceDeleteResponseSchema,
  playIntentDiscordSpaceRetryResponseSchema,
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
import { formatMonthDayTime } from '../lib/dateTime'
import type {
  DashboardLibraryQuickAddGame,
  FriendTarget,
  Notice,
  PlayIntentStartMode,
  PlayIntentTimingMode,
  PlayIntentVoiceMode
} from '../components/dashboard/types'

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

function toComposerPlayIntent(intent: ActivePlayIntent | PlayIntentDetail): ActivePlayIntent {
  if ('windowStartsAt' in intent) {
    return intent
  }

  return {
    id: intent.id,
    title: intent.title,
    selectionMode: intent.selectionMode,
    notifyScope: intent.notifyScope,
    targetServers: intent.targetServers,
    targetedFriends: intent.targetedFriends,
    platforms: intent.platforms,
    games: intent.games,
    note: intent.note,
    voiceChannelId: intent.voiceChannelId,
    voiceChannelName: intent.voiceChannelName,
    discordSpace: intent.discordSpace,
    windowStartsAt: intent.availabilityWindow.startsAt,
    windowEndsAt: intent.availabilityWindow.endsAt,
    expiresAt: intent.availabilityWindow.endsAt,
    interestedUsers: intent.interestedUsers,
    interestedCount: intent.interestedCount
  }
}

export type DashboardPlayViewProps = {
  isSignedIn: boolean;
  isAdmin: boolean;
  activePlayIntent: ActivePlayIntent | null;
  composerPlayIntent: ActivePlayIntent | null;
  isPlayIntentComposerOpen: boolean;
  openPlayIntentComposer: () => void;
  openPlayIntentComposerForIntent: (intent: ActivePlayIntent | PlayIntentDetail) => void;
  closePlayIntentComposer: () => void;
  canPostPlayIntent: boolean;
  playIntentFilteredAudienceMessage: string | null;
  playIntentTargetedAudienceWarningMessage: string | null;
  playIntentUnmatchedTargetUsers: Array<Pick<DiscoveryPerson, 'id' | 'displayName' | 'avatarUrl'>>;
  playIntentNotifyScope: PlayIntentNotifyScope;
  onPlayIntentNotifyScopeChange: (scope: PlayIntentNotifyScope) => void;
  playIntentFriendOptions: Array<Pick<DiscoveryPerson, 'id' | 'handle' | 'displayName' | 'avatarUrl'>>;
  playIntentDiscordServerOptions: DiscordServerPreference[];
  selectedPlayIntentTargetDiscordServerIds: string[];
  onTogglePlayIntentTargetDiscordServer: (serverId: string) => void;
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
  playIntentVoiceMode: PlayIntentVoiceMode;
  onPlayIntentVoiceModeChange: (mode: PlayIntentVoiceMode) => void;
  playIntentVoiceChannelId: string;
  playIntentVoiceChannelOptions: DiscordVoiceChannel[];
  onPlayIntentVoiceChannelSelect: (channelId: string | null) => void;
  playIntentSaving: boolean;
  onSavePlayIntent: () => Promise<void>;
  onSavePlayIntentToSelf: () => Promise<void>;
  onClearPlayIntent: () => Promise<void>;
  playIntentPreviews: PlayIntentPreview[];
  playIntentResponsePendingIntentId: string | null;
  onRespondToPlayIntent: (playIntentId: string, responseChoice: PlayIntentRecipientResponseChoice) => Promise<void>;
  playIntentDiscordSpaceRetryPendingIntentId: string | null;
  onRetryPlayIntentDiscordSpace: (playIntentId: string) => Promise<void>;
  playIntentDiscordSpaceDeletePendingIntentId: string | null;
  onDeletePlayIntentDiscordSpace: (playIntentId: string) => Promise<void>;
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
  setPlayIntentNotice: Dispatch<SetStateAction<Notice | null>>;
}) {
  const [playIntentSelectionMode, setPlayIntentSelectionMode] = useState<PlayIntentSelectionMode>('library')
  const [playIntentNotifyScope, setPlayIntentNotifyScope] = useState<PlayIntentNotifyScope>('network')
  const [playIntentStartMode, setPlayIntentStartMode] = useState<PlayIntentStartMode>('now')
  const [playIntentTimingMode, setPlayIntentTimingMode] = useState<PlayIntentTimingMode>('preset')
  const [playIntentDurationMinutes, setPlayIntentDurationMinutes] = useState(defaultPlayIntentDurationMinutes)
  const [playIntentCustomDurationInput, setPlayIntentCustomDurationInput] = useState(String(defaultPlayIntentDurationMinutes))
  const [playIntentStartAtInput, setPlayIntentStartAtInput] = useState(buildDefaultScheduledStartAtInput)
  const [playIntentEndAtInput, setPlayIntentEndAtInput] = useState(() => buildPlayIntentEndTimeInputValue(defaultPlayIntentDurationMinutes))
  const [playIntentTitle, setPlayIntentTitle] = useState('')
  const [playIntentNote, setPlayIntentNote] = useState('')
  const [playIntentVoiceMode, setPlayIntentVoiceMode] = useState<PlayIntentVoiceMode>('none')
  const [playIntentVoiceChannelId, setPlayIntentVoiceChannelId] = useState('')
  const [playIntentVoiceChannelName, setPlayIntentVoiceChannelName] = useState('')
  const [playIntentVoiceChannelOptions, setPlayIntentVoiceChannelOptions] = useState<DiscordVoiceChannel[]>([])
  const [selectedPlayIntentGameIds, setSelectedPlayIntentGameIds] = useState<string[]>([])
  const [selectedPlayIntentTargetDiscordServerIds, setSelectedPlayIntentTargetDiscordServerIds] = useState<string[]>([])
  const [selectedPlayIntentTargetUserIds, setSelectedPlayIntentTargetUserIds] = useState<string[]>([])
  const [mutedPlayIntentUserIds, setMutedPlayIntentUserIds] = useState<Set<string>>(new Set())
  const [playIntentResponsePendingIntentId, setPlayIntentResponsePendingIntentId] = useState<string | null>(null)
  const [playIntentDiscordSpaceRetryPendingIntentId, setPlayIntentDiscordSpaceRetryPendingIntentId] = useState<string | null>(null)
  const [playIntentDiscordSpaceDeletePendingIntentId, setPlayIntentDiscordSpaceDeletePendingIntentId] = useState<string | null>(null)
  const [playIntentSaving, setPlayIntentSaving] = useState(false)
  const [isPlayIntentComposerOpen, setIsPlayIntentComposerOpen] = useState(false)
  const [composerPlayIntent, setComposerPlayIntent] = useState<ActivePlayIntent | null>(null)

  const resetPlayIntentComposer = useCallback(() => {
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
    setPlayIntentVoiceMode('none')
    setPlayIntentVoiceChannelId('')
    setPlayIntentVoiceChannelName('')
    setSelectedPlayIntentGameIds([])
    setSelectedPlayIntentTargetDiscordServerIds([])
    setSelectedPlayIntentTargetUserIds([])
  }, [])

  const populatePlayIntentComposer = useCallback((intent: ActivePlayIntent) => {
    const durationMinutes = Math.max(
      30,
      Math.min(
        480,
        Math.round((new Date(intent.windowEndsAt).getTime() - new Date(intent.windowStartsAt).getTime()) / (60 * 1000))
      )
    )
    const startsAt = new Date(intent.windowStartsAt)
    const isScheduledIntent = startsAt.getTime() > Date.now() + 60 * 1000

    setPlayIntentSelectionMode(intent.selectionMode)
    setPlayIntentNotifyScope(intent.notifyScope)
    setPlayIntentStartMode(isScheduledIntent ? 'scheduled' : 'now')
    setPlayIntentTimingMode(playIntentPresetDurations.includes(durationMinutes as (typeof playIntentPresetDurations)[number]) ? 'preset' : 'end-time')
    setPlayIntentDurationMinutes(durationMinutes)
    setPlayIntentCustomDurationInput(String(durationMinutes))
    setPlayIntentStartAtInput(toLocalDateTimeInputValue(intent.windowStartsAt))
    setPlayIntentEndAtInput(toLocalDateTimeInputValue(intent.windowEndsAt))
    setPlayIntentTitle(intent.title)
    setPlayIntentNote(intent.note)
    setPlayIntentVoiceMode(
      intent.discordSpace
        ? 'temporary'
        : intent.voiceChannelId
          ? 'existing'
          : 'none'
    )
    setPlayIntentVoiceChannelId(intent.voiceChannelId ?? '')
    setPlayIntentVoiceChannelName(intent.voiceChannelName ?? '')
    setSelectedPlayIntentGameIds(intent.games.map((game) => game.id))
    setSelectedPlayIntentTargetDiscordServerIds(intent.targetServers.map((server) => server.id))
    setSelectedPlayIntentTargetUserIds(intent.targetedFriends.map((friend) => friend.id))
  }, [])

  const canPostPlayIntent = libraryEntries.length > 0
  const libraryGameIdSet = new Set<string>(libraryEntries.map((entry) => entry.gameId))
  const selectedPlayIntentGameIdSet = new Set<string>(selectedPlayIntentGameIds)
  const currentPlayIntentGameIdSet = playIntentSelectionMode === 'library' ? libraryGameIdSet : selectedPlayIntentGameIdSet
  const selectedPlayIntentTargetUserIdSet = new Set<string>(selectedPlayIntentTargetUserIds)
  const friendDiscoveryPeople = discoveryPeople.filter((person) => person.isFriend)
  const targetedDiscoveryPeople = friendDiscoveryPeople.filter((person) => selectedPlayIntentTargetUserIdSet.has(person.id))
  const unmatchedTargetedDiscoveryPeople = targetedDiscoveryPeople.filter((person) => !personHasGameOverlap(person, currentPlayIntentGameIdSet))
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
  const currentRecipientCount = currentRecipients.length
  const currentAudienceLabel = playIntentNotifyScope === 'network'
    ? 'your friends list or network'
    : playIntentNotifyScope === 'friends-only'
      ? 'your friends list'
      : playIntentNotifyScope === 'specific-friends'
        ? 'the friends you selected'
        : 'that Discord server'
  const playIntentTargetedAudienceWarningMessage = playIntentNotifyScope === 'specific-friends'
    && currentRecipientCount > 0
    && unmatchedTargetedDiscoveryPeople.length > 0
    ? unmatchedTargetedDiscoveryPeople.length === 1
      ? `${unmatchedTargetedDiscoveryPeople[0]!.displayName} will not receive this call to play because ${playIntentSelectionMode === 'subset' ? 'none of the selected games match their library.' : 'your libraries do not overlap.'}`
      : `${unmatchedTargetedDiscoveryPeople.length} selected friends will not receive this call to play because ${playIntentSelectionMode === 'subset' ? 'none of the selected games match their libraries.' : 'their libraries do not overlap with yours.'}`
    : null
  const playIntentFilteredAudienceMessage = !canPostPlayIntent
    ? 'You must have at least one game in your library before you can post a call to play.'
    : playIntentNotifyScope === 'specific-friends' && selectedPlayIntentTargetUserIds.length === 0
      ? 'You must choose at least one friend before posting a friend-specific call to play.'
      : playIntentNotifyScope === 'specific-discord-server' && selectedPlayIntentTargetDiscordServerIds.length === 0
        ? 'You must choose at least one Discord server before posting a server-specific call to play.'
      : playIntentSelectionMode === 'subset' && selectedPlayIntentGameIds.length === 0
        ? 'You must choose at least one game before posting a game-specific call to play.'
        : playIntentNotifyScope === 'specific-discord-server'
          ? null
        : currentRecipientCount > 0
          ? null
          : playIntentSelectionMode === 'subset' && currentScopeLibraryRecipients.length > 0
            ? 'With this game selection, nobody in your network matches. Choose different games.'
            : playIntentNotifyScope === 'specific-friends' && friendRecipientsForCurrentSelection.length > 0
              ? 'None of the friends you selected are a match for the selected games. Choose different games, friends or widen the audience.'
              : playIntentNotifyScope === 'friends-only' && networkRecipientsForCurrentSelection.length > 0
                ? 'None of your friends are a match right now for the selected games. Choose different games, friends, or widen the audience.'
                : `No one in ${currentAudienceLabel} has matching games right now. Choose different games, friends, or widen the audience.`
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
      ? `This call to play reaches people in your network with matching games in their library as soon as you post it. We'll ask you to confirm it at ${formatMonthDayTime(resolvedPlayIntentStartAt)}, then remind those people once you confirm.`
      : 'This call to play reaches people in your network with matching games in their library as soon as you post it.'
  const playIntentStartHasError = playIntentStartValidationMessage != null
  const playIntentTimingHelperText = playIntentTimingValidationMessage
    ? playIntentTimingValidationMessage
    : playIntentPreviewEndsAt && resolvedPlayIntentDurationMinutes != null
      ? playIntentStartMode === 'scheduled' && resolvedPlayIntentStartAt
        ? `Scheduled for ${formatMonthDayTime(resolvedPlayIntentStartAt)} and ending ${formatMonthDayTime(playIntentPreviewEndsAt)} (${formatPlayIntentDurationLabel(resolvedPlayIntentDurationMinutes)}).`
        : `Ends ${formatMonthDayTime(playIntentPreviewEndsAt)} (${formatPlayIntentDurationLabel(resolvedPlayIntentDurationMinutes)}).`
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

  const savePlayIntent = useCallback(async (selfTargetOnly: boolean) => {
    const shouldSelfTarget = selfTargetOnly && isAdmin
    const editingPlayIntentId = composerPlayIntent?.id ?? null

    if (!canPostPlayIntent) {
      setPlayIntentNotice({
        tone: 'danger',
        message: 'You must have at least one game in your library before you can post a call to play.'
      })
      return
    }

    if (playIntentSelectionMode === 'subset' && selectedPlayIntentGameIds.length === 0) {
      setPlayIntentNotice({
        tone: 'danger',
        message: 'You must choose at least one game before posting a game-specific call to play.'
      })
      return
    }

    if (playIntentNotifyScope === 'specific-friends' && selectedPlayIntentTargetUserIds.length === 0) {
      setPlayIntentNotice({
        tone: 'danger',
        message: 'You must choose at least one friend before posting a friend-specific call to play.'
      })
      return
    }

    if (playIntentNotifyScope === 'specific-discord-server' && selectedPlayIntentTargetDiscordServerIds.length === 0) {
      setPlayIntentNotice({
        tone: 'danger',
        message: 'You must choose at least one Discord server before posting a server-specific call to play.'
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

    if (playIntentVoiceMode === 'existing' && !playIntentVoiceChannelId.trim()) {
      setPlayIntentNotice({
        tone: 'danger',
        message: 'Choose an existing Discord voice channel or switch the voice setup back to none.'
      })
      return
    }

    if (!shouldSelfTarget && playIntentFilteredAudienceMessage) {
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
          playIntentId: editingPlayIntentId ?? undefined,
          title: playIntentTitle.trim() || undefined,
          selectionMode: playIntentSelectionMode,
          notifyScope: playIntentNotifyScope,
          includeSelf: shouldSelfTarget,
          createDiscordSpace: playIntentVoiceMode === 'temporary',
          ...schedulingPayload,
          ...timingPayload,
          note: playIntentNote.trim() || undefined,
          voiceChannelId: playIntentVoiceMode === 'existing' ? playIntentVoiceChannelId.trim() || undefined : undefined,
          voiceChannelName: playIntentVoiceMode === 'existing' ? playIntentVoiceChannelName.trim() || undefined : undefined,
          gameIds: playIntentSelectionMode === 'subset' ? selectedPlayIntentGameIds : [],
          targetUserIds: playIntentNotifyScope === 'specific-friends' ? selectedPlayIntentTargetUserIds : [],
          targetDiscordServerIds: playIntentNotifyScope === 'specific-discord-server'
            ? selectedPlayIntentTargetDiscordServerIds
            : []
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
      const isEditingIntent = editingPlayIntentId != null
      const isScheduledIntent = new Date(parsedResponse.activeIntent.windowStartsAt).getTime() > Date.now() + 60 * 1000
      const successMessage = shouldSelfTarget
        ? isScheduledIntent
          ? 'Your test call to play is scheduled. Only you are in the target audience.'
          : 'Your test call to play is live. Only you are in the target audience.'
        : isScheduledIntent
          ? parsedResponse.notifiedFriendCount > 0
            ? `${isEditingIntent ? 'Your call to play was updated and is scheduled.' : 'Your call to play is scheduled.'} ${parsedResponse.notifiedFriendCount} ${parsedResponse.notifiedFriendCount === 1 ? 'person with a matching game was' : 'people with matching games were'} notified.`
            : isEditingIntent
              ? 'Your call to play was updated and is scheduled. No Discord DMs were delivered yet.'
              : 'Your call to play is scheduled. No Discord DMs were delivered yet.'
          : parsedResponse.notifiedFriendCount > 0
            ? `${isEditingIntent ? 'Your call to play was updated and is live.' : 'Your call to play is live.'} ${parsedResponse.notifiedFriendCount} ${parsedResponse.notifiedFriendCount === 1 ? 'person with a matching game was' : 'people with matching games were'} notified.`
            : isEditingIntent
              ? 'Your call to play was updated and is live. No Discord DMs were delivered yet.'
              : 'Your call to play is live. No Discord DMs were delivered yet.'
      const discordSpaceMessage = parsedResponse.activeIntent.discordSpace
        ? ' A temporary Discord channel request was saved for this call to play.'
        : ''
      setComposerPlayIntent(null)
      setIsPlayIntentComposerOpen(false)
      setPlayIntentNotice({
        tone: 'success',
        message: `${successMessage}${discordSpaceMessage}`
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
    playIntentVoiceMode,
    playIntentVoiceChannelId,
    playIntentVoiceChannelName,
    playIntentNotifyScope,
    playIntentSelectionMode,
    playIntentStartMode,
    playIntentStartValidationMessage,
    playIntentFilteredAudienceMessage,
    isAdmin,
    playIntentTimingMode,
    playIntentTimingValidationMessage,
    parsedPlayIntentStartAt,
    resolvedPlayIntentDurationMinutes,
    selectedPlayIntentGameIds,
    selectedPlayIntentTargetDiscordServerIds,
    selectedPlayIntentTargetUserIds,
    setPlayIntentNotice,
    composerPlayIntent
  ])

  const handleSavePlayIntent = useCallback(async () => {
    await savePlayIntent(false)
  }, [savePlayIntent])

  const handleSavePlayIntentToSelf = useCallback(async () => {
    await savePlayIntent(true)
  }, [savePlayIntent])

  const handleClearPlayIntent = useCallback(async () => {
    if (!composerPlayIntent) {
      return
    }

    setPlayIntentSaving(true)
    setPlayIntentNotice(null)

    try {
      const response = await fetch(buildApiUrl(`/api/play-intents/${composerPlayIntent.id}`), {
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

      setComposerPlayIntent(null)
      setIsPlayIntentComposerOpen(false)
      setPlayIntentNotice({
        tone: 'success',
        message: 'This call to play is no longer live.'
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
  }, [buildApiUrl, composerPlayIntent, loadDashboard, setPlayIntentNotice])

  const handlePlayIntentNotifyScopeChange = useCallback((scope: PlayIntentNotifyScope) => {
    setPlayIntentNotifyScope(scope)
    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const handleTogglePlayIntentTargetDiscordServer = useCallback((serverId: string) => {
    setSelectedPlayIntentTargetDiscordServerIds((current) =>
      current.includes(serverId)
        ? current.filter((entry) => entry !== serverId)
        : [...current, serverId]
    )
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

  const handlePlayIntentVoiceModeChange = useCallback((mode: PlayIntentVoiceMode) => {
    setPlayIntentVoiceMode(mode)

    if (mode !== 'existing') {
      setPlayIntentVoiceChannelId('')
      setPlayIntentVoiceChannelName('')
    }

    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const handlePlayIntentVoiceChannelSelect = useCallback((channelId: string | null) => {
    if (!channelId) {
      setPlayIntentVoiceChannelId('')
      setPlayIntentVoiceChannelName('')
      setPlayIntentVoiceMode('none')
      setPlayIntentNotice(null)
      return
    }

    const selectedChannel = playIntentVoiceChannelOptions.find((channel) => channel.id === channelId)

    if (!selectedChannel) {
      return
    }

    setPlayIntentVoiceMode('existing')
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

  const handleDeletePlayIntentDiscordSpace = useCallback(async (playIntentId: string) => {
    setPlayIntentDiscordSpaceDeletePendingIntentId(playIntentId)
    setPlayIntentNotice(null)

    try {
      const response = await fetch(buildApiUrl(`/api/play-intents/${playIntentId}/discord-space`), {
        method: 'DELETE',
        credentials: 'include'
      })

      const responseBody = await response.json() as { error?: string }

      if (!response.ok) {
        setPlayIntentNotice({
          tone: 'danger',
          message: typeof responseBody.error === 'string'
            ? responseBody.error
            : 'Unable to delete the temporary Discord channels right now.'
        })
        return
      }

      const parsed = playIntentDiscordSpaceDeleteResponseSchema.parse(responseBody)

      setPlayIntentNotice({
        tone: 'success',
        message: parsed.message
      })
      await loadDashboard()
    } catch (error) {
      setPlayIntentNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to delete the temporary Discord channels right now.'
      })
    } finally {
      setPlayIntentDiscordSpaceDeletePendingIntentId(null)
    }
  }, [buildApiUrl, loadDashboard, setPlayIntentNotice])

  const handleRetryPlayIntentDiscordSpace = useCallback(async (playIntentId: string) => {
    setPlayIntentDiscordSpaceRetryPendingIntentId(playIntentId)
    setPlayIntentNotice(null)

    try {
      const response = await fetch(buildApiUrl(`/api/play-intents/${playIntentId}/discord-space/retry`), {
        method: 'POST',
        credentials: 'include'
      })

      const responseBody = await response.json() as { error?: string }

      if (!response.ok) {
        setPlayIntentNotice({
          tone: 'danger',
          message: typeof responseBody.error === 'string'
            ? responseBody.error
            : 'Unable to retry the temporary Discord channel access right now.'
        })
        return
      }

      const parsed = playIntentDiscordSpaceRetryResponseSchema.parse(responseBody)

      setPlayIntentNotice({
        tone: 'success',
        message: parsed.message
      })
      await loadDashboard()
    } catch (error) {
      setPlayIntentNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to retry the temporary Discord channel access right now.'
      })
    } finally {
      setPlayIntentDiscordSpaceRetryPendingIntentId(null)
    }
  }, [buildApiUrl, loadDashboard, setPlayIntentNotice])

  const openPlayIntentComposer = useCallback(() => {
    setComposerPlayIntent(null)
    resetPlayIntentComposer()
    setIsPlayIntentComposerOpen(true)
    setPlayIntentNotice(null)
  }, [resetPlayIntentComposer, setPlayIntentNotice])

  const openPlayIntentComposerForIntent = useCallback((intent: ActivePlayIntent | PlayIntentDetail) => {
    const nextComposerIntent = toComposerPlayIntent(intent)

    setComposerPlayIntent(nextComposerIntent)
    populatePlayIntentComposer(nextComposerIntent)
    setIsPlayIntentComposerOpen(true)
    setPlayIntentNotice(null)
  }, [populatePlayIntentComposer, setPlayIntentNotice])

  const closePlayIntentComposer = useCallback(() => {
    setIsPlayIntentComposerOpen(false)
    setPlayIntentNotice(null)
  }, [setPlayIntentNotice])

  const playViewProps: DashboardPlayViewProps = {
    isSignedIn,
    isAdmin,
    activePlayIntent,
    composerPlayIntent,
    isPlayIntentComposerOpen,
    openPlayIntentComposer,
    openPlayIntentComposerForIntent,
    closePlayIntentComposer,
    canPostPlayIntent,
    playIntentFilteredAudienceMessage,
    playIntentTargetedAudienceWarningMessage,
    playIntentUnmatchedTargetUsers: unmatchedTargetedDiscoveryPeople.map((person) => ({
      id: person.id,
      displayName: person.displayName,
      avatarUrl: person.avatarUrl
    })),
    playIntentNotifyScope,
    onPlayIntentNotifyScopeChange: handlePlayIntentNotifyScopeChange,
    playIntentFriendOptions,
    playIntentDiscordServerOptions,
    selectedPlayIntentTargetDiscordServerIds,
    onTogglePlayIntentTargetDiscordServer: handleTogglePlayIntentTargetDiscordServer,
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
    playIntentVoiceMode,
    onPlayIntentVoiceModeChange: handlePlayIntentVoiceModeChange,
    playIntentVoiceChannelId,
    playIntentVoiceChannelOptions,
    onPlayIntentVoiceChannelSelect: handlePlayIntentVoiceChannelSelect,
    playIntentSaving,
    onSavePlayIntent: handleSavePlayIntent,
    onSavePlayIntentToSelf: handleSavePlayIntentToSelf,
    onClearPlayIntent: handleClearPlayIntent,
    playIntentPreviews,
    playIntentResponsePendingIntentId,
    onRespondToPlayIntent: handleRespondToPlayIntent,
    playIntentDiscordSpaceRetryPendingIntentId,
    onRetryPlayIntentDiscordSpace: handleRetryPlayIntentDiscordSpace,
    playIntentDiscordSpaceDeletePendingIntentId,
    onDeletePlayIntentDiscordSpace: handleDeletePlayIntentDiscordSpace,
    mutedPlayIntentUserIds,
    onMutePlayIntentUser: handleMutePlayIntentUser,
    onUnmutePlayIntentUser: handleUnmutePlayIntentUser
  }

  return {
    playViewProps
  }
}