import { Box, Button, Card, Input, Stack, Typography } from '@mui/joy'
import type { GameSearchResponse, GameSearchResult, LibraryEntry, LibraryEntryIntent, LibrarySuggestedGame } from '@game-is-up/shared'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { LibraryEditorCard } from '../components/dashboard/LibraryEditorCard'
import { LibraryEntryCard } from '../components/dashboard/LibraryEntryCard'
import { LibrarySuggestionsRow } from '../components/dashboard/LibrarySuggestionsRow'
import { libraryEntryGridSx } from '../components/dashboard/dashboardUtils'
import type { DashboardLibraryQuickAddGame } from '../components/dashboard/types'
import { useDashboardContext } from '../contexts/useDashboardContext'

function UsualAvailabilityCard({
  usualAvailability,
  profileSaving,
  usualAvailabilityChanged,
  usualAvailabilityButtonLabel,
  usualAvailabilityHelperText,
  onUsualAvailabilityChange,
  onSaveUsualAvailability
}: {
  usualAvailability: string;
  profileSaving: boolean;
  usualAvailabilityChanged: boolean;
  usualAvailabilityButtonLabel: string;
  usualAvailabilityHelperText: string;
  onUsualAvailabilityChange: (value: string) => void;
  onSaveUsualAvailability: () => Promise<void>;
}) {
  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Box>
          <Typography level="title-md">When do you usually play?</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
            Set one default schedule at the user level. Individual games can still carry their own override when they differ.
          </Typography>
        </Box>
        <Input
          placeholder="Example: Weeknights after 8pm"
          value={usualAvailability}
          onChange={(event) => onUsualAvailabilityChange(event.target.value)}
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <Button color="primary" disabled={profileSaving || !usualAvailabilityChanged} onClick={() => void onSaveUsualAvailability()}>
            {usualAvailabilityButtonLabel}
          </Button>
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            {usualAvailabilityHelperText}
          </Typography>
        </Stack>
      </Stack>
    </Card>
  )
}

function LibraryViewContent({
  isSignedIn,
  usualAvailability,
  profileSaving,
  usualAvailabilityChanged,
  usualAvailabilityButtonLabel,
  usualAvailabilityHelperText,
  onUsualAvailabilityChange,
  onSaveUsualAvailability,
  isLibraryEditorOpen,
  openLibraryEditor,
  closeLibraryEditor,
  editingLibraryEntry,
  libraryTitle,
  onLibraryTitleChange,
  selectedCatalogResult,
  gameSuggestions,
  gameSuggestionsLoading,
  onSelectSuggestion,
  platformOptions,
  selectedPlatformLabels,
  onTogglePlatformLabel,
  libraryIntent,
  onLibraryIntentChange,
  currentUsualAvailability,
  libraryAvailability,
  onLibraryAvailabilityChange,
  librarySaving,
  onAddLibraryEntry,
  onCancelLibraryEdit,
  libraryEntries,
  suggestedGames,
  libraryGameIds,
  addingLibraryGameId,
  editingLibraryEntryId,
  removingLibraryEntryId,
  onEditLibraryEntry,
  onRemoveLibraryEntry,
  onAddGameToLibrary
}: {
  isSignedIn: boolean;
  usualAvailability: string;
  profileSaving: boolean;
  usualAvailabilityChanged: boolean;
  usualAvailabilityButtonLabel: string;
  usualAvailabilityHelperText: string;
  onUsualAvailabilityChange: (value: string) => void;
  onSaveUsualAvailability: () => Promise<void>;
  isLibraryEditorOpen: boolean;
  openLibraryEditor: () => void;
  closeLibraryEditor: () => void;
  editingLibraryEntry: LibraryEntry | null;
  libraryTitle: string;
  onLibraryTitleChange: (value: string) => void;
  selectedCatalogResult: GameSearchResult | null;
  gameSuggestions: GameSearchResponse['results'];
  gameSuggestionsLoading: boolean;
  onSelectSuggestion: (result: GameSearchResult) => void;
  platformOptions: string[];
  selectedPlatformLabels: string[];
  onTogglePlatformLabel: (platform: string) => void;
  libraryIntent: LibraryEntryIntent;
  onLibraryIntentChange: (intent: LibraryEntryIntent) => void;
  currentUsualAvailability: string | null;
  libraryAvailability: string;
  onLibraryAvailabilityChange: (value: string) => void;
  librarySaving: boolean;
  onAddLibraryEntry: () => Promise<void>;
  onCancelLibraryEdit: () => void;
  libraryEntries: LibraryEntry[];
  suggestedGames: LibrarySuggestedGame[];
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  editingLibraryEntryId: string | null;
  removingLibraryEntryId: string | null;
  onEditLibraryEntry: (entry: LibraryEntry) => void;
  onRemoveLibraryEntry: (entryId: string) => Promise<void>;
  onAddGameToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
}) {
  if (!isSignedIn) {
    return (
      <EmptyStateCard
        title="Sign in to build your library"
        body="Library management becomes available after Discord sign-in. Once you are signed in, this tab is where you add games, platforms, and schedule defaults."
        chips={['Discord sign-in', 'Library drives overlap', 'Per-game schedule overrides']}
      />
    )
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Box>
          <Typography level="h2">Your library</Typography>
          <Typography level="body-md" sx={{ color: 'neutral.300', mt: 0.5 }}>
            Add a few games to your library so discovery, friends, and play-intent matching have something real to work from.
          </Typography>
        </Box>
        <Button color="primary" onClick={openLibraryEditor}>
          Add game to library
        </Button>
      </Stack>

      <UsualAvailabilityCard
        usualAvailability={usualAvailability}
        profileSaving={profileSaving}
        usualAvailabilityChanged={usualAvailabilityChanged}
        usualAvailabilityButtonLabel={usualAvailabilityButtonLabel}
        usualAvailabilityHelperText={usualAvailabilityHelperText}
        onUsualAvailabilityChange={onUsualAvailabilityChange}
        onSaveUsualAvailability={onSaveUsualAvailability}
      />

      <DashboardModal open={isLibraryEditorOpen} onClose={closeLibraryEditor} width="min(96vw, 760px)">
        <LibraryEditorCard
          editingLibraryEntry={editingLibraryEntry}
          libraryTitle={libraryTitle}
          onLibraryTitleChange={onLibraryTitleChange}
          selectedCatalogResult={selectedCatalogResult}
          gameSuggestions={gameSuggestions}
          gameSuggestionsLoading={gameSuggestionsLoading}
          onSelectSuggestion={onSelectSuggestion}
          platformOptions={platformOptions}
          selectedPlatformLabels={selectedPlatformLabels}
          onTogglePlatformLabel={onTogglePlatformLabel}
          libraryIntent={libraryIntent}
          onLibraryIntentChange={onLibraryIntentChange}
          currentUsualAvailability={currentUsualAvailability}
          libraryAvailability={libraryAvailability}
          onLibraryAvailabilityChange={onLibraryAvailabilityChange}
          librarySaving={librarySaving}
          onAddLibraryEntry={onAddLibraryEntry}
          onCancelLibraryEdit={onCancelLibraryEdit}
        />
      </DashboardModal>

      <LibrarySuggestionsRow
        suggestedGames={suggestedGames}
        libraryGameIds={libraryGameIds}
        addingLibraryGameId={addingLibraryGameId}
        onAddToLibrary={onAddGameToLibrary}
      />

      {libraryEntries.length > 0 ? (
        <Box sx={libraryEntryGridSx}>
          {libraryEntries.map((entry) => (
            <LibraryEntryCard
              key={entry.id}
              entry={entry}
              isEditing={editingLibraryEntryId === entry.id}
              editDisabled={librarySaving}
              isRemoving={removingLibraryEntryId === entry.id}
              onEdit={onEditLibraryEntry}
              onRemove={onRemoveLibraryEntry}
            />
          ))}
        </Box>
      ) : (
        <EmptyStateCard
          title="Your library is still empty"
          body="Add two or three games you care about. That is enough to start populating overlap and make friends useful."
          chips={['External catalog suggestions', 'Multi-platform flags', 'Discovery updates after save']}
        />
      )}
    </Stack>
  )
}

export function LibraryView() {
  const { libraryViewProps } = useDashboardContext()

  return <LibraryViewContent {...libraryViewProps} />
}