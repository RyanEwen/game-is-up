import { Avatar, Button, Card, Chip, DialogContent, DialogTitle, Input, Option, Select, Stack, Typography } from '@mui/joy'
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
import { formatClockTime, formatMonthDayTime } from '../../lib/dateTime'
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

export function PlayIntentComposerCard({
  composerPlayIntent,
  isAdmin,
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
  onSavePlayIntentToSelf,
  onCancel,
  onClearPlayIntent
}: {
  composerPlayIntent: ActivePlayIntent | null;
  isAdmin: boolean;
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
  onCancel: () => void;
  onClearPlayIntent: () => Promise<void>;
}) {
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
  const saveToSelfButtonLabel = composerPlayIntent ? 'Update for me only' : 'Post to me only'
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
  const activeTargetServers = composerPlayIntent?.targetServers ?? []

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

        {composerPlayIntent ? (
          <Card color="success" variant="soft" sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Typography level="title-md">{composerPlayIntent.title}</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                {isScheduledIntent ? (
                  <>
                    <Chip size="sm" color="warning" variant="soft">
                      Scheduled for {formatMonthDayTime(composerPlayIntent.windowStartsAt)}
                    </Chip>
                    <Chip size="sm" color="success" variant="soft">
                      Ends {formatMonthDayTime(composerPlayIntent.windowEndsAt)}
                    </Chip>
                  </>
                ) : (
                  <Chip size="sm" color="success" variant="soft">
                    Live until {formatClockTime(composerPlayIntent.windowEndsAt)}
                  </Chip>
                )}
                <Chip size="sm" color="primary" variant="outlined">
                  {formatNotifyScopeLabel(composerPlayIntent.notifyScope)}
                </Chip>
                <Chip size="sm" color="neutral" variant="outlined">
                  {formatPlayIntentSelectionModeLabel(composerPlayIntent.selectionMode)}
                </Chip>
              </Stack>
              <Typography level="body-xs" sx={{ color: 'neutral.300' }}>
                {formatNotifyScopeDescription(composerPlayIntent.notifyScope)}
              </Typography>
              {composerPlayIntent.notifyScope === 'specific-discord-server' && activeTargetServers.length > 0 ? (
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                  {activeTargetServers.map((server) => (
                    <Chip
                      key={server.id}
                      size="sm"
                      variant="outlined"
                      color="neutral"
                      startDecorator={<Avatar src={server.iconUrl ?? undefined} alt={server.name} size="sm" variant="soft" />}
                    >
                      {server.name}
                    </Chip>
                  ))}
                </Stack>
              ) : null}
              {composerPlayIntent.notifyScope === 'specific-friends' && composerPlayIntent.targetedFriends.length > 0 ? (
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                  {composerPlayIntent.targetedFriends.map((friend) => (
                    <Chip
                      key={friend.id}
                      size="sm"
                      variant="outlined"
                      color="neutral"
                      startDecorator={<Avatar src={friend.avatarUrl ?? undefined} alt={friend.displayName} size="sm" variant="soft" />}
                    >
                      {friend.displayName}
                    </Chip>
                  ))}
                </Stack>
              ) : null}
              {composerPlayIntent.note ? (
                <Typography level="body-sm" sx={{ color: 'neutral.100' }}>
                  {composerPlayIntent.note}
                </Typography>
              ) : null}
            </Stack>
          </Card>
        ) : null}

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
                variant={playIntentSelectionMode === selectionMode ? 'solid' : 'outlined'}
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
                  variant={selectedPlayIntentGameIds.includes(entry.gameId) ? 'solid' : 'outlined'}
                  color={selectedPlayIntentGameIds.includes(entry.gameId) ? 'primary' : 'neutral'}
                  onClick={() => onTogglePlayIntentGame(entry.gameId)}
                >
                  {entry.title}
                </Button>
              ))}
            </Stack>
          </Stack>
        ) : null}

        <Stack spacing={1}>
          <Typography level="title-sm">Who do you want to target?</Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {(['network', 'friends-only', 'specific-friends', 'specific-discord-server'] as const).map((scope) => (
              <Button
                key={scope}
                size="sm"
                variant={playIntentNotifyScope === scope ? 'solid' : 'outlined'}
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
                        variant={isSelected ? 'solid' : 'outlined'}
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
                        variant={isSelected ? 'solid' : 'outlined'}
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
        </Stack>

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
                variant={playIntentStartMode === startMode ? 'solid' : 'outlined'}
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
                variant={playIntentTimingMode === 'preset' && playIntentDurationMinutes === durationMinutes ? 'solid' : 'outlined'}
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
                variant={playIntentTimingMode === timingMode ? 'solid' : 'outlined'}
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
                variant={playIntentVoiceMode === voiceMode ? 'solid' : 'outlined'}
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
              Create temporary hidden text and voice channels in the Game's Up Discord server. People already in that server will get links immediately, and others can join from the invite when needed.
            </Typography>
          ) : null}

          {playIntentVoiceMode === 'none' ? (
            <Typography level="body-xs" sx={{ color: 'neutral.300' }}>
              No voice channel will be attached to this call to play.
            </Typography>
          ) : null}
        </Stack>

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
      </DialogContent>
      <DashboardModalActionBar
        secondaryAction={isAdmin || composerPlayIntent ? (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {isAdmin ? (
              <Button
                variant="soft"
                color="primary"
                disabled={playIntentSaving}
                onClick={() => void onSavePlayIntentToSelf()}
                sx={{ minHeight: 46 }}
              >
                {saveToSelfButtonLabel}
              </Button>
            ) : null}
            {composerPlayIntent ? (
              <Button
                variant="outlined"
                color="neutral"
                disabled={playIntentSaving}
                onClick={() => void onClearPlayIntent()}
                sx={{ minHeight: 46 }}
              >
                Clear call to play
              </Button>
            ) : null}
          </Stack>
        ) : undefined}
        cancelAction={(
          <Button size="lg" variant="outlined" color="neutral" disabled={playIntentSaving} onClick={onCancel} sx={{ minHeight: 52 }}>
            Cancel
          </Button>
        )}
        primaryAction={(
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
        )}
      />
    </>
  )
}