import { useEffect, useState, type ReactNode } from 'react'
import { Avatar, Button, Card, Chip, DialogContent, DialogTitle, Input, Option, Select, Stack, Step, StepButton, StepIndicator, Stepper, Typography } from '@mui/joy'
import { THEME_ID as MATERIAL_THEME_ID, ThemeProvider, createTheme } from '@mui/material/styles'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import type {
  ActivePlayIntent,
  DiscordServerPreference,
  DiscordVoiceChannel,
  DiscoveryPerson,
  LibraryEntry,
  PlayIntentNotifyScope,
  PlayIntentSelectionMode
} from '@game-is-up/shared'
import {
  formatPlayIntentDurationLabel,
  formatNotifyScopeDescription,
  formatNotifyScopeLabel,
  formatPlayIntentSelectionModeLabel,
  maximumPlayIntentDurationMinutes,
  minimumPlayIntentDurationMinutes,
  playIntentPresetDurations
} from './dashboardUtils'
import { formatMonthDayTime } from '../../lib/dateTime'
import { DashboardModalActionBar } from './DashboardModalActionBar'
import type { PlayIntentStartMode, PlayIntentTimingMode, PlayIntentVoiceMode } from './types'
import dayjs, { type Dayjs } from 'dayjs'

const localDateTimeFormat = 'YYYY-MM-DDTHH:mm'

const playIntentPickerTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#33d7a6',
      light: '#57f4c1',
      dark: '#14886a'
    },
    background: {
      default: '#070b14',
      paper: '#121a28'
    },
    text: {
      primary: '#ffffff',
      secondary: '#d1dbe5'
    },
    divider: '#3b4d66'
  },
  shape: {
    borderRadius: 16
  },
  typography: {
    fontFamily: 'IBM Plex Sans, sans-serif'
  }
})

function toPickerValue(value: string): Dayjs | null {
  if (!value) {
    return null
  }

  const parsedValue = dayjs(value)

  return parsedValue.isValid() ? parsedValue : null
}

function toLocalDateTimeValue(value: Dayjs | null): string {
  return value && value.isValid() ? value.format(localDateTimeFormat) : ''
}

function PlayIntentDateTimeInput({
  value,
  minDateTime,
  maxDateTime,
  error,
  onChange
}: {
  value: string;
  minDateTime?: string;
  maxDateTime?: string;
  error: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <ThemeProvider theme={{ [MATERIAL_THEME_ID]: playIntentPickerTheme }}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <DateTimePicker
          value={toPickerValue(value)}
          minDateTime={toPickerValue(minDateTime ?? '') ?? undefined}
          maxDateTime={toPickerValue(maxDateTime ?? '') ?? undefined}
          format="ddd, MMM D, h:mm A"
          minutesStep={5}
          timeSteps={{ minutes: 5 }}
          onChange={(nextValue) => onChange(toLocalDateTimeValue(nextValue))}
          slotProps={{
            textField: {
              fullWidth: true,
              error,
              size: 'small',
              sx: {
                '& .MuiInputBase-root': {
                  minHeight: 48,
                  backgroundColor: 'rgba(31, 42, 58, 0.87)',
                  color: '#ffffff'
                },
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#3b4d66'
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#506077'
                },
                '& .Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#33d7a6'
                },
                '& .MuiIconButton-root': {
                  color: '#d1dbe5'
                }
              }
            },
            desktopPaper: {
              sx: {
                backgroundImage: 'none',
                backgroundColor: '#121a28',
                border: '1px solid #3b4d66'
              }
            },
            mobilePaper: {
              sx: {
                backgroundImage: 'none',
                backgroundColor: '#121a28',
                border: '1px solid #3b4d66'
              }
            },
            popper: {
              sx: {
                '& .MuiPaper-root': {
                  backgroundImage: 'none',
                  backgroundColor: '#121a28',
                  border: '1px solid #3b4d66'
                }
              }
            }
          }}
        />
      </LocalizationProvider>
    </ThemeProvider>
  )
}

type ComposerStepId = 'basics' | 'audience' | 'timing' | 'details'

type ComposerSummaryChip = {
  key: string;
  label: string;
  color?: 'danger' | 'neutral' | 'primary' | 'success' | 'warning';
  variant?: 'outlined' | 'soft' | 'solid';
  onClick?: () => void;
}

const composerSteps: Array<{
  id: ComposerStepId;
  label: string;
  description: string;
}> = [
  {
    id: 'basics',
    label: 'Basics',
    description: 'Title and game scope'
  },
  {
    id: 'audience',
    label: 'Audience',
    description: 'Who should see it'
  },
  {
    id: 'timing',
    label: 'Timing',
    description: 'Start and live window'
  },
  {
    id: 'details',
    label: 'Details',
    description: 'Note and voice setup'
  }
]

function formatDraftDateTime(value: string): string | null {
  if (!value) {
    return null
  }

  const parsedValue = dayjs(value)

  return parsedValue.isValid() ? formatMonthDayTime(parsedValue.toDate()) : null
}

function formatVoiceModeLabel(voiceMode: PlayIntentVoiceMode): string {
  switch (voiceMode) {
    case 'existing':
      return 'Existing Discord channel'
    case 'temporary':
      return 'Temporary Discord channel'
    default:
      return 'No voice channel'
  }
}

function truncateSummary(value: string, maxLength = 120): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`
}

function createSummaryChip(
  key: string,
  label: string,
  color: ComposerSummaryChip['color'] = 'neutral',
  variant: ComposerSummaryChip['variant'] = 'soft',
  onClick?: () => void
): ComposerSummaryChip {
  return {
    key,
    label,
    color,
    variant,
    onClick
  }
}

function ComposerSummaryChipRow({ chips }: { chips: ComposerSummaryChip[] }) {
  if (chips.length === 0) {
    return null
  }

  return (
    <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          size="sm"
          color={chip.color ?? 'neutral'}
          variant={chip.variant ?? 'soft'}
          onClick={chip.onClick}
          sx={{
            cursor: chip.onClick ? 'pointer' : 'default',
            '&:focus-visible': {
              outline: '2px solid',
              outlineColor: 'focusVisible',
              outlineOffset: '2px'
            }
          }}
        >
          {chip.label}
        </Chip>
      ))}
    </Stack>
  )
}

function PlayIntentComposerStepCard({
  stepNumber,
  title,
  description,
  active,
  statusLabel,
  statusColor,
  summaryText,
  summaryChips,
  onActivateStep,
  children
}: {
  stepNumber: number;
  title: string;
  description: string;
  active: boolean;
  statusLabel: string;
  statusColor: 'danger' | 'neutral' | 'primary' | 'success' | 'warning';
  summaryText: string;
  summaryChips: ComposerSummaryChip[];
  onActivateStep: () => void;
  children: ReactNode;
}) {
  return (
    <Card
      variant={active ? 'soft' : 'outlined'}
      sx={{
        p: 2,
        gap: 1.25,
        border: '1px solid',
        borderColor: active
          ? 'primary.700'
          : statusColor === 'warning'
            ? 'warning.700'
            : 'neutral.700',
        backgroundColor: active ? 'background.level1' : 'background.surface',
        boxShadow: 'none'
      }}
    >
      <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="flex-start">
        <Stack spacing={0.25} sx={{ minWidth: 0, flex: 1 }}>
          <Typography level="title-md">{stepNumber}. {title}</Typography>
          <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
            {description}
          </Typography>
        </Stack>
        <Chip
          size="sm"
          color={statusColor}
          variant={active ? 'solid' : 'soft'}
          onClick={onActivateStep}
          sx={{
            flexShrink: 0,
            mt: 0.125,
            cursor: 'pointer',
            '&:focus-visible': {
              outline: '2px solid',
              outlineColor: 'focusVisible',
              outlineOffset: '2px'
            }
          }}
        >
          {statusLabel}
        </Chip>
      </Stack>

      {active ? (
        <Stack spacing={2}>
          {children}
        </Stack>
      ) : (
        <Stack spacing={1.25}>
          <Typography
            level="body-sm"
            sx={{
              display: summaryChips.length > 0 ? { xs: 'none', sm: 'block' } : undefined,
              color: statusColor === 'warning' ? 'warning.200' : 'neutral.200'
            }}
          >
            {summaryText}
          </Typography>
          <ComposerSummaryChipRow chips={summaryChips} />
        </Stack>
      )}
    </Card>
  )
}

export function PlayIntentComposerCard({
  isOpen,
  composerPlayIntent,
  playIntentFilteredAudienceMessage,
  playIntentTargetedAudienceWarningMessage,
  playIntentUnmatchedTargetUsers,
  playIntentNotifyScope,
  onPlayIntentNotifyScopeChange,
  playIntentFriendOptions,
  playIntentDiscordServerOptions,
  selectedPlayIntentTargetDiscordServerIds,
  onTogglePlayIntentTargetDiscordServer,
  selectedPlayIntentTargetUserIds,
  onTogglePlayIntentTargetUser,
  playIntentSelectionMode,
  onPlayIntentSelectionModeChange,
  libraryEntries,
  selectedPlayIntentGameIds,
  onTogglePlayIntentGame,
  playIntentStartMode,
  onPlayIntentStartModeChange,
  playIntentStartAtInput,
  onPlayIntentStartAtInputChange,
  minPlayIntentStartAtInput,
  playIntentStartHelperText,
  playIntentStartHasError,
  playIntentTimingMode,
  onPlayIntentTimingModeChange,
  playIntentDurationMinutes,
  onPlayIntentPresetSelect,
  playIntentCustomDurationInput,
  onPlayIntentCustomDurationInputChange,
  playIntentEndAtInput,
  onPlayIntentEndAtInputChange,
  minPlayIntentEndAtInput,
  maxPlayIntentEndAtInput,
  playIntentTimingHelperText,
  playIntentTimingHasError,
  playIntentTitle,
  onPlayIntentTitleChange,
  playIntentNote,
  onPlayIntentNoteChange,
  playIntentVoiceMode,
  onPlayIntentVoiceModeChange,
  playIntentVoiceChannelId,
  playIntentVoiceChannelOptions,
  onPlayIntentVoiceChannelSelect,
  playIntentSaving,
  onSavePlayIntent,
  onCancel,
  onClearPlayIntent
}: {
  isOpen: boolean;
  composerPlayIntent: ActivePlayIntent | null;
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
  onCancel: () => void;
  onClearPlayIntent: () => Promise<void>;
}) {
  const [activeStep, setActiveStep] = useState<ComposerStepId>('basics')
  const isScheduledIntent = composerPlayIntent ? new Date(composerPlayIntent.windowStartsAt).getTime() > Date.now() + 60 * 1000 : false
  const composerTitle = composerPlayIntent
    ? isScheduledIntent
      ? 'Edit scheduled call to play'
      : 'Edit live call to play'
    : playIntentStartMode === 'scheduled'
      ? 'Schedule a call to play'
      : 'Post a call to play'
  const saveButtonLabel = playIntentSaving
    ? composerPlayIntent
      ? 'Saving call to play...'
      : playIntentStartMode === 'scheduled'
        ? 'Scheduling call to play...'
        : 'Posting call to play...'
    : composerPlayIntent
      ? 'Update call to play'
      : playIntentStartMode === 'scheduled'
        ? 'Schedule call to play'
        : 'Post call to play'
  const blockingMessageTitle = composerPlayIntent
    ? 'This call to play cannot be updated yet'
    : 'This call to play cannot be posted yet'
  const isPrimaryActionBlocked = Boolean(playIntentFilteredAudienceMessage)
  const voiceChannelsByServer = playIntentVoiceChannelOptions.reduce<Array<{
      serverId: string;
      serverName: string;
      serverIconUrl: string | null;
      channels: DiscordVoiceChannel[];
    }>>((groups, channel) => {
      const existingGroup = groups.find((group) => group.serverId === channel.serverId)

      if (existingGroup) {
        existingGroup.channels.push(channel)
        return groups
      }

      groups.push({
        serverId: channel.serverId,
        serverName: channel.serverName,
        serverIconUrl: channel.serverIconUrl,
        channels: [channel]
      })
      return groups
    }, [])
  const selectedGameTitles = libraryEntries
    .filter((entry) => selectedPlayIntentGameIds.includes(entry.gameId))
    .map((entry) => entry.title)
  const selectedFriends = playIntentFriendOptions.filter((friend) => selectedPlayIntentTargetUserIds.includes(friend.id))
  const selectedServers = playIntentDiscordServerOptions.filter((server) => selectedPlayIntentTargetDiscordServerIds.includes(server.id))
  const selectedVoiceChannel = playIntentVoiceChannelOptions.find((channel) => channel.id === playIntentVoiceChannelId) ?? null
  const scheduledStartLabel = formatDraftDateTime(playIntentStartAtInput)
  const specificEndLabel = formatDraftDateTime(playIntentEndAtInput)
  const basicsNeedsAttention = playIntentSelectionMode === 'subset' && selectedGameTitles.length === 0
  const audienceNeedsAttention = Boolean(playIntentFilteredAudienceMessage)
    || (playIntentNotifyScope === 'specific-friends' && selectedFriends.length === 0)
    || (playIntentNotifyScope === 'specific-discord-server' && selectedServers.length === 0)
  const timingNeedsAttention = playIntentStartHasError || playIntentTimingHasError
  const basicsSummaryChips: ComposerSummaryChip[] = [
    createSummaryChip(
      'title',
      playIntentTitle.trim() || 'Call to play',
      playIntentTitle.trim() ? 'primary' : 'neutral',
      playIntentTitle.trim() ? 'soft' : 'outlined'
    ),
    createSummaryChip('selection-mode', formatPlayIntentSelectionModeLabel(playIntentSelectionMode))
  ]
  const audienceSummaryChips: ComposerSummaryChip[] = [
    createSummaryChip(
      'notify-scope',
      formatNotifyScopeLabel(playIntentNotifyScope),
      audienceNeedsAttention ? 'warning' : 'primary'
    )
  ]
  const timingSummaryChips: ComposerSummaryChip[] = [
    createSummaryChip(
      'start-mode',
      playIntentStartMode === 'scheduled' ? 'Scheduled start' : 'Start now',
      playIntentStartMode === 'scheduled' ? 'warning' : 'success'
    ),
    createSummaryChip('duration', formatPlayIntentDurationLabel(playIntentDurationMinutes))
  ]
  const detailsSummaryChips: ComposerSummaryChip[] = [
    createSummaryChip(
      'voice-mode',
      formatVoiceModeLabel(playIntentVoiceMode),
      playIntentVoiceMode === 'temporary' ? 'primary' : 'neutral'
    )
  ]

  if (playIntentSelectionMode === 'subset') {
    basicsSummaryChips.push(
      createSummaryChip(
        'selection-count',
        selectedGameTitles.length > 0
          ? `${selectedGameTitles.length} selected game${selectedGameTitles.length === 1 ? '' : 's'}`
          : 'No games selected yet',
        selectedGameTitles.length > 0 ? 'success' : 'warning'
      )
    )
  }

  if (playIntentNotifyScope === 'specific-friends') {
    if (selectedFriends.length > 0) {
      selectedFriends.slice(0, 2).forEach((friend) => {
        audienceSummaryChips.push(createSummaryChip(`friend-${friend.id}`, friend.displayName, 'neutral', 'outlined'))
      })

      if (selectedFriends.length > 2) {
        audienceSummaryChips.push(createSummaryChip('friends-more', `+${selectedFriends.length - 2} more`))
      }
    } else {
      audienceSummaryChips.push(createSummaryChip('friends-empty', 'No friends selected yet', 'warning'))
    }
  }

  if (playIntentNotifyScope === 'specific-discord-server') {
    if (selectedServers.length > 0) {
      selectedServers.slice(0, 2).forEach((server) => {
        audienceSummaryChips.push(createSummaryChip(`server-${server.id}`, server.name, 'neutral', 'outlined'))
      })

      if (selectedServers.length > 2) {
        audienceSummaryChips.push(createSummaryChip('servers-more', `+${selectedServers.length - 2} more`))
      }
    } else {
      audienceSummaryChips.push(createSummaryChip('servers-empty', 'No servers selected yet', 'warning'))
    }
  }

  if (playIntentTimingMode === 'custom') {
    timingSummaryChips.push(createSummaryChip('custom-duration', 'Custom length', 'neutral', 'outlined'))
  }

  if (playIntentTimingMode === 'end-time' && specificEndLabel) {
    timingSummaryChips.push(createSummaryChip('end-time', `Ends ${specificEndLabel}`, 'neutral', 'outlined'))
  }

  if (selectedVoiceChannel) {
    detailsSummaryChips.push(createSummaryChip('voice-channel', selectedVoiceChannel.name, 'neutral', 'outlined'))
  }

  if (playIntentNote.trim()) {
    detailsSummaryChips.push(createSummaryChip('note', 'Note added', 'success'))
  }

  const stepSummaries: Record<ComposerStepId, { hasAttention: boolean; summaryText: string; summaryChips: ComposerSummaryChip[] }> = {
    basics: {
      hasAttention: basicsNeedsAttention,
      summaryText: playIntentSelectionMode === 'library'
        ? 'This call will match against anything in your library.'
        : selectedGameTitles.length > 0
          ? `Focused on ${selectedGameTitles.slice(0, 3).join(', ')}${selectedGameTitles.length > 3 ? ` and ${selectedGameTitles.length - 3} more.` : '.'}`
          : 'Pick one or more games to narrow the audience to a specific subset.',
      summaryChips: basicsSummaryChips
    },
    audience: {
      hasAttention: audienceNeedsAttention || Boolean(playIntentTargetedAudienceWarningMessage),
      summaryText: playIntentFilteredAudienceMessage
        ?? playIntentTargetedAudienceWarningMessage
        ?? formatNotifyScopeDescription(playIntentNotifyScope),
      summaryChips: audienceSummaryChips
    },
    timing: {
      hasAttention: timingNeedsAttention,
      summaryText: timingNeedsAttention
        ? `Check the timing: ${playIntentStartHasError ? playIntentStartHelperText : playIntentTimingHelperText}`
        : playIntentStartMode === 'scheduled'
          ? scheduledStartLabel
            ? `Starts ${scheduledStartLabel}.${playIntentTimingMode === 'end-time' && specificEndLabel ? ` Ends ${specificEndLabel}.` : ''}`
            : 'Choose when this should start.'
          : `Starts as soon as you post it.${playIntentTimingMode === 'end-time' && specificEndLabel ? ` Ends ${specificEndLabel}.` : ''}`,
      summaryChips: timingSummaryChips
    },
    details: {
      hasAttention: false,
      summaryText: playIntentNote.trim()
        ? truncateSummary(playIntentNote.trim())
        : playIntentVoiceMode === 'existing' && selectedVoiceChannel
          ? `Voice will use ${selectedVoiceChannel.serverName} / ${selectedVoiceChannel.name}.`
          : playIntentVoiceMode === 'temporary'
            ? 'Game\'s Up will create a temporary text and voice space.'
            : playIntentVoiceMode === 'existing'
              ? 'Pick a Discord voice channel from your selected servers.'
              : 'No note or voice channel has been added yet.',
          summaryChips: detailsSummaryChips
    }
  }
  const activeStepIndex = composerSteps.findIndex((step) => step.id === activeStep)
  const isFinalStep = activeStepIndex === composerSteps.length - 1
      const previousStep = activeStepIndex > 0 ? composerSteps[activeStepIndex - 1] : null
  const nextStep = composerSteps[activeStepIndex + 1] ?? null

  useEffect(() => {
    if (isOpen) {
      setActiveStep('basics')
    }
  }, [isOpen, composerPlayIntent?.id])

  function goToPreviousStep() {
    if (!previousStep) {
      return
    }

    setActiveStep(previousStep.id)
  }

  function goToNextStep() {
    if (!nextStep) {
      return
    }

    setActiveStep(nextStep.id)
  }

  function renderStepContent(stepId: ComposerStepId) {
    switch (stepId) {
      case 'basics':
        return (
          <Stack spacing={2}>
            <Stack spacing={1}>
              <Typography level="title-sm">Title (optional)</Typography>
              <Input
                placeholder="Call to play"
                value={playIntentTitle}
                onChange={(event) => onPlayIntentTitleChange(event.target.value)}
                slotProps={{
                  input: {
                    maxLength: 80
                  }
                }}
              />
            </Stack>

            <Stack spacing={1}>
              <Typography level="title-sm">What are you up for?</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                {(['library', 'subset'] as const).map((selectionMode) => (
                  <Button
                    key={selectionMode}
                    size="sm"
                    variant={playIntentSelectionMode === selectionMode ? 'solid' : 'soft'}
                    color={playIntentSelectionMode === selectionMode ? 'primary' : 'neutral'}
                    onClick={() => onPlayIntentSelectionModeChange(selectionMode)}
                  >
                    {formatPlayIntentSelectionModeLabel(selectionMode)}
                  </Button>
                ))}
              </Stack>
            </Stack>

            {playIntentSelectionMode === 'subset' ? (
              <Stack spacing={1}>
                <Typography level="title-sm">Pick games</Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                  {libraryEntries.map((entry) => (
                    <Button
                      key={entry.id}
                      size="sm"
                      variant={selectedPlayIntentGameIds.includes(entry.gameId) ? 'solid' : 'soft'}
                      color={selectedPlayIntentGameIds.includes(entry.gameId) ? 'primary' : 'neutral'}
                      onClick={() => onTogglePlayIntentGame(entry.gameId)}
                    >
                      {entry.title}
                    </Button>
                  ))}
                </Stack>
              </Stack>
            ) : null}
          </Stack>
        )
      case 'audience':
        return (
          <Stack spacing={2}>
            <Stack spacing={1}>
              <Typography level="title-sm">Who do you want to target?</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                {(['network', 'specific-discord-server', 'friends-only', 'specific-friends'] as const).map((scope) => (
                  <Button
                    key={scope}
                    size="sm"
                    variant={playIntentNotifyScope === scope ? 'solid' : 'soft'}
                    color={playIntentNotifyScope === scope ? 'primary' : 'neutral'}
                    disabled={
                      (scope === 'specific-friends' && playIntentFriendOptions.length === 0)
                      || (scope === 'specific-discord-server' && playIntentDiscordServerOptions.length === 0)
                    }
                    onClick={() => onPlayIntentNotifyScopeChange(scope)}
                  >
                    {formatNotifyScopeLabel(scope)}
                  </Button>
                ))}
              </Stack>
              <Typography level="body-xs" sx={{ color: 'neutral.300' }}>
                {formatNotifyScopeDescription(playIntentNotifyScope)}
              </Typography>
            </Stack>

            {playIntentNotifyScope === 'specific-friends' ? (
              playIntentFriendOptions.length > 0 ? (
                <Stack spacing={1}>
                  <Typography level="body-xs" sx={{ color: 'neutral.300' }}>
                    Choose which friends should see this call to play.
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    {playIntentFriendOptions.map((friend) => {
                      const isSelected = selectedPlayIntentTargetUserIds.includes(friend.id)

                      return (
                        <Button
                          key={friend.id}
                          size="sm"
                          variant={isSelected ? 'solid' : 'soft'}
                          color={isSelected ? 'primary' : 'neutral'}
                          startDecorator={<Avatar src={friend.avatarUrl ?? undefined} alt={friend.displayName} size="sm" variant="soft" />}
                          onClick={() => onTogglePlayIntentTargetUser(friend.id)}
                        >
                          {friend.displayName}
                        </Button>
                      )
                    })}
                  </Stack>
                  {playIntentTargetedAudienceWarningMessage && playIntentUnmatchedTargetUsers.length > 0 ? (
                    <Card
                      color="warning"
                      variant="soft"
                      sx={{
                        p: 1.5,
                        border: '1px solid',
                        borderColor: 'warning.700',
                        boxShadow: 'none'
                      }}
                    >
                      <Stack spacing={1}>
                        <Typography level="title-sm">Some selected friends will not receive this call</Typography>
                        <Typography level="body-sm">{playIntentTargetedAudienceWarningMessage}</Typography>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                          {playIntentUnmatchedTargetUsers.map((friend) => (
                            <Chip
                              key={friend.id}
                              size="sm"
                              color="warning"
                              variant="soft"
                              startDecorator={<Avatar src={friend.avatarUrl ?? undefined} alt={friend.displayName} size="sm" variant="soft" />}
                            >
                              {friend.displayName}
                            </Chip>
                          ))}
                        </Stack>
                      </Stack>
                    </Card>
                  ) : null}
                </Stack>
              ) : (
                <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                  Add friends first to target a specific audience.
                </Typography>
              )
            ) : null}

            {playIntentNotifyScope === 'specific-discord-server' ? (
              playIntentDiscordServerOptions.length > 0 ? (
                <Stack spacing={1}>
                  <Typography level="body-xs" sx={{ color: 'neutral.300' }}>
                    Choose which Discord servers should see this call to play.
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    {playIntentDiscordServerOptions.map((server) => {
                      const isSelected = selectedPlayIntentTargetDiscordServerIds.includes(server.id)

                      return (
                        <Button
                          key={server.id}
                          size="sm"
                          variant={isSelected ? 'solid' : 'soft'}
                          color={isSelected ? 'primary' : 'neutral'}
                          startDecorator={<Avatar src={server.iconUrl ?? undefined} alt={server.name} size="sm" variant="soft" />}
                          onClick={() => onTogglePlayIntentTargetDiscordServer(server.id)}
                        >
                          {server.name}
                        </Button>
                      )
                    })}
                  </Stack>
                </Stack>
              ) : (
                <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                  Select Discord servers in your network settings first to target them here.
                </Typography>
              )
            ) : null}

            {playIntentFilteredAudienceMessage ? (
              <Card
                color="warning"
                variant="soft"
                sx={{
                  p: 2,
                  border: '1px solid',
                  borderColor: 'warning.700',
                  boxShadow: 'none'
                }}
              >
                <Stack spacing={0.75}>
                  <Typography level="title-sm">{blockingMessageTitle}</Typography>
                  <Typography level="body-sm">{playIntentFilteredAudienceMessage}</Typography>
                </Stack>
              </Card>
            ) : null}
          </Stack>
        )
      case 'timing':
        return (
          <Stack spacing={2}>
            <Stack spacing={1}>
              <Typography level="title-sm">When should this start?</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                {([
                  ['now', 'Start now'],
                  ['scheduled', 'Schedule later']
                ] as const).map(([startMode, label]) => (
                  <Button
                    key={startMode}
                    size="sm"
                    variant={playIntentStartMode === startMode ? 'solid' : 'soft'}
                    color={playIntentStartMode === startMode ? 'primary' : 'neutral'}
                    onClick={() => onPlayIntentStartModeChange(startMode)}
                  >
                    {label}
                  </Button>
                ))}
              </Stack>
              {playIntentStartMode === 'scheduled' ? (
                <PlayIntentDateTimeInput
                  value={playIntentStartAtInput}
                  minDateTime={minPlayIntentStartAtInput}
                  error={playIntentStartHasError}
                  onChange={onPlayIntentStartAtInputChange}
                />
              ) : null}
              <Typography level="body-xs" sx={{ color: playIntentStartHasError ? 'danger.300' : 'neutral.300' }}>
                {playIntentStartHelperText}
              </Typography>
            </Stack>

            <Stack spacing={1}>
              <Typography level="title-sm">How long should this stay live?</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
                {playIntentPresetDurations.map((durationMinutes) => (
                  <Button
                    key={durationMinutes}
                    size="sm"
                    variant={playIntentTimingMode === 'preset' && playIntentDurationMinutes === durationMinutes ? 'solid' : 'soft'}
                    color={playIntentTimingMode === 'preset' && playIntentDurationMinutes === durationMinutes ? 'primary' : 'neutral'}
                    onClick={() => onPlayIntentPresetSelect(durationMinutes)}
                  >
                    {formatPlayIntentDurationLabel(durationMinutes)}
                  </Button>
                ))}
                {([
                  ['custom', 'Custom length'],
                  ['end-time', 'Specific end time']
                ] as const).map(([timingMode, label]) => (
                  <Button
                    key={timingMode}
                    size="sm"
                    variant={playIntentTimingMode === timingMode ? 'solid' : 'soft'}
                    color={playIntentTimingMode === timingMode ? 'primary' : 'neutral'}
                    onClick={() => onPlayIntentTimingModeChange(timingMode)}
                  >
                    {label}
                  </Button>
                ))}
              </Stack>

              {playIntentTimingMode === 'custom' ? (
                <Input
                  type="number"
                  placeholder="90"
                  value={playIntentCustomDurationInput}
                  onChange={(event) => onPlayIntentCustomDurationInputChange(event.target.value)}
                  endDecorator="minutes"
                  slotProps={{
                    input: {
                      min: minimumPlayIntentDurationMinutes,
                      max: maximumPlayIntentDurationMinutes,
                      step: 15
                    }
                  }}
                />
              ) : null}

              {playIntentTimingMode === 'end-time' ? (
                <PlayIntentDateTimeInput
                  value={playIntentEndAtInput}
                  minDateTime={minPlayIntentEndAtInput}
                  maxDateTime={maxPlayIntentEndAtInput}
                  error={playIntentTimingHasError}
                  onChange={onPlayIntentEndAtInputChange}
                />
              ) : null}

              <Typography level="body-xs" sx={{ color: playIntentTimingHasError ? 'danger.300' : 'neutral.300' }}>
                {playIntentTimingHelperText}
              </Typography>
            </Stack>
          </Stack>
        )
      case 'details':
        return (
          <Stack spacing={2}>
            <Stack spacing={1}>
              <Typography level="title-sm">Note (optional)</Typography>
              <Input
                placeholder="Example: voice chat on, happy to fill support"
                value={playIntentNote}
                onChange={(event) => onPlayIntentNoteChange(event.target.value)}
              />
            </Stack>

            <Stack spacing={1}>
              <Typography level="title-sm">Voice setup (optional)</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                {([
                  ['none', 'None'],
                  ['existing', 'Existing Discord channel'],
                  ['temporary', 'Temporary Discord channel']
                ] as const).map(([voiceMode, label]) => (
                  <Button
                    key={voiceMode}
                    size="sm"
                    variant={playIntentVoiceMode === voiceMode ? 'solid' : 'soft'}
                    color={playIntentVoiceMode === voiceMode ? 'primary' : 'neutral'}
                    onClick={() => onPlayIntentVoiceModeChange(voiceMode)}
                  >
                    {label}
                  </Button>
                ))}
              </Stack>

              {playIntentVoiceMode === 'existing' ? (
                <>
                  <Select
                    value={playIntentVoiceChannelId || null}
                    placeholder={playIntentVoiceChannelOptions.length > 0 ? 'Pick a channel' : 'No selected Discord server channels available'}
                    onChange={(_event, value) => onPlayIntentVoiceChannelSelect(value && value.length > 0 ? value : null)}
                  >
                    <Option value="">No voice channel</Option>
                    {voiceChannelsByServer.flatMap((group) => [
                      <Option key={`server-${group.serverId}`} value={`server-${group.serverId}`} disabled>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Avatar src={group.serverIconUrl ?? undefined} alt={group.serverName} size="sm" variant="soft" />
                          <Typography level="body-sm" sx={{ color: 'neutral.300', fontWeight: 'lg' }}>
                            {group.serverName}
                          </Typography>
                        </Stack>
                      </Option>,
                      ...group.channels.map((channel) => (
                        <Option key={channel.id} value={channel.id} sx={{ pl: 5 }}>
                          {channel.name}
                        </Option>
                      ))
                    ])}
                  </Select>
                  <Typography level="body-xs" sx={{ color: 'neutral.300' }}>
                    Use an existing voice channel from one of your selected Discord servers.
                  </Typography>
                </>
              ) : null}

              {playIntentVoiceMode === 'temporary' ? (
                <Typography level="body-xs" sx={{ color: 'neutral.300' }}>
                  Create a temporary private Discord voice channel in the Game's Up Discord server. People already in that server will get access immediately, and others can join from the invite when needed.
                </Typography>
              ) : null}

              {playIntentVoiceMode === 'none' ? (
                <Typography level="body-xs" sx={{ color: 'neutral.300' }}>
                  No voice channel will be attached to this call to play.
                </Typography>
              ) : null}
            </Stack>
          </Stack>
        )
    }
  }

  return (
    <>
      <DialogTitle sx={{ pr: 6 }}>{composerTitle}</DialogTitle>
      <DialogContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          pr: 0.5,
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
          Let others with matching games know you want to play, whether that is now or later.
        </Typography>

        <Stepper
          sx={{
            '--StepIndicator-size': '2rem',
            '--Step-gap': '0.75rem',
            '--Stepper-horizontalGap': '1rem',
            flexWrap: { xs: 'wrap', md: 'nowrap' }
          }}
        >
          {composerSteps.map((step, index) => {
            const stepSummary = stepSummaries[step.id]
            const isActive = step.id === activeStep
            const statusColor = isActive
              ? 'primary'
              : stepSummary.hasAttention
                ? 'warning'
                : index < activeStepIndex
                  ? 'success'
                  : 'neutral'
            const statusLabel = isActive
              ? 'Current'
              : stepSummary.hasAttention
                ? 'Needs attention'
                : index < activeStepIndex
                  ? 'Done'
                  : 'Up next'

            return (
              <Step
                key={step.id}
                indicator={(
                  <StepIndicator color={statusColor} variant={isActive ? 'solid' : 'soft'}>
                    {index + 1}
                  </StepIndicator>
                )}
              >
                <StepButton
                  onClick={() => setActiveStep(step.id)}
                  sx={{
                    borderRadius: 'md',
                    px: 0.75,
                    py: 0.5,
                    textAlign: 'left',
                    backgroundColor: isActive ? 'rgba(20, 136, 106, 0.18)' : 'transparent'
                  }}
                >
                  <Stack spacing={0.25}>
                    <Typography level="title-sm" sx={{ color: isActive ? 'neutral.50' : 'neutral.200' }}>
                      {step.label}
                    </Typography>
                    <Typography
                      level="body-xs"
                      sx={{
                        display: { xs: 'none', sm: 'block' },
                        color: statusColor === 'warning' ? 'warning.300' : 'neutral.400'
                      }}
                    >
                      {statusLabel} · {step.description}
                    </Typography>
                  </Stack>
                </StepButton>
              </Step>
            )
          })}
        </Stepper>

        <Stack spacing={1.5}>
          {composerSteps.map((step, index) => {
            const stepSummary = stepSummaries[step.id]
            const isActive = step.id === activeStep
            const statusColor = isActive
              ? 'primary'
              : stepSummary.hasAttention
                ? 'warning'
                : index < activeStepIndex
                  ? 'success'
                  : 'neutral'
            const statusLabel = isActive
              ? 'Current'
              : stepSummary.hasAttention
                ? 'Needs attention'
                : index < activeStepIndex
                  ? 'Done'
                  : 'Up next'
            return (
              <PlayIntentComposerStepCard
                key={step.id}
                stepNumber={index + 1}
                title={step.label}
                description={step.description}
                active={isActive}
                statusLabel={statusLabel}
                statusColor={statusColor}
                summaryText={stepSummary.summaryText}
                summaryChips={stepSummary.summaryChips.map((chip) => ({
                  ...chip,
                  onClick: () => setActiveStep(step.id)
                }))}
                onActivateStep={() => setActiveStep(step.id)}
              >
                {renderStepContent(step.id)}
              </PlayIntentComposerStepCard>
            )
          })}
        </Stack>
      </DialogContent>
      <DashboardModalActionBar
        secondaryAction={(
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Button
              variant="soft"
              color="neutral"
              disabled={playIntentSaving || activeStepIndex === 0}
              onClick={goToPreviousStep}
              sx={{ minHeight: 46 }}
            >
              Previous
            </Button>
            {isFinalStep && composerPlayIntent ? (
              <Button
                variant="soft"
                color="neutral"
                disabled={playIntentSaving}
                onClick={() => void onClearPlayIntent()}
                sx={{ minHeight: 46 }}
              >
                Clear call to play
              </Button>
            ) : null}
          </Stack>
        )}
        cancelAction={(
          <Button size="lg" variant="outlined" color="neutral" disabled={playIntentSaving} onClick={onCancel} sx={{ minHeight: 52 }}>
            Cancel
          </Button>
        )}
        primaryAction={(
          isFinalStep ? (
            <Button
              size="lg"
              color="success"
              disabled={playIntentSaving || isPrimaryActionBlocked}
              onClick={() => void onSavePlayIntent()}
              sx={{
                flex: 1,
                minHeight: 52,
                fontWeight: 700,
                boxShadow: 'none'
              }}
            >
              {saveButtonLabel}
            </Button>
          ) : (
            <Button
              size="lg"
              color="primary"
              disabled={playIntentSaving || !nextStep}
              onClick={goToNextStep}
              sx={{
                flex: 1,
                minHeight: 52,
                fontWeight: 700,
                boxShadow: 'none'
              }}
            >
              {nextStep ? `Next: ${nextStep.label}` : 'Next'}
            </Button>
          )
        )}
      />
    </>
  )
}