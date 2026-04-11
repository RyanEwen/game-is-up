import { Box, Button, Stack, Typography } from '@mui/joy'
import type {
  ActivePlayIntent,
  DiscoveryPerson,
  LibraryEntry,
  PlayIntentNotifyScope,
  PlayIntentPreview,
  PlayIntentSelectionMode
} from '@game-is-up/shared'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { PlayIntentCard } from '../components/dashboard/PlayIntentCard'
import { PlayIntentComposerCard } from '../components/dashboard/PlayIntentComposerCard'
import { useDashboardContext } from '../contexts/useDashboardContext'
import type { DashboardLibraryQuickAddGame, PlayIntentStartMode, PlayIntentTimingMode } from '../components/dashboard/types'

function PlayViewContent({
  isSignedIn,
  activePlayIntent,
  isPlayIntentComposerOpen,
  openPlayIntentComposer,
  closePlayIntentComposer,
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
  onClearPlayIntent,
  playIntentPreviews,
  libraryGameIds,
  addingLibraryGameId,
  onAddGameToLibrary
}: {
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
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  onAddGameToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
}) {
  const hasScheduledOwnCallToPlay = activePlayIntent ? new Date(activePlayIntent.windowStartsAt).getTime() > Date.now() + 60 * 1000 : false
  const playComposerButtonLabel = activePlayIntent
    ? hasScheduledOwnCallToPlay
      ? 'Manage scheduled call to play'
      : 'Manage live call to play'
    : 'Create call to play'

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Box>
          <Typography level="h2">Calls to play</Typography>
          <Typography level="body-md" sx={{ color: 'neutral.300', mt: 0.5 }}>
            See who is looking to play now or later, whether they opened up their whole library or just a smaller set of games.
          </Typography>
        </Box>
        {isSignedIn ? (
          <Button color="primary" disabled={!canPostPlayIntent && !activePlayIntent} onClick={openPlayIntentComposer}>
            {playComposerButtonLabel}
          </Button>
        ) : null}
      </Stack>

      {isSignedIn ? (
        <DashboardModal open={isPlayIntentComposerOpen} onClose={closePlayIntentComposer} width="min(96vw, 820px)">
            <PlayIntentComposerCard
              activePlayIntent={activePlayIntent}
              canPostPlayIntent={canPostPlayIntent}
              playIntentNotifyScope={playIntentNotifyScope}
              onPlayIntentNotifyScopeChange={onPlayIntentNotifyScopeChange}
              playIntentFriendOptions={playIntentFriendOptions}
              selectedPlayIntentTargetUserIds={selectedPlayIntentTargetUserIds}
              onTogglePlayIntentTargetUser={onTogglePlayIntentTargetUser}
              playIntentSelectionMode={playIntentSelectionMode}
              onPlayIntentSelectionModeChange={onPlayIntentSelectionModeChange}
              libraryEntries={libraryEntries}
              selectedPlayIntentGameIds={selectedPlayIntentGameIds}
              onTogglePlayIntentGame={onTogglePlayIntentGame}
              playIntentStartMode={playIntentStartMode}
              onPlayIntentStartModeChange={onPlayIntentStartModeChange}
              playIntentStartAtInput={playIntentStartAtInput}
              onPlayIntentStartAtInputChange={onPlayIntentStartAtInputChange}
              minPlayIntentStartAtInput={minPlayIntentStartAtInput}
              playIntentStartHelperText={playIntentStartHelperText}
              playIntentStartHasError={playIntentStartHasError}
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
        </DashboardModal>
      ) : null}
      {playIntentPreviews.length > 0 ? (
        <Stack spacing={2}>
          {playIntentPreviews.map((intent) => (
            <PlayIntentCard
              key={intent.id}
              intent={intent}
              canAddToLibrary={isSignedIn}
              libraryGameIds={libraryGameIds}
              addingLibraryGameId={addingLibraryGameId}
              onAddToLibrary={onAddGameToLibrary}
            />
          ))}
        </Stack>
      ) : (
        <EmptyStateCard
          title={isSignedIn ? 'No calls to play match your library yet' : 'Calls to play will appear here'}
          body={
            isSignedIn
              ? 'When someone visible to you posts a call to play that overlaps with your library, it will show up here.'
              : 'Once the API responds, this section shows current and scheduled calls to play from people visible to you.'
          }
          chips={
            isSignedIn
              ? ['Library overlap required', 'Friends drive visibility', 'Now or later']
              : ['Whole library', 'Selected games', 'Scheduled calls']
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