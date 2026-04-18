import { useState } from 'react'
import { Box, Button, DialogContent, DialogTitle, Option, Select, Stack, Typography } from '@mui/joy'
import type { DiscoveryPerson } from '@game-is-up/shared'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { LibraryEditorCard } from '../components/dashboard/LibraryEditorCard'
import { PersonCard } from '../components/dashboard/PersonCard'
import { useDashboardContext } from '../contexts/useDashboardContext'
import type { DashboardLibraryQuickAddGame, FriendTarget } from '../components/dashboard/types'

type FriendSort = 'matching-games' | 'games' | 'name'

function getMatchingGameCount(person: DiscoveryPerson, libraryGameIds: ReadonlySet<string>) {
  return person.games.reduce((count, game) => count + (libraryGameIds.has(game.id) ? 1 : 0), 0)
}

function sortPeople(people: DiscoveryPerson[], sort: FriendSort, libraryGameIds: ReadonlySet<string>) {
  return [...people].sort((left, right) => {
    const leftMatchingGames = getMatchingGameCount(left, libraryGameIds)
    const rightMatchingGames = getMatchingGameCount(right, libraryGameIds)

    if (sort === 'matching-games' && leftMatchingGames !== rightMatchingGames) {
      return rightMatchingGames - leftMatchingGames
    }

    if (sort === 'games' && left.games.length !== right.games.length) {
      return right.games.length - left.games.length
    }

    if (sort !== 'name' && left.games.length !== right.games.length) {
      return right.games.length - left.games.length
    }

    return left.displayName.localeCompare(right.displayName)
  })
}

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
  onRemoveLibraryEntry,
  mutedPlayIntentUserIds,
  onMutePlayIntentUser,
  onUnmutePlayIntentUser
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
  mutedPlayIntentUserIds: ReadonlySet<string>;
  onMutePlayIntentUser: (userId: string) => Promise<void>;
  onUnmutePlayIntentUser: (userId: string) => Promise<void>;
}) {
  const [isAddFriendsModalOpen, setIsAddFriendsModalOpen] = useState(false)
  const [friendSort, setFriendSort] = useState<FriendSort>('matching-games')
  const sortedFriends = sortPeople(friends, friendSort, libraryGameIds)
  const sortedAddableFriends = sortPeople(addableFriends, friendSort, libraryGameIds)

  const friendSortControl = friends.length > 0 || addableFriends.length > 0 ? (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Typography level="body-sm" sx={{ color: 'neutral.400', whiteSpace: 'nowrap' }}>Sort by</Typography>
      <Select
        size="sm"
        value={friendSort}
        onChange={(_event, nextValue) => {
          if (nextValue) {
            setFriendSort(nextValue)
          }
        }}
        sx={{ minWidth: 170 }}
      >
        <Option value="matching-games">Matching games</Option>
        <Option value="games">Number of games</Option>
        <Option value="name">Name</Option>
      </Select>
    </Box>
  ) : null

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Box>
          <Typography level="h2">Friends</Typography>
          <Typography level="body-md" sx={{ color: 'neutral.300', mt: 0.5 }}>
            Keep track of the people you care about most and what they are playing.
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent={{ xs: 'stretch', sm: 'flex-end' }}>
          {friendSortControl}
          {isSignedIn ? (
            <Button color="primary" onClick={() => setIsAddFriendsModalOpen(true)}>
              Add friends
            </Button>
          ) : null}
        </Stack>
      </Stack>

      {error ? (
        <EmptyStateCard
          title="Friends are temporarily unavailable"
          body={`${error} Retrying in the background every 5 seconds. The dashboard will refresh automatically when the API responds again.`}
        />
      ) : friends.length > 0 ? (
        <Stack spacing={2}>
          {sortedFriends.map((person) => (
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
              isMuted={mutedPlayIntentUserIds.has(person.id)}
              onMute={onMutePlayIntentUser}
              onUnmute={onUnmutePlayIntentUser}
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

            {sortedAddableFriends.length > 0 ? (
              <Stack spacing={2}>
                <Typography level="title-sm">People already in your network</Typography>
                {sortedAddableFriends.map((person) => (
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
                    isMuted={mutedPlayIntentUserIds.has(person.id)}
                    onMute={onMutePlayIntentUser}
                    onUnmute={onUnmutePlayIntentUser}
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
  const gameAliasByGameId = new Map(libraryViewProps.gameAliases.map((alias) => [alias.gameId, alias.aliasValue]))
  const editorGameAlias = libraryViewProps.editingLibraryEntry
    ? (gameAliasByGameId.get(libraryViewProps.editingLibraryEntry.gameId) ?? null)
    : null

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
          gameAlias={editorGameAlias}
          aliasSaving={Boolean(
            libraryViewProps.editingLibraryEntry &&
            libraryViewProps.aliasSavingKey === `game:${libraryViewProps.editingLibraryEntry.gameId}`
          )}
          onSaveGameAlias={libraryViewProps.onSaveGameAlias}
          onDeleteGameAlias={libraryViewProps.onDeleteGameAlias}
          librarySaving={libraryViewProps.librarySaving}
          onAddLibraryEntry={libraryViewProps.onAddLibraryEntry}
          onCancelLibraryEdit={libraryViewProps.onCancelLibraryEdit}
        />
      </DashboardModal>
    </>
  )
}