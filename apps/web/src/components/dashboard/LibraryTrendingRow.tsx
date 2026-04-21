import { Box, Button, Card, Stack, Typography } from '@mui/joy'
import type { LibraryTrendingGame } from '@game-is-up/shared'
import type { DashboardLibraryQuickAddGame } from './types'

export function LibraryTrendingRow({
  trendingGames,
  addingLibraryGameId,
  onAddToLibrary,
  showWhenEmpty = false
}: {
  trendingGames: LibraryTrendingGame[];
  addingLibraryGameId: string | null;
  onAddToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
  showWhenEmpty?: boolean;
}) {
  if (!showWhenEmpty && trendingGames.length === 0) {
    return null
  }

  return (
    <Card variant="soft" sx={{ p: 2.25, overflow: 'hidden' }}>
      <Stack spacing={1.25}>
        <Box>
          <Typography level="title-md">Trending in your network</Typography>
          {trendingGames.length === 0 ? (
            <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
              When games start picking up across your network, they will show up here.
            </Typography>
          ) : null}
        </Box>
        {trendingGames.length > 0 ? (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              flexWrap: 'nowrap',
              overflowX: 'auto',
              pb: 0.5,
              '&::-webkit-scrollbar': {
                height: 8
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: '#526176',
                borderRadius: 999
              }
            }}
          >
            {trendingGames.map((game) => (
              <Button
                key={game.gameId}
                variant={game.alreadyInLibrary ? 'soft' : 'solid'}
                color={game.alreadyInLibrary ? 'neutral' : 'primary'}
                size="sm"
                disabled={game.alreadyInLibrary || addingLibraryGameId === game.gameId}
                onClick={() => void onAddToLibrary({
                  gameId: game.gameId,
                  title: game.title,
                  coverUrl: game.coverUrl,
                  platformLabels: game.platformLabels
                })}
                sx={{
                  flexShrink: 0,
                  minWidth: 'max-content',
                  whiteSpace: 'nowrap',
                  boxShadow: 'none',
                  transition: 'background-color 180ms ease, color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
                  '&:hover': {
                    backgroundColor: game.alreadyInLibrary ? undefined : 'primary.400',
                    color: game.alreadyInLibrary ? undefined : 'common.white',
                    transform: game.alreadyInLibrary ? undefined : 'translateY(-1px)',
                    boxShadow: game.alreadyInLibrary ? undefined : '0 0 0 1px rgba(141, 255, 216, 0.22)'
                  },
                  '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: 'primary.400',
                    outlineOffset: '3px'
                  }
                }}
                title={game.alreadyInLibrary
                  ? `${game.title} is already in your library.`
                  : `Seen played by ${game.recentPlayerCount} ${game.recentPlayerCount === 1 ? 'person' : 'people'} in your network recently.`}
              >
                {game.title} ({game.recentPlayerCount})
              </Button>
            ))}
          </Stack>
        ) : null}
      </Stack>
    </Card>
  )
}
