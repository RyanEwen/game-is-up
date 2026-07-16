import { useEffect, useState } from 'react'
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
  FriendsList,
  LibraryEntry,
  PlayIntentNotifyScope
} from '@game-is-up/shared'
import { maximumPlayIntentGameSelectionCount } from '@game-is-up/shared'
import {
  formatPlayIntentDurationLabel,
  formatNotifyScopeDescription,
  formatNotifyScopeLabel,
  maximumPlayIntentDurationMinutes,
  minimumPlayIntentDurationMinutes,
  playIntentPresetDurations
} from './dashboardUtils'
import { DashboardModalActionBar } from './DashboardModalActionBar'
import { useDeviceTheme } from '../../hooks/useDeviceTheme'
import type { AppThemeId } from '../../theme/themes'
import type { PlayIntentStartMode, PlayIntentTimingMode, PlayIntentVoiceMode } from './types'
import dayjs, { type Dayjs } from 'dayjs'

const localDateTimeFormat = 'YYYY-MM-DDTHH:mm'

// The Material date-time picker cannot read Joy CSS vars from a theme
// object, so each app theme gets a concrete Material palette here. Keep
// these in step with the palettes in src/theme.
const playIntentPickerThemes: Record<AppThemeId, ReturnType<typeof createTheme>> = {
  classic: createPickerTheme({
    primary: { main: '#33d7a6', light: '#57f4c1', dark: '#14886a' },
    background: { default: '#070b14', paper: '#121a28' },
    text: { primary: '#ffffff', secondary: '#d1dbe5' },
    divider: '#3b4d66'
  }),
  'gold-bubble': createPickerTheme({
    primary: { main: '#f7b733', light: '#fddd8d', dark: '#a06d08' },
    background: { default: '#101117', paper: '#1e1f28' },
    text: { primary: '#ffffff', secondary: '#e2e3e9' },
    divider: '#353742'
  })
}

function createPickerTheme(palette: {
  primary: { main: string; light: string; dark: string }
  background: { default: string; paper: string }
  text: { primary: string; secondary: string }
  divider: string
}) {
  return createTheme({
    palette: {
      mode: 'dark',
      ...palette
    },
    shape: {
      borderRadius: 16
    },
    typography: {
      fontFamily: 'IBM Plex Sans, sans-serif'
    }
  })
}

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
  const [appThemeId] = useDeviceTheme()

  return (
    <ThemeProvider theme={{ [MATERIAL_THEME_ID]: playIntentPickerThemes[appThemeId] }}>
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
                  backgroundColor: 'var(--joy-palette-background-level2)',
                  color: 'var(--joy-palette-text-primary)'
                },
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--joy-palette-neutral-700)'
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--joy-palette-neutral-600)'
                },
                '& .Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--joy-palette-primary-400)'
                },
                '& .MuiIconButton-root': {
                  color: 'var(--joy-palette-text-secondary)'
                }
              }
            },
            desktopPaper: {
              sx: {
                backgroundImage: 'none',
                backgroundColor: 'var(--joy-palette-background-popup)',
                border: '1px solid var(--joy-palette-neutral-700)'
              }
            },
            mobilePaper: {
              sx: {
                backgroundImage: 'none',
                backgroundColor: 'var(--joy-palette-background-popup)',
                border: '1px solid var(--joy-palette-neutral-700)'
              }
            },
            popper: {
              sx: {
                '& .MuiPaper-root': {
                  backgroundImage: 'none',
                  backgroundColor: 'var(--joy-palette-background-popup)',
                  border: '1px solid var(--joy-palette-neutral-700)'
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
  friendsLists,
  selectedPlayIntentFriendsListId,
  onPlayIntentFriendsListChange,
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
  friendsLists: FriendsList[];
  selectedPlayIntentFriendsListId: string | null;
  onPlayIntentFriendsListChange: (listId: string | null) => void;
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
  const selectedFriendsList = friendsLists.find((list) => list.id === selectedPlayIntentFriendsListId) ?? null
  const selectedServers = playIntentDiscordServerOptions.filter((server) => selectedPlayIntentTargetDiscordServerIds.includes(server.id))
  const basicsNeedsAttention = selectedGameTitles.length === 0
  const audienceNeedsAttention = Boolean(playIntentFilteredAudienceMessage)
    || (playIntentNotifyScope === 'specific-friends' && selectedFriends.length === 0)
    || (playIntentNotifyScope === 'friends-list' && !selectedPlayIntentFriendsListId)
    || (playIntentNotifyScope === 'specific-discord-server' && selectedServers.length === 0)
  const timingNeedsAttention = playIntentStartHasError || playIntentTimingHasError

  const stepSummaries: Record<ComposerStepId, { hasAttention: boolean }> = {
    basics: {
      hasAttention: basicsNeedsAttention
    },
    audience: {
      hasAttention: audienceNeedsAttention || Boolean(playIntentTargetedAudienceWarningMessage)
    },
    timing: {
      hasAttention: timingNeedsAttention
    },
    details: {
      hasAttention: false
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
              <Typography level="title-sm">Game(s) you're up for playing</Typography>
              <Typography level="body-xs" sx={{ color: selectedGameTitles.length > 0 ? 'primary.200' : 'neutral.400' }}>
                {selectedGameTitles.length} / {maximumPlayIntentGameSelectionCount} selected
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                {libraryEntries.map((entry) => {
                  const selected = selectedPlayIntentGameIds.includes(entry.gameId)

                  return (
                    <Button
                      key={entry.id}
                      size="sm"
                      variant={selected ? 'solid' : 'soft'}
                      color={selected ? 'primary' : 'neutral'}
                      disabled={!selected && selectedPlayIntentGameIds.length >= maximumPlayIntentGameSelectionCount}
                      onClick={() => onTogglePlayIntentGame(entry.gameId)}
                    >
                      {entry.title}
                    </Button>
                  )
                })}
              </Stack>
            </Stack>
          </Stack>
        )
      case 'audience':
        return (
          <Stack spacing={2}>
            <Stack spacing={1}>
              <Typography level="title-sm">Who do you want to target?</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                {(['network', 'specific-discord-server', 'friends-only', 'specific-friends', 'friends-list'] as const).map((scope) => (
                  <Button
                    key={scope}
                    size="sm"
                    variant={playIntentNotifyScope === scope ? 'solid' : 'soft'}
                    color={playIntentNotifyScope === scope ? 'primary' : 'neutral'}
                    disabled={
                      (scope === 'specific-friends' && playIntentFriendOptions.length === 0)
                      || (scope === 'friends-list' && friendsLists.length === 0)
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

            {playIntentNotifyScope === 'friends-list' ? (
              friendsLists.length > 0 ? (
                <Stack spacing={1}>
                  <Typography level="body-xs" sx={{ color: 'neutral.300' }}>
                    Choose a saved friends list. Its members are captured when you post, so later edits to the list will not change this call to play.
                  </Typography>
                  <Select
                    value={selectedPlayIntentFriendsListId}
                    placeholder="Select a friends list"
                    onChange={(_event, value) => onPlayIntentFriendsListChange(value)}
                  >
                    {friendsLists.map((list) => (
                      <Option key={list.id} value={list.id}>
                        {list.name} ({list.memberCount})
                      </Option>
                    ))}
                  </Select>
                  {selectedFriendsList ? (
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                      {selectedFriendsList.members.map((member) => (
                        <Chip
                          key={member.id}
                          size="sm"
                          variant="soft"
                          startDecorator={<Avatar src={member.avatarUrl ?? undefined} alt={member.displayName} size="sm" variant="soft" />}
                        >
                          {member.displayName}
                        </Chip>
                      ))}
                    </Stack>
                  ) : null}
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
                        <Typography level="title-sm">Some friends in this list will not receive this call</Typography>
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
                  Create a friends list first to target it here.
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
            '--StepIndicator-size': { xs: '1.5rem', sm: '2rem' },
            '--Step-gap': { xs: '0.25rem', sm: '0.75rem' },
            '--Step-connectorInset': { xs: '0.25rem', sm: '0.375rem' },
            '--Stepper-horizontalGap': { xs: '0.375rem', sm: '1rem' },
            flexWrap: 'nowrap'
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
                    px: { xs: 0.25, sm: 0.75 },
                    py: 0.5,
                    textAlign: 'left',
                    backgroundColor: 'transparent'
                  }}
                >
                  <Stack spacing={0.25}>
                    <Typography
                      level="title-sm"
                      sx={{
                        display: { xs: isActive ? 'block' : 'none', sm: 'block' },
                        color: isActive ? 'neutral.50' : 'neutral.200'
                      }}
                    >
                      {step.label}
                    </Typography>
                    <Typography
                      level="body-xs"
                      sx={{
                        display: { xs: 'none', sm: 'block' },
                        color: statusColor === 'warning' ? 'warning.300' : 'neutral.400'
                      }}
                    >
                      {step.description}
                    </Typography>
                  </Stack>
                </StepButton>
              </Step>
            )
          })}
        </Stepper>

        <Stack spacing={1.5}>
          {(() => {
            const step = composerSteps.find((candidate) => candidate.id === activeStep) ?? composerSteps[0]!
            return (
              <Card
                key={step.id}
                variant="soft"
                sx={{
                  p: 2,
                  gap: 2,
                  border: '1px solid',
                  borderColor: 'primary.700',
                  backgroundColor: 'background.level1',
                  boxShadow: 'none'
                }}
              >
                {renderStepContent(step.id)}
              </Card>
            )
          })()}
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
              Next
            </Button>
          )
        )}
      />
    </>
  )
}