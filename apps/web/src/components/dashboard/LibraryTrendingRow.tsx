import { Box, Button, Card, Stack, Typography } from '@mui/joy'
import type { LibraryTrendingGame } from '@game-is-up/shared'
import type { DashboardLibraryQuickAddGame } from './types'

export function LibraryTrendingRow({
  trendingGames,
  addingLibraryGameId,
  onAddToLibrary
}: {
  trendingGames: LibraryTrendingGame[];
  addingLibraryGameId: string | null;
  onAddToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
}) {
  if (trendingGames.length === 0) {
    return null
  }

  return (
    <Card variant="soft" sx={{ p: 2.25, overflow: 'hidden' }}>
      <Stack spacing={1.25}>
        <Box>
          <Typography level="title-md">Trending in your network</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
            Based on games recently seen played by people you know.
          </Typography>
        </Box>
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
              backgroundColor: 'rgba(255,255,255,0.16)',
              borderRadius: 999
            }
          }}
        >
          {trendingGames.map((game) => (
            <Button
              key={game.gameId}
              variant="soft"
              color={game.alreadyInLibrary ? 'neutral' : 'warning'}
              size="sm"
              disabled={game.alreadyInLibrary || addingLibraryGameId === game.gameId}
              onClick={() => void onAddToLibrary({
                gameId: game.gameId,
                title: game.title,
                coverUrl: game.coverUrl,
                platformLabels: game.platformLabels
              })}
              title={game.alreadyInLibrary
                ? `${game.title} is already in your library.`
                : `Seen played by ${game.recentPlayerCount} ${game.recentPlayerCount === 1 ? 'person' : 'people'} in your network recently.`}
            >
              {game.title} ({game.recentPlayerCount})
            </Button>
          ))}
        </Stack>
      </Stack>
    </Card>
  )
}
