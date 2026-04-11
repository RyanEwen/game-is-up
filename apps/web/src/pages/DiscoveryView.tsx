import { Box, Card, Stack, Typography } from '@mui/joy'
import type { DiscoveryGame, DiscoveryPerson } from '@game-is-up/shared'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { GameCard } from '../components/dashboard/GameCard'
import { PersonCard } from '../components/dashboard/PersonCard'
import { discoveryGameGridSx } from '../components/dashboard/dashboardUtils'
import { useDashboardContext } from '../contexts/useDashboardContext'
import type { FriendTarget } from '../components/dashboard/types'

function DiscoverySection({
  title,
  description,
  children,
  helperText
}: {
  title: string;
  description: string;
  helperText?: string;
  children: React.ReactNode;
}) {
  return (
    <Stack spacing={2} sx={{ mt: title === 'Matches in your network' ? 0 : 3 }}>
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
  friendPendingId,
  onToggleFriend
}: {
  error: string | null;
  overlapGames: DiscoveryGame[];
  browseGames: DiscoveryGame[];
  discoveryPeople: DiscoveryPerson[];
  noDiscoveryServersSelected: boolean;
  isSignedIn: boolean;
  friendPendingId: string | null;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
}) {
  return (
    <Stack spacing={0}>
      <DiscoverySection
        title="Matches in your network"
        description="This is the overlap view now: games first, then the people in your network who have each game in their playlists."
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
                pendingFriendId={friendPendingId}
                onToggleFriend={onToggleFriend}
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
                  ? 'Add games to your library and keep at least one Discord server enabled for discovery so the app can find overlap with your network.'
                  : 'This section shows games that the seeded demo viewer and other visible users both have in their playlists.'
            }
            chips={
              noDiscoveryServersSelected
                ? ['Enable a Discord server', 'Mutual users are hidden', 'Discovery is filtered']
                : isSignedIn
                  ? ['Library drives overlap', 'Discovery servers filter visibility', 'Friends stay visible too']
                  : ['Game-first overlap', 'People per game', 'Demo data seeded']
            }
          />
        )}
      </DiscoverySection>

      <DiscoverySection
        title="Others in your network"
        description="Browse every game that your visible network has added, even when it is not in your own library yet."
      >
        {browseGames.length > 0 ? (
          <Box sx={discoveryGameGridSx}>
            {browseGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                canManage={isSignedIn}
                pendingFriendId={friendPendingId}
                onToggleFriend={onToggleFriend}
                compact
              />
            ))}
          </Box>
        ) : (
          <EmptyStateCard
            title={isSignedIn ? 'No extra network games yet' : 'No extra network games yet'}
            body={
              noDiscoveryServersSelected
                ? 'Enable at least one synced Discord server to browse games from mutual-server users again.'
                : isSignedIn
                  ? overlapGames.length > 0
                    ? 'Everything currently visible from your network is already shown above because it also matches your library.'
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
        description="See each visible person and the full playlist they have shared with your current discovery network."
        helperText="Visibility here is limited to people who also use Game Is Up, either through one of your selected discovery servers or your in-app friends list."
      >
        {discoveryPeople.length > 0 ? (
          <Stack spacing={2}>
            {discoveryPeople.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                canManage={isSignedIn}
                isPending={friendPendingId === person.id}
                onToggleFriend={onToggleFriend}
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