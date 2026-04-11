import { Box, Card, Chip, Stack, Typography } from '@mui/joy'
import type { PlayIntentPreview } from '@game-is-up/shared'
import { formatNotifyScopeLabel } from './dashboardUtils'
import { GameActionPopover } from './GameActionPopover'
import type { DashboardLibraryQuickAddGame } from './types'

export function PlayIntentCard({
  intent,
  canAddToLibrary,
  libraryGameIds,
  addingLibraryGameId,
  onAddToLibrary
}: {
  intent: PlayIntentPreview;
  canAddToLibrary: boolean;
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  onAddToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
}) {
  const isLibraryWide = intent.selectionMode === 'library'

  return (
    <Card
      variant="outlined"
      sx={{
        p: 3,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        backgroundColor: 'rgba(13, 18, 30, 0.82)'
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Box>
          <Typography level="title-lg">{intent.title}</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
            {intent.availabilityWindow.label}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Chip color="primary" variant="soft">
            {isLibraryWide ? 'Any game in library' : 'Selected games'}
          </Chip>
          <Chip color="warning" variant="outlined">
            {formatNotifyScopeLabel(intent.notifyScope)}
          </Chip>
        </Stack>
      </Stack>

      <Typography level="body-md" sx={{ mb: 2, color: 'neutral.200' }}>
        {intent.note}
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
        {intent.platforms.map((platform) => (
          <Chip key={platform} variant="outlined" color="neutral">
            {platform}
          </Chip>
        ))}
      </Stack>

      {isLibraryWide ? (
        <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
          Recipient matching will compare this play intent against the sender&apos;s active library and the recipient&apos;s overlap instead of a single chosen title.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {intent.games.map((game) => (
            <GameActionPopover
              key={game.id}
              game={{
                gameId: game.id,
                title: game.title,
                coverUrl: null,
                platformLabels: [game.platform]
              }}
              canAddToLibrary={canAddToLibrary}
              isInLibrary={libraryGameIds.has(game.id)}
              isAddingToLibrary={addingLibraryGameId === game.id}
              supportingText={`Included in this active play call on ${game.platform}.`}
              detailLines={[
                'Open this title to add it to your library without leaving the play feed.'
              ]}
              trigger="chip"
              onAddToLibrary={onAddToLibrary}
            />
          ))}
        </Stack>
      )}
    </Card>
  )
}