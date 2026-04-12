import { useState } from 'react'
import { Avatar, Box, Button, Chip, DialogContent, DialogTitle, Sheet, Stack, Typography } from '@mui/joy'
import type { DiscordAccountInstall, DiscordFriendConnection, DiscordFriendsResponse, DiscoveryPerson } from '@game-is-up/shared'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { LibraryEditorCard } from '../components/dashboard/LibraryEditorCard'
import { PersonCard } from '../components/dashboard/PersonCard'
import { useDashboardContext } from '../contexts/useDashboardContext'
import type { DashboardLibraryQuickAddGame, FriendTarget } from '../components/dashboard/types'

function AddableDiscordFriendCard({
  friend,
  friendPendingId,
  onToggleFriend
}: {
  friend: DiscordFriendConnection;
  friendPendingId: string | null;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
}) {
  if (!friend.appUser) {
    return null
  }

  const pending = friendPendingId === friend.appUser.id

  return (
    <Sheet variant="outlined" sx={{ p: 1.5, borderRadius: 'md', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Avatar src={friend.appUser.avatarUrl ?? friend.avatarUrl ?? undefined} alt={friend.appUser.displayName} size="md" variant="soft" />
          <Box>
            <Typography level="title-sm">{friend.appUser.displayName}</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
              Game Is Up: @{friend.appUser.handle} • Discord: @{friend.username}
            </Typography>
          </Box>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <Chip size="sm" color={friend.installStatus === 'installed' ? 'success' : 'neutral'} variant={friend.installStatus === 'installed' ? 'soft' : 'outlined'}>
            Discord app {friend.installStatus}
          </Chip>
          <Button
            size="sm"
            color="primary"
            disabled={pending}
            onClick={() => void onToggleFriend({
              id: friend.appUser!.id,
              displayName: friend.appUser!.displayName,
              avatarUrl: friend.appUser!.avatarUrl,
              friendEligible: true
            })}
          >
            {pending ? 'Adding...' : 'Add friend'}
          </Button>
        </Stack>
      </Stack>
    </Sheet>
  )
}

function FriendsViewContent({
  error,
  isSignedIn,
  showDiscordFriendBeta,
  friends,
  discordFriends,
  addableDiscordFriends,
  discordAccountInstall,
  discordFriendSyncing,
  addableFriends,
  noDiscoveryServersSelected,
  libraryGameIds,
  libraryEntryIdsByGameId,
  addingLibraryGameId,
  removingLibraryEntryId,
  friendPendingId,
  onOpenDiscordAccountInstall,
  onSyncDiscordFriends,
  onToggleFriend,
  onAddGameToLibrary,
  onRemoveLibraryEntry
}: {
  error: string | null;
  isSignedIn: boolean;
  showDiscordFriendBeta: boolean;
  friends: DiscoveryPerson[];
  discordFriends: DiscordFriendsResponse | null;
  addableDiscordFriends: DiscordFriendConnection[];
  discordAccountInstall: DiscordAccountInstall | null;
  discordFriendSyncing: boolean;
  addableFriends: DiscoveryPerson[];
  noDiscoveryServersSelected: boolean;
  libraryGameIds: ReadonlySet<string>;
  libraryEntryIdsByGameId: ReadonlyMap<string, string>;
  addingLibraryGameId: string | null;
  removingLibraryEntryId: string | null;
  friendPendingId: string | null;
  onOpenDiscordAccountInstall: () => Promise<void>;
  onSyncDiscordFriends: () => Promise<void>;
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
              ? 'Add at least one Discord server to your network so you can discover people and add friends.'
              : isSignedIn
                ? 'Add friends from people already visible in your network, and they will show up here.'
                : 'Sign in to build your network and start adding friends.'
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
              {showDiscordFriendBeta
                ? 'Add people from your imported Discord friends first, then use the rest of your network for everyone else.'
                : 'Add people who are already visible in your network.'}
            </Typography>

            {showDiscordFriendBeta ? (
              <>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <Button color="primary" disabled={discordFriendSyncing} onClick={() => void onSyncDiscordFriends()}>
                    {discordFriendSyncing ? 'Syncing Discord friends...' : 'Sync Discord friends'}
                  </Button>
                  <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                    Run this from the Game Is Up activity inside Discord to refresh imported Discord relationships.
                  </Typography>
                </Stack>

                {discordAccountInstall?.status !== 'installed' ? (
                  <Sheet variant="soft" sx={{ p: 1.5, borderRadius: 'md' }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                      <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                        {discordAccountInstall?.note ?? 'Add Game Is Up to your Discord account so Discord installs and removals can be tracked.'}
                      </Typography>
                      <Button size="sm" color="primary" onClick={() => void onOpenDiscordAccountInstall()}>
                        {discordAccountInstall?.status === 'removed' ? 'Reinstall on Discord' : 'Add app to your account'}
                      </Button>
                    </Stack>
                  </Sheet>
                ) : null}

                {addableDiscordFriends.length > 0 ? (
                  <Stack spacing={1.25}>
                    <Typography level="title-sm">Discord friends on Game Is Up</Typography>
                    {addableDiscordFriends.map((friend) => (
                      <AddableDiscordFriendCard
                        key={friend.discordUserId}
                        friend={friend}
                        friendPendingId={friendPendingId}
                        onToggleFriend={onToggleFriend}
                      />
                    ))}
                  </Stack>
                ) : (
                  <Sheet variant="outlined" sx={{ p: 1.5, borderRadius: 'md', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                    <Typography level="title-sm">Discord friends</Typography>
                    <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
                      {discordFriends?.note ?? 'No imported Discord friends are ready to add yet.'} Imported Discord friends who already signed into Game Is Up will appear here.
                    </Typography>
                  </Sheet>
                )}
              </>
            ) : null}

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
                body={
                  showDiscordFriendBeta && addableDiscordFriends.length > 0
                    ? 'Your imported Discord friends are the only people ready to add right now.'
                    : noDiscoveryServersSelected
                    ? 'Add a Discord server to your network first so more people appear here.'
                    : 'Everyone currently visible in your network is already on your friends list.'
                }
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