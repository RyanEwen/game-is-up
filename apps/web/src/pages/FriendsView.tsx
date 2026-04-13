import { useState } from 'react'
import { Box, Button, DialogContent, DialogTitle, Stack, Typography } from '@mui/joy'
import type { DiscoveryPerson } from '@game-is-up/shared'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { LibraryEditorCard } from '../components/dashboard/LibraryEditorCard'
import { PersonCard } from '../components/dashboard/PersonCard'
import { useDashboardContext } from '../contexts/useDashboardContext'
import type { DashboardLibraryQuickAddGame, FriendTarget } from '../components/dashboard/types'

function FriendsViewContent({
  error,
  isSignedIn,
  friends,
  addableFriends,
  noDiscoveryServersSelected,
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
  isSignedIn: boolean;
  friends: DiscoveryPerson[];
  addableFriends: DiscoveryPerson[];
  noDiscoveryServersSelected: boolean;
  libraryGameIds: ReadonlySet<string>;
  libraryEntryIdsByGameId: ReadonlyMap<string, string>;
  addingLibraryGameId: string | null;
  removingLibraryEntryId: string | null;
  friendPendingId: string | null;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
  onAddGameToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
  onRemoveLibraryEntry: (entryId: string) => Promise<void>;
}) {
  const [isAddFriendsModalOpen, setIsAddFriendsModalOpen] = useState(false)

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Box>
          <Typography level="h2">Friends</Typography>
          <Typography level="body-md" sx={{ color: 'neutral.300', mt: 0.5 }}>
            Keep track of the people you care about most and what they are playing.
          </Typography>
        </Box>
        {isSignedIn ? (
          <Button color="primary" onClick={() => setIsAddFriendsModalOpen(true)}>
            Add friends
          </Button>
        ) : null}
      </Stack>

      {error ? (
        <EmptyStateCard
          title="Friends are temporarily unavailable"
          body={`${error} Retrying in the background every 5 seconds. The dashboard will refresh automatically when the API responds again.`}
        />
      ) : friends.length > 0 ? (
        <Stack spacing={2}>
          {friends.map((person) => (
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
          title={isSignedIn ? 'No friends added yet' : 'Friends will appear here'}
          body={
            noDiscoveryServersSelected
              ? 'Select at least one Discord server to form your network so you can discover people and add friends.'
              : isSignedIn
                ? 'Add friends from your network and they will show up here.'
                : 'Sign in to form your network and start adding friends.'
          }
        />
      )}

      {isSignedIn ? (
        <DashboardModal open={isAddFriendsModalOpen} onClose={() => setIsAddFriendsModalOpen(false)} width="min(96vw, 860px)">
          <DialogTitle sx={{ pr: 6 }}>Add friends</DialogTitle>
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
            <Typography level="body-md" sx={{ color: 'neutral.300' }}>
              Add people who are already in your network.
            </Typography>

            {addableFriends.length > 0 ? (
              <Stack spacing={2}>
                <Typography level="title-sm">People already in your network</Typography>
                {addableFriends.map((person) => (
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
                title="No one new to add right now"
                body={noDiscoveryServersSelected
                  ? 'Select at least one Discord server to form your network first so people appear here.'
                  : 'Everyone in your network is already on your friends list.'}
              />
            )}
          </DialogContent>
        </DashboardModal>
      ) : null}
    </Stack>
  )
}

export function FriendsView() {
  const { friendsViewProps, libraryViewProps } = useDashboardContext()

  return (
    <>
      <FriendsViewContent {...friendsViewProps} />
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