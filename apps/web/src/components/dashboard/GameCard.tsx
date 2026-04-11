import { Box, Card, Chip, Sheet, Stack, Typography } from '@mui/joy'
import type { DiscoveryGame } from '@game-is-up/shared'
import { AvailabilityChip } from './AvailabilityChip'
import { FriendActionPopover } from './FriendActionPopover'
import { GameActionPopover } from './GameActionPopover'
import { formatLibraryIntentLabel } from './dashboardUtils'
import type { DashboardLibraryQuickAddGame, FriendTarget } from './types'

export function GameCard({
  game,
  canManage,
  canAddToLibrary,
  isInLibrary,
  isAddingToLibrary,
  pendingFriendId,
  onToggleFriend,
  onAddToLibrary,
  compact = false
}: {
  game: DiscoveryGame;
  canManage: boolean;
  canAddToLibrary: boolean;
  isInLibrary: boolean;
  isAddingToLibrary: boolean;
  pendingFriendId: string | null;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
  onAddToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
  compact?: boolean;
}) {
  const visiblePlatformLabels = compact ? game.platformLabels.slice(0, 3) : game.platformLabels
  const hiddenPlatformCount = game.platformLabels.length - visiblePlatformLabels.length
  const visiblePlayers = compact ? game.players.slice(0, 3) : game.players
  const hiddenPlayerCount = game.players.length - visiblePlayers.length
  const showCompactSignInHint = compact && !canManage && visiblePlayers.length > 0

  return (
    <Card
      variant="outlined"
      sx={{
        p: compact ? 2 : 3,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        backgroundColor: 'rgba(13, 18, 30, 0.82)',
        height: '100%'
      }}
    >
      <Stack spacing={compact ? 1.5 : 2} sx={{ height: '100%' }}>
        <Box
          sx={{
            width: '100%',
            height: compact ? 196 : { xs: 160, md: 160 },
            borderRadius: 'md',
            overflow: 'hidden',
            backgroundColor: 'rgba(255,255,255,0.06)',
            flexShrink: 0
          }}
        >
          {game.coverUrl ? (
            <Box component="img" src={game.coverUrl} alt={game.title} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Stack sx={{ width: '100%', height: '100%', p: 2 }} justifyContent="center" alignItems="center">
              <Typography level="title-sm" sx={{ textAlign: 'center', color: 'neutral.300' }}>
                {game.title}
              </Typography>
            </Stack>
          )}
        </Box>
        <Stack spacing={1.25} sx={{ flex: 1 }}>
          <GameActionPopover
            game={{
              gameId: game.id,
              title: game.title,
              coverUrl: game.coverUrl,
              platformLabels: game.platformLabels
            }}
            canAddToLibrary={canAddToLibrary}
            isInLibrary={isInLibrary}
            isAddingToLibrary={isAddingToLibrary}
            supportingText={`${game.playerCount} player${game.playerCount === 1 ? '' : 's'} in your network`}
            detailLines={[
              game.sharedWithViewer ? 'This already overlaps with your library.' : 'This title is visible through your network, even if it is not in your library yet.'
            ]}
            large={!compact}
            onAddToLibrary={onAddToLibrary}
          />
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} alignItems="center">
            <Chip color="primary" variant="outlined" size={compact ? 'sm' : 'md'}>
              {game.playerCount} player{game.playerCount === 1 ? '' : 's'}
            </Chip>
            {isInLibrary ? (
              <Chip color="success" variant="soft" size={compact ? 'sm' : 'md'}>
                Also in your library
              </Chip>
            ) : null}
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {visiblePlatformLabels.map((platform) => (
              <Chip key={platform} size="sm" variant="outlined" color="neutral">
                {platform}
              </Chip>
            ))}
            {hiddenPlatformCount > 0 ? (
              <Chip size="sm" variant="outlined" color="neutral">
                +{hiddenPlatformCount} more
              </Chip>
            ) : null}
          </Stack>
        </Stack>

        <Stack spacing={1.25} sx={{ mt: 'auto' }}>
          {visiblePlayers.map((player) => (
            <Sheet
              key={player.id}
              variant="soft"
              sx={{
                p: compact ? 1.25 : 1.5,
                borderRadius: 'md'
              }}
            >
              <Stack
                direction={compact ? 'column' : { xs: 'column', md: 'row' }}
                spacing={1.25}
                justifyContent="space-between"
                alignItems={compact ? 'stretch' : { xs: 'stretch', md: 'center' }}
              >
                <Stack spacing={0.75} sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} alignItems="center">
                    <FriendActionPopover
                      target={player}
                      handle={player.handle}
                      canManage={canManage}
                      isPending={pendingFriendId === player.id}
                      supportingText={player.platformLabels.join(', ')}
                      detailLines={[
                        player.contactHint,
                        player.mutualServers.length > 0 ? `Mutual servers: ${player.mutualServers.join(', ')}` : '',
                        player.availability && player.availabilitySource === 'game-specific' ? `Availability: ${player.availability}` : ''
                      ]}
                      onToggleFriend={onToggleFriend}
                    />
                    <Chip size="sm" color={player.intent === 'playing-now' ? 'success' : 'primary'}>
                      {formatLibraryIntentLabel(player.intent)}
                    </Chip>
                  </Stack>
                  <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                    {player.platformLabels.join(', ')}
                  </Typography>
                  {player.availability && player.availabilitySource === 'game-specific' ? (
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                      <AvailabilityChip availability={player.availability} availabilitySource={player.availabilitySource} showInherited={false} />
                    </Stack>
                  ) : null}
                  {!compact && player.mutualServers.length > 0 ? (
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                      {player.mutualServers.map((serverName) => (
                        <Chip key={serverName} size="sm" variant="soft" color="warning">
                          {serverName}
                        </Chip>
                      ))}
                    </Stack>
                  ) : null}
                </Stack>
              </Stack>
            </Sheet>
          ))}
          {hiddenPlayerCount > 0 ? (
            <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
              +{hiddenPlayerCount} more in your network
            </Typography>
          ) : null}
          {showCompactSignInHint ? (
            <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
              Open a name to manage friends, and sign in to enable those actions.
            </Typography>
          ) : null}
        </Stack>
      </Stack>
    </Card>
  )
}