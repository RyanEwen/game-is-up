import { Box, Card, Stack, Typography } from '@mui/joy'
import type { DiscoveryGame, DiscoveryPerson } from '@game-is-up/shared'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { GameCard } from '../components/dashboard/GameCard'
import { LibraryEditorCard } from '../components/dashboard/LibraryEditorCard'
import { PersonCard } from '../components/dashboard/PersonCard'
import { discoveryGameGridSx } from '../components/dashboard/dashboardUtils'
import { useDashboardContext } from '../contexts/useDashboardContext'
import type { DashboardLibraryQuickAddGame, FriendTarget } from '../components/dashboard/types'

const showsDemoDiscoveryCopy = import.meta.env.DEV

function DiscoverySection({
  isFirst = false,
  title,
  description,
  children,
  helperText
}: {
  isFirst?: boolean;
  title: string;
  description: string;
  helperText?: string;
  children: React.ReactNode;
}) {
  return (
    <Stack spacing={2} sx={{ mt: isFirst ? 0 : 3 }}>
      <Typography level="h2">{title}</Typography>
      <Typography level="body-md" sx={{ color: 'neutral.300' }}>
        {description}
      </Typography>
      {helperText ? (
        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
          {helperText}
        </Typography>
      ) : null}
      {children}
    </Stack>
  )
}

function DiscoveryViewContent({
  error,
  overlapGames,
  browseGames,
  discoveryPeople,
  noDiscoveryServersSelected,
  isSignedIn,
  libraryGameIds,
  libraryEntryIdsByGameId,
  addingLibraryGameId,
  removingLibraryEntryId,
  friendPendingId,
  onToggleFriend,
  onAddGameToLibrary,
  onRemoveLibraryEntry
}: {
  error: string | null;
  overlapGames: DiscoveryGame[];
  browseGames: DiscoveryGame[];
  discoveryPeople: DiscoveryPerson[];
  noDiscoveryServersSelected: boolean;
  isSignedIn: boolean;
  libraryGameIds: ReadonlySet<string>;
  libraryEntryIdsByGameId: ReadonlyMap<string, string>;
  addingLibraryGameId: string | null;
  removingLibraryEntryId: string | null;
  friendPendingId: string | null;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
  onAddGameToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
  onRemoveLibraryEntry: (entryId: string) => Promise<void>;
}) {
  const networkPeople = discoveryPeople.filter((person) => !person.isFriend)

  return (
    <Stack spacing={0}>
      <DiscoverySection
        isFirst
        title="Shared games"
        description="Games you have in common with people in your network."
      >
        {error ? (
          <Card color="danger" variant="soft">
            <Typography level="body-md">{error}</Typography>
            <Typography level="body-sm" sx={{ mt: 1 }}>
              Retrying in the background every 5 seconds. The dashboard will refresh automatically when the API responds again.
            </Typography>
          </Card>
        ) : null}
        {overlapGames.length > 0 ? (
          <Box sx={discoveryGameGridSx}>
            {overlapGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                canManage={isSignedIn}
                canAddToLibrary={isSignedIn}
                isInLibrary={libraryGameIds.has(game.id)}
                libraryEntryId={libraryEntryIdsByGameId.get(game.id) ?? null}
                isAddingToLibrary={addingLibraryGameId === game.id}
                isRemovingFromLibrary={removingLibraryEntryId === (libraryEntryIdsByGameId.get(game.id) ?? null)}
                pendingFriendId={friendPendingId}
                onToggleFriend={onToggleFriend}
                onAddToLibrary={onAddGameToLibrary}
                onRemoveFromLibrary={onRemoveLibraryEntry}
                compact
              />
            ))}
          </Box>
        ) : (
          <EmptyStateCard
            title={isSignedIn ? 'No shared games yet' : 'Shared games will appear here'}
            body={
              noDiscoveryServersSelected
                ? 'You do not have any Discord servers in your network, so the app has no network members to compare against.'
                : isSignedIn
                  ? "Add games to your library and select at least one Discord server to form your network so Game's Up can find people with matching games."
                  : showsDemoDiscoveryCopy
                    ? 'This section shows games that the seeded demo viewer and other users both have in their playlists.'
                    : 'Sign in to compare your library with friends and other people in your network.'
            }
          />
        )}
      </DiscoverySection>

      <DiscoverySection
        title="Other games"
        description="Games you don't have in common with people in your network."
      >
        {browseGames.length > 0 ? (
          <Box sx={discoveryGameGridSx}>
            {browseGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                canManage={isSignedIn}
                canAddToLibrary={isSignedIn}
                isInLibrary={libraryGameIds.has(game.id)}
                libraryEntryId={libraryEntryIdsByGameId.get(game.id) ?? null}
                isAddingToLibrary={addingLibraryGameId === game.id}
                isRemovingFromLibrary={removingLibraryEntryId === (libraryEntryIdsByGameId.get(game.id) ?? null)}
                pendingFriendId={friendPendingId}
                onToggleFriend={onToggleFriend}
                onAddToLibrary={onAddGameToLibrary}
                onRemoveFromLibrary={onRemoveLibraryEntry}
                compact
              />
            ))}
          </Box>
        ) : (
          <EmptyStateCard
            title={isSignedIn ? 'No other games yet' : 'No other games yet'}
            body={
              noDiscoveryServersSelected
                ? 'Select at least one Discord server to form your network so that you can browse other games played by network members.'
                : isSignedIn
                  ? overlapGames.length > 0
                    ? 'Everything is already shown above because it also matches your library.'
                    : 'No one in your network has games in their playlist yet.'
                  : overlapGames.length > 0
                    ? 'All titles are already covered in the shared games section above.'
                    : 'Sign in to see other games played by friends and other people in your network.'
            }
          />
        )}
      </DiscoverySection>

      <DiscoverySection
        title="Network members"
        description="People in your network who are not already on your friends list."
      >
        {networkPeople.length > 0 ? (
          <Stack spacing={2}>
            {networkPeople.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                canManage={isSignedIn}
                canAddToLibrary={isSignedIn}
                libraryGameIds={libraryGameIds}
                libraryEntryIdsByGameId={libraryEntryIdsByGameId}
                addingLibraryGameId={addingLibraryGameId}
                removingLibraryEntryId={removingLibraryEntryId}
                isPending={friendPendingId === person.id}
                onToggleFriend={onToggleFriend}
                onAddToLibrary={onAddGameToLibrary}
                onRemoveLibraryEntry={onRemoveLibraryEntry}
              />
            ))}
          </Stack>
        ) : (
          <EmptyStateCard
            title={isSignedIn ? 'No network members to show yet' : 'Network members will appear here'}
            body={
              noDiscoveryServersSelected
                ? 'You do not have any Discord servers in your network to find others on.'
                : isSignedIn
                  ? 'No other people in your network are available yet. Friends appear in the Friends view.'
                  : showsDemoDiscoveryCopy
                    ? 'This section shows the seeded network-member view. Friends are listed separately in the Friends view.'
                    : 'Sign in to browse people in your network here.'
            }
          />
        )}
      </DiscoverySection>
    </Stack>
  )
}

export function DiscoveryView() {
  const { discoveryViewProps, libraryViewProps } = useDashboardContext()

  return (
    <>
      <DiscoveryViewContent {...discoveryViewProps} />
      <DashboardModal open={libraryViewProps.isLibraryEditorOpen} onClose={libraryViewProps.closeLibraryEditor} width="min(96vw, 760px)">
        <LibraryEditorCard
          editingLibraryEntry={libraryViewProps.editingLibraryEntry}
          libraryTitle={libraryViewProps.libraryTitle}
          onLibraryTitleChange={libraryViewProps.onLibraryTitleChange}
          selectedCatalogResult={libraryViewProps.selectedCatalogResult}
          gameSuggestions={libraryViewProps.gameSuggestions}
          gameSuggestionsLoading={libraryViewProps.gameSuggestionsLoading}
          onSelectSuggestion={libraryViewProps.onSelectSuggestion}
          platformOptions={libraryViewProps.platformOptions}
          selectedPlatformLabels={libraryViewProps.selectedPlatformLabels}
          onTogglePlatformLabel={libraryViewProps.onTogglePlatformLabel}
          libraryIntent={libraryViewProps.libraryIntent}
          onLibraryIntentChange={libraryViewProps.onLibraryIntentChange}
          currentUsualAvailability={libraryViewProps.currentUsualAvailability}
          libraryAvailability={libraryViewProps.libraryAvailability}
          onLibraryAvailabilityChange={libraryViewProps.onLibraryAvailabilityChange}
          librarySaving={libraryViewProps.librarySaving}
          onAddLibraryEntry={libraryViewProps.onAddLibraryEntry}
          onCancelLibraryEdit={libraryViewProps.onCancelLibraryEdit}
        />
      </DashboardModal>
    </>
  )
}