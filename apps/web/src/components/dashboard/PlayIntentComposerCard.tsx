import { Avatar, Button, Card, Chip, DialogContent, DialogTitle, Input, Stack, Typography } from '@mui/joy'
import type {
  ActivePlayIntent,
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
import { DashboardModalActionBar } from './DashboardModalActionBar'
import type { PlayIntentStartMode, PlayIntentTimingMode } from './types'

export function PlayIntentComposerCard({
  activePlayIntent,
  canPostPlayIntent,
  playIntentNotifyScope,
  onPlayIntentNotifyScopeChange,
  playIntentFriendOptions,
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
  playIntentNote,
  onPlayIntentNoteChange,
  playIntentSaving,
  onSavePlayIntent,
  onCancel,
  onClearPlayIntent
}: {
  activePlayIntent: ActivePlayIntent | null;
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
  onCancel: () => void;
  onClearPlayIntent: () => Promise<void>;
}) {
  const isScheduledIntent = activePlayIntent ? new Date(activePlayIntent.windowStartsAt).getTime() > Date.now() + 60 * 1000 : false
  const composerTitle = activePlayIntent
    ? isScheduledIntent
      ? 'Your call to play is scheduled'
      : 'Your call to play is live'
    : playIntentStartMode === 'scheduled'
      ? 'Schedule a call to play'
      : 'Post a call to play'
  const saveButtonLabel = playIntentSaving
    ? activePlayIntent
      ? 'Saving call to play...'
      : playIntentStartMode === 'scheduled'
        ? 'Scheduling call to play...'
        : 'Posting call to play...'
    : activePlayIntent
      ? 'Update call to play'
      : playIntentStartMode === 'scheduled'
        ? 'Schedule call to play'
        : 'Post call to play'

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
          Let others know when you want to play, whether that is now or later. The app only notifies users with the same games in their libraries.
        </Typography>

        {activePlayIntent ? (
          <Card color="success" variant="soft" sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Typography level="title-md">{activePlayIntent.title}</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                {isScheduledIntent ? (
                  <>
                    <Chip color="warning" variant="soft">
                      Starts {new Date(activePlayIntent.windowStartsAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </Chip>
                    <Chip color="success" variant="soft">
                      Ends {new Date(activePlayIntent.windowEndsAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </Chip>
                  </>
                ) : (
                  <Chip color="success" variant="soft">
                    Live until {new Date(activePlayIntent.windowEndsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Chip>
                )}
                <Chip color="primary" variant="outlined">
                  {formatNotifyScopeLabel(activePlayIntent.notifyScope)}
                </Chip>
                <Chip color="neutral" variant="outlined">
                  {formatPlayIntentSelectionModeLabel(activePlayIntent.selectionMode)}
                </Chip>
              </Stack>
              <Typography level="body-xs" sx={{ color: 'neutral.300' }}>
                {formatNotifyScopeDescription(activePlayIntent.notifyScope)}
              </Typography>
              {activePlayIntent.notifyScope === 'specific-friends' && activePlayIntent.targetedFriends.length > 0 ? (
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                  {activePlayIntent.targetedFriends.map((friend) => (
                    <Chip
                      key={friend.id}
                      variant="outlined"
                      color="neutral"
                      startDecorator={<Avatar src={friend.avatarUrl ?? undefined} alt={friend.displayName} size="sm" variant="soft" />}
                    >
                      {friend.displayName}
                    </Chip>
                  ))}
                </Stack>
              ) : null}
              {activePlayIntent.note ? (
                <Typography level="body-sm" sx={{ color: 'neutral.100' }}>
                  {activePlayIntent.note}
                </Typography>
              ) : null}
            </Stack>
          </Card>
        ) : null}

        {!canPostPlayIntent ? (
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            Add at least one game to your library before posting a call to play.
          </Typography>
        ) : null}

        <Stack spacing={1}>
          <Typography level="title-sm">Who do you want to target?</Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {(['network', 'friends-only', 'specific-friends'] as const).map((scope) => (
              <Button
                key={scope}
                size="sm"
                variant={playIntentNotifyScope === scope ? 'solid' : 'outlined'}
                color={playIntentNotifyScope === scope ? 'primary' : 'neutral'}
                disabled={scope === 'specific-friends' && playIntentFriendOptions.length === 0}
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
              </Stack>
            ) : (
              <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                Add friends first to target a specific audience.
              </Typography>
            )
          ) : null}
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
                disabled={!canPostPlayIntent}
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
                  disabled={!canPostPlayIntent}
                  onClick={() => onTogglePlayIntentGame(entry.gameId)}
                >
                  {entry.title}
                </Button>
              ))}
            </Stack>
          </Stack>
        ) : null}

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
            <Input
              type="datetime-local"
              value={playIntentStartAtInput}
              onChange={(event) => onPlayIntentStartAtInputChange(event.target.value)}
              slotProps={{
                input: {
                  min: minPlayIntentStartAtInput,
                  step: 60
                }
              }}
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
            <Input
              type="datetime-local"
              value={playIntentEndAtInput}
              onChange={(event) => onPlayIntentEndAtInputChange(event.target.value)}
              slotProps={{
                input: {
                  min: minPlayIntentEndAtInput,
                  max: maxPlayIntentEndAtInput,
                  step: 60
                }
              }}
            />
          ) : null}

          <Typography level="body-xs" sx={{ color: playIntentTimingHasError ? 'danger.300' : 'neutral.300' }}>
            {playIntentTimingHelperText}
          </Typography>
        </Stack>

        <Stack spacing={1}>
          <Typography level="title-sm">Note</Typography>
          <Input
            placeholder="Example: voice chat on, happy to fill support"
            value={playIntentNote}
            onChange={(event) => onPlayIntentNoteChange(event.target.value)}
          />
        </Stack>
      </DialogContent>
      <DashboardModalActionBar
        secondaryAction={activePlayIntent ? (
          <Button
            variant="outlined"
            color="neutral"
            disabled={playIntentSaving}
            onClick={() => void onClearPlayIntent()}
            sx={{ minHeight: 46 }}
          >
            Clear call to play
          </Button>
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
            disabled={playIntentSaving || !canPostPlayIntent}
            onClick={() => void onSavePlayIntent()}
            sx={{
              flex: 1,
              minHeight: 52,
              fontWeight: 700,
              boxShadow: '0 12px 30px rgba(46, 125, 50, 0.28)'
            }}
          >
            {saveButtonLabel}
          </Button>
        )}
      />
    </>
  )
}