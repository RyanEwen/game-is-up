import { Box, Card, Chip, Stack, Typography } from '@mui/joy'
import type { PlayIntentPreview } from '@game-is-up/shared'
import { formatNotifyScopeLabel } from './dashboardUtils'

export function PlayIntentCard({ intent }: { intent: PlayIntentPreview }) {
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
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          {intent.games.map((game) => (
            <Chip key={game.id} color="success" variant="soft">
              {game.title}
            </Chip>
          ))}
        </Stack>
      )}
    </Card>
  )
}