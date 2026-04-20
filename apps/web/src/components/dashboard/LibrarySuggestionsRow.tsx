import { Box, Button, Card, Stack, Typography } from '@mui/joy'
import type { LibrarySuggestedGame } from '@game-is-up/shared'
import { formatWeekdayMonthDay } from '../../lib/dateTime'
import type { DashboardLibraryQuickAddGame } from './types'

function formatObservedLabel(lastObservedAt: string): string {
  return `Seen on Discord ${formatWeekdayMonthDay(lastObservedAt)}`
}

export function LibrarySuggestionsRow({
  suggestedGames,
  libraryGameIds,
  addingLibraryGameId,
  onAddToLibrary
}: {
  suggestedGames: LibrarySuggestedGame[];
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  onAddToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
}) {
  if (suggestedGames.length === 0) {
    return null
  }

  return (
    <Card variant="soft" sx={{ p: 2.25, overflow: 'hidden' }}>
      <Stack spacing={1.25}>
        <Box>
          <Typography level="title-md">Suggestions based on your activity</Typography>
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
              backgroundColor: '#526176',
              borderRadius: 999
            }
          }}
        >
          {suggestedGames.map((game) => (
            <Button
              key={game.gameId}
              variant={libraryGameIds.has(game.gameId) ? 'soft' : 'solid'}
              color={libraryGameIds.has(game.gameId) ? 'neutral' : 'primary'}
              size="sm"
              disabled={libraryGameIds.has(game.gameId) || addingLibraryGameId === game.gameId}
              onClick={() => void onAddToLibrary({
                gameId: game.gameId,
                title: game.title,
                coverUrl: game.coverUrl,
                platformLabels: game.platformLabels
              })}
              sx={{
                justifyContent: 'flex-start',
                alignSelf: 'flex-start',
                cursor: 'pointer',
                boxShadow: 'none',
                transition: 'background-color 180ms ease, color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
                '&:hover': {
                  backgroundColor: libraryGameIds.has(game.gameId) ? undefined : 'primary.400',
                  color: libraryGameIds.has(game.gameId) ? undefined : 'common.white',
                  transform: libraryGameIds.has(game.gameId) ? undefined : 'translateY(-1px)',
                  boxShadow: libraryGameIds.has(game.gameId) ? undefined : '0 0 0 1px rgba(141, 255, 216, 0.22)'
                },
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.400',
                  outlineOffset: '3px'
                }
              }}
              title={libraryGameIds.has(game.gameId)
                ? `${game.title} is already in your library.`
                : game.sourceServerName
                  ? `${formatObservedLabel(game.lastObservedAt)}. Last noticed in ${game.sourceServerName}.`
                  : formatObservedLabel(game.lastObservedAt)}
            >
              {game.title}
            </Button>
          ))}
        </Stack>
      </Stack>
    </Card>
  )
}