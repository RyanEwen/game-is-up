import { Box, Button, Card, Chip, Input, Stack, Typography } from '@mui/joy'
import type {
  ActivePlayIntent,
  LibraryEntry,
  PlayIntentNotifyScope,
  PlayIntentPreview,
  PlayIntentSelectionMode
} from '@game-is-up/shared'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { PlayIntentCard } from '../components/dashboard/PlayIntentCard'
import { useDashboardContext } from '../contexts/useDashboardContext'
import {
  formatPlayIntentDurationLabel,
  formatNotifyScopeDescription,
  formatNotifyScopeLabel,
  formatPlayIntentSelectionModeLabel,
  maximumPlayIntentDurationMinutes,
  minimumPlayIntentDurationMinutes,
  playIntentPresetDurations
} from '../components/dashboard/dashboardUtils'
import type { PlayIntentTimingMode } from '../components/dashboard/types'

function PlayIntentComposerCard({
  activePlayIntent,
  canPostPlayIntent,
  playIntentNotifyScope,
  onPlayIntentNotifyScopeChange,
  playIntentSelectionMode,
  onPlayIntentSelectionModeChange,
  libraryEntries,
  selectedPlayIntentGameIds,
  onTogglePlayIntentGame,
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
  onClearPlayIntent
}: {
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
}) {
  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Box>
          <Typography level="title-lg">{activePlayIntent ? 'Your call to play is live' : 'Post a call to play'}</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
            Let your friends know you are ready now. The app only notifies overlapping friends based on the games in your library or the games you pick here.
          </Typography>
        </Box>

        {activePlayIntent ? (
          <Card color="success" variant="soft" sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Typography level="title-md">{activePlayIntent.title}</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                <Chip color="success" variant="soft">
                  Live until {new Date(activePlayIntent.windowEndsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Chip>
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
          <Typography level="title-sm">Audience</Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {(['discovery-and-friends', 'friends-only'] as const).map((scope) => (
              <Button
                key={scope}
                size="sm"
                variant={playIntentNotifyScope === scope ? 'solid' : 'outlined'}
                color={playIntentNotifyScope === scope ? 'primary' : 'neutral'}
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
          <Typography level="title-sm">How long should this stay live?</Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {([
              ['preset', 'Quick picks'],
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

          {playIntentTimingMode === 'preset' ? (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              {playIntentPresetDurations.map((durationMinutes) => (
                <Button
                  key={durationMinutes}
                  size="sm"
                  variant={playIntentDurationMinutes === durationMinutes ? 'solid' : 'outlined'}
                  color={playIntentDurationMinutes === durationMinutes ? 'primary' : 'neutral'}
                  onClick={() => onPlayIntentPresetSelect(durationMinutes)}
                >
                  {formatPlayIntentDurationLabel(durationMinutes)}
                </Button>
              ))}
            </Stack>
          ) : null}

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

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button color="primary" disabled={playIntentSaving || !canPostPlayIntent} onClick={() => void onSavePlayIntent()}>
            {playIntentSaving ? 'Saving call to play...' : activePlayIntent ? 'Update call to play' : 'Post call to play'}
          </Button>
          {activePlayIntent ? (
            <Button variant="outlined" color="neutral" disabled={playIntentSaving} onClick={() => void onClearPlayIntent()}>
              Clear call to play
            </Button>
          ) : null}
        </Stack>
      </Stack>
    </Card>
  )
}

function PlayViewContent({
  isSignedIn,
  activePlayIntent,
  canPostPlayIntent,
  playIntentNotifyScope,
  onPlayIntentNotifyScopeChange,
  playIntentSelectionMode,
  onPlayIntentSelectionModeChange,
  libraryEntries,
  selectedPlayIntentGameIds,
  onTogglePlayIntentGame,
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
  onClearPlayIntent,
  playIntentPreviews
}: {
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
}) {
  return (
    <Stack spacing={2}>
      <Typography level="h2">Happening now</Typography>
      <Typography level="body-md" sx={{ color: 'neutral.300' }}>
        See who in your network is actively looking to play right now, whether they opened up their whole library or just a smaller set of games.
      </Typography>
      {isSignedIn ? (
        <PlayIntentComposerCard
          activePlayIntent={activePlayIntent}
          canPostPlayIntent={canPostPlayIntent}
          playIntentNotifyScope={playIntentNotifyScope}
          onPlayIntentNotifyScopeChange={onPlayIntentNotifyScopeChange}
          playIntentSelectionMode={playIntentSelectionMode}
          onPlayIntentSelectionModeChange={onPlayIntentSelectionModeChange}
          libraryEntries={libraryEntries}
          selectedPlayIntentGameIds={selectedPlayIntentGameIds}
          onTogglePlayIntentGame={onTogglePlayIntentGame}
          playIntentTimingMode={playIntentTimingMode}
          onPlayIntentTimingModeChange={onPlayIntentTimingModeChange}
          playIntentDurationMinutes={playIntentDurationMinutes}
          onPlayIntentPresetSelect={onPlayIntentPresetSelect}
          playIntentCustomDurationInput={playIntentCustomDurationInput}
          onPlayIntentCustomDurationInputChange={onPlayIntentCustomDurationInputChange}
          playIntentEndAtInput={playIntentEndAtInput}
          onPlayIntentEndAtInputChange={onPlayIntentEndAtInputChange}
          minPlayIntentEndAtInput={minPlayIntentEndAtInput}
          maxPlayIntentEndAtInput={maxPlayIntentEndAtInput}
          playIntentTimingHelperText={playIntentTimingHelperText}
          playIntentTimingHasError={playIntentTimingHasError}
          playIntentNote={playIntentNote}
          onPlayIntentNoteChange={onPlayIntentNoteChange}
          playIntentSaving={playIntentSaving}
          onSavePlayIntent={onSavePlayIntent}
          onClearPlayIntent={onClearPlayIntent}
        />
      ) : null}
      {playIntentPreviews.length > 0 ? (
        <Stack spacing={2}>
          {playIntentPreviews.map((intent) => (
            <PlayIntentCard key={intent.id} intent={intent} />
          ))}
        </Stack>
      ) : (
        <EmptyStateCard
          title={isSignedIn ? 'No one looking to play right now' : 'Happening now will appear here'}
          body={
            isSignedIn
              ? 'When friends in your network post an active call to play that overlaps with your library, it will show up here.'
              : 'Once the API responds, this section shows active availability from people in your network.'
          }
          chips={
            isSignedIn
              ? ['Library overlap required', 'Friends drive visibility', 'Active availability only']
              : ['Whole library', 'Selected games']
          }
        />
      )}
    </Stack>
  )
}

export function PlayView() {
  const { playViewProps } = useDashboardContext()

  return <PlayViewContent {...playViewProps} />
}