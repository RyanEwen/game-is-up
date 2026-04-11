import { Box, Card, Stack, Typography } from '@mui/joy'
import type { DiscoveryGame, DiscoveryPerson } from '@game-is-up/shared'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { GameCard } from '../components/dashboard/GameCard'
import { PersonCard } from '../components/dashboard/PersonCard'
import { discoveryGameGridSx } from '../components/dashboard/dashboardUtils'
import { useDashboardContext } from '../contexts/useDashboardContext'
import type { DashboardLibraryQuickAddGame, FriendTarget } from '../components/dashboard/types'

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
  addingLibraryGameId,
  friendPendingId,
  onToggleFriend,
  onAddGameToLibrary
}: {
  error: string | null;
  overlapGames: DiscoveryGame[];
  browseGames: DiscoveryGame[];
  discoveryPeople: DiscoveryPerson[];
  noDiscoveryServersSelected: boolean;
  isSignedIn: boolean;
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  friendPendingId: string | null;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
  onAddGameToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
}) {
  return (
    <Stack spacing={0}>
      <DiscoverySection
        isFirst
        title="Shared games"
        description="These are the games you share with people Game Is Up can find through your selected servers and friends list."
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
                isAddingToLibrary={addingLibraryGameId === game.id}
                pendingFriendId={friendPendingId}
                onToggleFriend={onToggleFriend}
                onAddToLibrary={onAddGameToLibrary}
                compact
              />
            ))}
          </Box>
        ) : (
          <EmptyStateCard
            title={isSignedIn ? 'No shared games yet' : 'Shared games will appear here'}
            body={
              noDiscoveryServersSelected
                ? 'Every synced Discord server is currently hidden from discovery, so the app has no mutual-server users to compare against.'
                : isSignedIn
                  ? 'Add games to your library and keep at least one Discord server enabled so Game Is Up can find people with overlapping libraries.'
                  : 'This section shows games that the seeded demo viewer and other visible users both have in their playlists.'
            }
            chips={
              noDiscoveryServersSelected
                ? undefined
                : isSignedIn
                  ? ['Library drives overlap', 'Discovery servers filter visibility', 'Friends stay visible too']
                  : ['Game-first overlap', 'People per game', 'Demo data seeded']
            }
          />
        )}
      </DiscoverySection>

      <DiscoverySection
        title="Other visible games"
        description="Browse games from people Game Is Up can currently find through your selected servers and friends list, even when those games are not in your own library yet."
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
                isAddingToLibrary={addingLibraryGameId === game.id}
                pendingFriendId={friendPendingId}
                onToggleFriend={onToggleFriend}
                onAddToLibrary={onAddGameToLibrary}
                compact
              />
            ))}
          </Box>
        ) : (
          <EmptyStateCard
            title={isSignedIn ? 'No extra visible games yet' : 'No extra visible games yet'}
            body={
              noDiscoveryServersSelected
                ? 'Enable at least one synced Discord server to browse games from mutual-server users again.'
                : isSignedIn
                  ? overlapGames.length > 0
                    ? 'Everything currently visible is already shown above because it also matches your library.'
                    : 'No visible friends or mutual-server users have games in their playlists yet.'
                  : overlapGames.length > 0
                    ? 'All currently visible titles are already covered in the shared games section above.'
                    : 'Once the API responds, this section shows every visible game that is not already shared above.'
            }
            chips={
              noDiscoveryServersSelected
                ? ['Discord server filters', 'Mutual users hidden', 'Turn one back on']
                : overlapGames.length > 0
                  ? ['Overlap shown above', 'Only new titles here', 'No duplicates']
                  : ['Manual discovery', 'Find new friends by game', 'People per title']
            }
          />
        )}
      </DiscoverySection>

      <DiscoverySection
        title="Members"
        description="See the people Game Is Up can currently find through your selected servers and your in-app friends list."
        helperText="People appear here when they are on one of your selected servers and already use Game Is Up, or when you added them as a friend in the app."
      >
        {discoveryPeople.length > 0 ? (
          <Stack spacing={2}>
            {discoveryPeople.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                canManage={isSignedIn}
                canAddToLibrary={isSignedIn}
                libraryGameIds={libraryGameIds}
                addingLibraryGameId={addingLibraryGameId}
                isPending={friendPendingId === person.id}
                onToggleFriend={onToggleFriend}
                onAddToLibrary={onAddGameToLibrary}
              />
            ))}
          </Stack>
        ) : (
          <EmptyStateCard
            title={isSignedIn ? 'No people visible yet' : 'People will appear here'}
            body={
              noDiscoveryServersSelected
                ? 'All synced Discord servers are hidden, so mutual-server people are excluded from browsing right now.'
                : isSignedIn
                  ? 'No visible discovery-server users or in-app friends are available yet.'
                  : 'This section shows the seeded people-first view, including visible users from discovery servers and friends.'
            }
            chips={
              noDiscoveryServersSelected
                ? ['Server filters applied', 'No mutual users visible', 'Friends remain separate']
                : ['Discovery-server people', 'Friends stay visible', 'Add friends before game overlap']
            }
          />
        )}
      </DiscoverySection>
    </Stack>
  )
}

export function DiscoveryView() {
  const { discoveryViewProps } = useDashboardContext()

  return <DiscoveryViewContent {...discoveryViewProps} />
}