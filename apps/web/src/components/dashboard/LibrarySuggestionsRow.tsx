import { Box, Card, Stack, Typography } from '@mui/joy'
import type { LibrarySuggestedGame } from '@game-is-up/shared'
import { GameActionPopover } from './GameActionPopover'
import type { DashboardLibraryQuickAddGame } from './types'

function formatObservedLabel(lastObservedAt: string): string {
  const observedDate = new Date(lastObservedAt)

  return `Seen on Discord ${observedDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
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
          <Typography level="title-md">Seen you playing on Discord</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
            These titles were observed in servers where the bot could see your activity. Add them quickly if they belong in your library.
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
          {suggestedGames.map((game) => (
            <GameActionPopover
              key={game.gameId}
              trigger="chip"
              game={{
                gameId: game.gameId,
                title: game.title,
                coverUrl: game.coverUrl,
                platformLabels: game.platformLabels
              }}
              canAddToLibrary
              isInLibrary={libraryGameIds.has(game.gameId)}
              isAddingToLibrary={addingLibraryGameId === game.gameId}
              supportingText={formatObservedLabel(game.lastObservedAt)}
              detailLines={game.sourceServerName ? [`Last noticed in ${game.sourceServerName}.`] : []}
              onAddToLibrary={onAddToLibrary}
            />
          ))}
        </Stack>
      </Stack>
    </Card>
  )
}