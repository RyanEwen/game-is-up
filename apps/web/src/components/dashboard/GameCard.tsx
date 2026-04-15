import { Box, Button, Card, Chip, Sheet, Skeleton, Stack, Typography } from '@mui/joy'
import type { DiscoveryGame, DiscoveryGamePlayer } from '@game-is-up/shared'
import { DashboardDeferredImage } from './DashboardDeferredImage'
import { FriendActionPopover } from './FriendActionPopover'
import { GameActionPopover } from './GameActionPopover'
import { formatLibraryIntentLabel } from './dashboardUtils'
import type { DashboardLibraryQuickAddGame, FriendTarget } from './types'

const compactActionLabelSx = {
  display: 'inline',
  '@container (max-width: 280px)': {
    display: 'none'
  }
} as const

const compactActionSymbolSx = {
  display: 'none',
  '@container (max-width: 280px)': {
    display: 'inline'
  }
} as const

export function GameCard({
  game,
  canManage,
  canAddToLibrary,
  isInLibrary,
  libraryEntryId,
  isAddingToLibrary,
  isRemovingFromLibrary,
  pendingFriendId,
  onToggleFriend,
  onAddToLibrary,
  onRemoveFromLibrary,
  compact = false
}: {
  game: DiscoveryGame;
  canManage: boolean;
  canAddToLibrary: boolean;
  isInLibrary: boolean;
  libraryEntryId: string | null;
  isAddingToLibrary: boolean;
  isRemovingFromLibrary: boolean;
  pendingFriendId: string | null;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
  onAddToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
  onRemoveFromLibrary: (entryId: string) => Promise<void>;
  compact?: boolean;
}) {
  const libraryQuickAddGame = {
    gameId: game.id,
    title: game.title,
    coverUrl: game.coverUrl,
    platformLabels: game.platformLabels
  }
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
        height: '100%',
        contentVisibility: 'auto',
        containIntrinsicSize: compact ? '560px' : '760px'
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
            <DashboardDeferredImage src={game.coverUrl} alt={game.title} />
          ) : (
            <Stack sx={{ width: '100%', height: '100%', p: 2 }} justifyContent="center" alignItems="center">
              <Typography level="title-sm" sx={{ textAlign: 'center', color: 'neutral.300' }}>
                {game.title}
              </Typography>
            </Stack>
          )}
        </Box>
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} sx={{ minWidth: 0, width: '100%', containerType: 'inline-size' }} alignItems="flex-start">
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <GameActionPopover
                game={libraryQuickAddGame}
                canAddToLibrary={canAddToLibrary}
                isInLibrary={isInLibrary}
                isAddingToLibrary={isAddingToLibrary}
                supportingText={`${game.playerCount} player${game.playerCount === 1 ? '' : 's'}`}
                detailLines={[
                  game.sharedWithViewer ? 'This game is already in your library.' : 'This game is not in your library yet.'
                ]}
                large={!compact}
                onAddToLibrary={onAddToLibrary}
              />
            </Box>
            {isInLibrary ? (
              <Button
                size={compact ? 'sm' : 'md'}
                variant="soft"
                color="neutral"
                disabled={!libraryEntryId || isRemovingFromLibrary}
                onClick={() => {
                  if (libraryEntryId) {
                    void onRemoveFromLibrary(libraryEntryId)
                  }
                }}
                sx={{
                  ml: 'auto',
                  flexShrink: 0,
                  borderRadius: 'xl',
                  minHeight: compact ? '1.75rem' : '2rem',
                  minWidth: { xs: '1.75rem', sm: 'auto' },
                  px: { xs: 0.625, sm: 1.25 },
                  whiteSpace: 'nowrap',
                  fontSize: 'xs',
                  fontWeight: 'md',
                  lineHeight: 1
                }}
              >
                {isRemovingFromLibrary ? (
                  <>
                    <Box component="span" sx={compactActionLabelSx}>Removing...</Box>
                    <Box component="span" sx={compactActionSymbolSx}>...</Box>
                  </>
                ) : (
                  <>
                    <Box component="span" sx={compactActionLabelSx}>Remove from library</Box>
                    <Box component="span" sx={compactActionSymbolSx}>Remove</Box>
                  </>
                )}
              </Button>
            ) : (
              <Button
                size={compact ? 'sm' : 'md'}
                variant="soft"
                color="success"
                disabled={!canAddToLibrary || isAddingToLibrary}
                onClick={() => void onAddToLibrary(libraryQuickAddGame)}
                sx={{
                  ml: 'auto',
                  flexShrink: 0,
                  borderRadius: 'xl',
                  minHeight: compact ? '1.75rem' : '2rem',
                  minWidth: { xs: '1.75rem', sm: 'auto' },
                  px: { xs: 0.625, sm: 1.25 },
                  whiteSpace: 'nowrap',
                  fontSize: 'xs',
                  fontWeight: 'md',
                  lineHeight: 1
                }}
              >
                {!canAddToLibrary ? (
                  <>
                    <Box component="span" sx={compactActionLabelSx}>Sign in to add</Box>
                    <Box component="span" sx={compactActionSymbolSx}>?</Box>
                  </>
                ) : isAddingToLibrary ? (
                  <>
                    <Box component="span" sx={compactActionLabelSx}>Adding...</Box>
                    <Box component="span" sx={compactActionSymbolSx}>...</Box>
                  </>
                ) : (
                  <>
                    <Box component="span" sx={compactActionLabelSx}>Add to library</Box>
                    <Box component="span" sx={compactActionSymbolSx}>Add</Box>
                  </>
                )}
              </Button>
            )}
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', width: '100%' }} alignItems="center">
            <Chip color="primary" variant="outlined" size={compact ? 'sm' : 'md'}>
              {game.playerCount} player{game.playerCount === 1 ? '' : 's'}
            </Chip>
            {visiblePlatformLabels.map((platform: string) => (
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

        <Stack spacing={1.25}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: compact
                ? 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))'
                : 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
              gap: 1.25
            }}
          >
            {visiblePlayers.map((player: DiscoveryGamePlayer) => (
              <Sheet
                key={player.id}
                variant="soft"
                sx={{
                  p: compact ? 1.25 : 1.5,
                  borderRadius: 'md',
                  height: '100%'
                }}
              >
                <Stack
                  direction={compact ? 'column' : { xs: 'column', md: 'row' }}
                  spacing={1.25}
                  justifyContent="space-between"
                  alignItems={compact ? 'stretch' : { xs: 'stretch', md: 'center' }}
                >
                  <Stack spacing={0.75} sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ minWidth: 0, containerType: 'inline-size' }} alignItems="center">
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <FriendActionPopover
                          target={player}
                          handle={player.handle}
                          canManage={canManage}
                          isPending={pendingFriendId === player.id}
                          detailLines={[
                            player.contactHint,
                            player.mutualServers.length > 0 ? `Mutual servers: ${player.mutualServers.join(', ')}` : 'Visible to you through your friends list or network.',
                            `Matching game: ${game.title}`,
                            player.availability && player.availabilitySource === 'game-specific' ? `Availability: ${player.availability}` : ''
                          ]}
                          large={!compact}
                          onToggleFriend={onToggleFriend}
                        />
                      </Box>
                      {(!canManage || pendingFriendId === player.id || player.friendEligible) ? (
                        <Button
                          size="sm"
                          variant="soft"
                          color={player.friendEligible ? 'success' : 'neutral'}
                          disabled={!canManage || pendingFriendId === player.id}
                          onClick={() => void onToggleFriend(player)}
                          sx={{
                            ml: 'auto',
                            flexShrink: 0,
                            borderRadius: 'xl',
                            minHeight: '1.5rem',
                            minWidth: { xs: '1.5rem', sm: 'auto' },
                            px: { xs: 0.625, sm: 1 },
                            fontSize: 'xs',
                            lineHeight: 1
                          }}
                        >
                          {!canManage ? (
                            <>
                              <Box component="span" sx={compactActionLabelSx}>Sign in</Box>
                              <Box component="span" sx={compactActionSymbolSx}>?</Box>
                            </>
                          ) : pendingFriendId === player.id ? (
                            <>
                              <Box component="span" sx={compactActionLabelSx}>Saving...</Box>
                              <Box component="span" sx={compactActionSymbolSx}>...</Box>
                            </>
                          ) : (
                            <>
                              <Box component="span" sx={compactActionLabelSx}>Add friend</Box>
                              <Box component="span" sx={compactActionSymbolSx}>Add</Box>
                            </>
                          )}
                        </Button>
                      ) : null}
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', width: '100%' }} alignItems="center">
                      <Chip size="sm" color={player.intent === 'playing-now' ? 'success' : 'primary'}>
                        {formatLibraryIntentLabel(player.intent)}
                      </Chip>
                      {player.platformLabels.map((platform: string) => (
                        <Chip key={platform} size="sm" variant="outlined" color="neutral">
                          {platform}
                        </Chip>
                      ))}
                    </Stack>
                    {player.availability && player.availabilitySource === 'game-specific' ? (
                      <Chip size="sm" variant="soft" color="neutral" sx={{ alignSelf: 'flex-start' }}>
                        Plays: {player.availability}
                      </Chip>
                    ) : null}
                    {!compact && player.mutualServers.length > 0 ? (
                      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                        {player.mutualServers.map((serverName: string) => (
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
          </Box>
          {hiddenPlayerCount > 0 ? (
            <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
              +{hiddenPlayerCount} more players
            </Typography>
          ) : null}
          {showCompactSignInHint ? (
            <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
              Sign in to enable friend actions from the player cards.
            </Typography>
          ) : null}
        </Stack>
      </Stack>
    </Card>
  )
}

export function GameCardSkeleton({ compact = false }: { compact?: boolean }) {
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
        <Skeleton
          variant="rectangular"
          sx={{ width: '100%', height: compact ? 196 : 160, borderRadius: 'md', flexShrink: 0 }}
        />
        <Skeleton variant="text" level="title-md" width="70%" />
        <Skeleton variant="text" level="body-sm" width="45%" />
      </Stack>
    </Card>
  )
}