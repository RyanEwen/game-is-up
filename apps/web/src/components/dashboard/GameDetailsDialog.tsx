import { Box, Button, Chip, DialogContent, DialogTitle, Link, Sheet, Stack, Typography } from '@mui/joy'
import type { GameDetails } from '@game-is-up/shared'
import type { DashboardGameDetailsTarget } from './types'
import { DashboardDeferredImage } from './DashboardDeferredImage'
import { DashboardModal } from './DashboardModal'

function buildGameplayLabel(gameDetails: GameDetails | null): { label: string; color: 'success' | 'warning' | 'neutral' } {
  if (!gameDetails) {
    return {
      label: 'Details loading',
      color: 'neutral'
    }
  }

  if (gameDetails.gameplay.classification === 'multiplayer') {
    return {
      label: gameDetails.gameplay.isCoOp ? 'Multiplayer and co-op' : 'Multiplayer',
      color: 'success'
    }
  }

  if (gameDetails.gameplay.classification === 'singleplayer-only') {
    return {
      label: 'Single-player only',
      color: 'warning'
    }
  }

  return {
    label: 'Gameplay unknown',
    color: 'neutral'
  }
}

export function GameDetailsDialog({
  open,
  target,
  gameDetails,
  loading,
  error,
  onClose
}: {
  open: boolean;
  target: DashboardGameDetailsTarget | null;
  gameDetails: GameDetails | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const title = gameDetails?.title ?? target?.title ?? 'Game details'
  const coverUrl = gameDetails?.heroImageUrl ?? gameDetails?.coverUrl ?? target?.coverUrl ?? null
  const gameplayChip = buildGameplayLabel(gameDetails)

  return (
    <DashboardModal open={open} onClose={onClose} width="min(96vw, 1080px)">
      <DialogTitle sx={{ pr: 6 }}>{title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto', pr: 0.5 }}>
        {coverUrl ? (
          <Box
            sx={{
              width: '100%',
              aspectRatio: '16 / 7',
              overflow: 'hidden',
              borderRadius: 'lg',
              backgroundColor: '#172033',
              border: '1px solid #2a3647'
            }}
          >
            <DashboardDeferredImage src={coverUrl} alt={title} eager />
          </Box>
        ) : null}

        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Chip color={gameplayChip.color} variant="soft">{gameplayChip.label}</Chip>
            {(gameDetails?.platformLabels ?? target?.platformLabels ?? []).map((platformLabel) => (
              <Chip key={platformLabel} color="neutral" variant="soft">{platformLabel}</Chip>
            ))}
            {gameDetails?.metacritic != null ? <Chip color="primary" variant="soft">Metacritic {gameDetails.metacritic}</Chip> : null}
            {gameDetails?.rating != null ? <Chip color="primary" variant="soft">RAWG {gameDetails.rating.toFixed(1)} / 5</Chip> : null}
            {gameDetails?.releasedAt ? <Chip color="neutral" variant="soft">Released {gameDetails.releasedAt}</Chip> : null}
          </Stack>

          {loading ? (
            <Sheet variant="soft" sx={{ p: 1.5, borderRadius: 'md', backgroundColor: '#182334' }}>
              <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                Loading richer game details and media...
              </Typography>
            </Sheet>
          ) : null}

          {error ? (
            <Sheet variant="soft" sx={{ p: 1.5, borderRadius: 'md', backgroundColor: '#2d1a24' }}>
              <Typography level="body-sm" sx={{ color: 'danger.200' }}>{error}</Typography>
            </Sheet>
          ) : null}

          {gameDetails?.shortDescription ? (
            <Typography level="body-md" sx={{ color: 'neutral.200' }}>
              {gameDetails.shortDescription}
            </Typography>
          ) : null}

          <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
            External catalog data and media may come from{' '}
            <Link href="https://rawg.io" target="_blank" rel="noreferrer">
              RAWG
            </Link>
            {' '}and Steam.
          </Typography>

          {gameDetails?.description ? (
            <Typography level="body-sm" sx={{ color: 'neutral.300', whiteSpace: 'pre-wrap' }}>
              {gameDetails.description}
            </Typography>
          ) : null}

          {gameDetails && (gameDetails.genres.length > 0 || gameDetails.tags.length > 0 || gameDetails.developers.length > 0 || gameDetails.publishers.length > 0) ? (
            <Stack spacing={1.25}>
              {gameDetails.genres.length > 0 ? (
                <Stack spacing={0.75}>
                  <Typography level="title-sm">Genres</Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    {gameDetails.genres.map((genre) => <Chip key={genre} color="neutral" variant="soft">{genre}</Chip>)}
                  </Stack>
                </Stack>
              ) : null}
              {gameDetails.tags.length > 0 ? (
                <Stack spacing={0.75}>
                  <Typography level="title-sm">Tags</Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    {gameDetails.tags.slice(0, 10).map((tag) => <Chip key={tag} color="neutral" variant="soft">{tag}</Chip>)}
                  </Stack>
                </Stack>
              ) : null}
              {gameDetails.developers.length > 0 ? (
                <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                  <strong>Developers:</strong> {gameDetails.developers.join(', ')}
                </Typography>
              ) : null}
              {gameDetails.publishers.length > 0 ? (
                <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                  <strong>Publishers:</strong> {gameDetails.publishers.join(', ')}
                </Typography>
              ) : null}
            </Stack>
          ) : null}

          {gameDetails && (gameDetails.websiteUrl || gameDetails.storeLinks.length > 0) ? (
            <Stack spacing={0.75}>
              <Typography level="title-sm">Links</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                {gameDetails.websiteUrl ? (
                  <Button component="a" href={gameDetails.websiteUrl} target="_blank" rel="noreferrer" variant="soft" color="primary">
                    Official site
                  </Button>
                ) : null}
                {gameDetails.storeLinks.map((storeLink) => (
                  <Button key={`${storeLink.label}:${storeLink.url}`} component="a" href={storeLink.url} target="_blank" rel="noreferrer" variant="soft" color="neutral">
                    {storeLink.label}
                  </Button>
                ))}
              </Stack>
            </Stack>
          ) : null}

          {gameDetails?.media.length ? (
            <Stack spacing={1}>
              <Typography level="title-sm">Media</Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                  gap: 1.25
                }}
              >
                {gameDetails.media.map((mediaItem, index) => (
                  <Sheet key={`${mediaItem.kind}:${mediaItem.url}:${index}`} variant="soft" sx={{ p: 1, borderRadius: 'md', backgroundColor: '#151e2d' }}>
                    {mediaItem.kind === 'video' ? (
                      <Box
                        component="video"
                        controls
                        poster={mediaItem.thumbnailUrl ?? undefined}
                        src={mediaItem.url}
                        sx={{ width: '100%', display: 'block', borderRadius: 'md', backgroundColor: '#0d1420' }}
                      />
                    ) : (
                      <Box
                        component={Link}
                        href={mediaItem.url}
                        target="_blank"
                        rel="noreferrer"
                        underline="none"
                        sx={{ display: 'block', borderRadius: 'md', overflow: 'hidden' }}
                      >
                        <Box sx={{ aspectRatio: '16 / 9', overflow: 'hidden', borderRadius: 'md', backgroundColor: '#0d1420' }}>
                          <DashboardDeferredImage src={mediaItem.thumbnailUrl ?? mediaItem.url} alt={mediaItem.label ?? title} rootMargin="160px 0px" />
                        </Box>
                      </Box>
                    )}
                    {mediaItem.label ? (
                      <Typography level="body-xs" sx={{ mt: 0.75, color: 'neutral.400' }}>{mediaItem.label}</Typography>
                    ) : null}
                  </Sheet>
                ))}
              </Box>
            </Stack>
          ) : null}
        </Stack>
      </DialogContent>
    </DashboardModal>
  )
}