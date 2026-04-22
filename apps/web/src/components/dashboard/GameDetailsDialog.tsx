import EastRoundedIcon from '@mui/icons-material/EastRounded'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
import WestRoundedIcon from '@mui/icons-material/WestRounded'
import { useEffect, useMemo, useState } from 'react'
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
  const coverUrl = target?.coverUrl ?? gameDetails?.coverUrl ?? gameDetails?.heroImageUrl ?? null
  const gameplayChip = buildGameplayLabel(gameDetails)
  const imageMedia = useMemo(() => (gameDetails?.media ?? []).filter((mediaItem) => mediaItem.kind === 'image'), [gameDetails?.media])
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null)
  const activeImage = activeImageIndex == null ? null : (imageMedia[activeImageIndex] ?? null)

  useEffect(() => {
    if (!open) {
      setActiveImageIndex(null)
    }
  }, [open])

  useEffect(() => {
    if (activeImageIndex == null) {
      return
    }

    if (!activeImage) {
      setActiveImageIndex(imageMedia.length > 0 ? 0 : null)
    }
  }, [activeImage, activeImageIndex, imageMedia.length])

  useEffect(() => {
    if (activeImageIndex == null || imageMedia.length < 2 || typeof window === 'undefined') {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setActiveImageIndex((current) => current == null ? null : (current - 1 + imageMedia.length) % imageMedia.length)
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setActiveImageIndex((current) => current == null ? null : (current + 1) % imageMedia.length)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeImageIndex, imageMedia.length])

  function openImageViewer(index: number) {
    setActiveImageIndex(index)
  }

  function showPreviousImage() {
    setActiveImageIndex((current) => current == null ? null : (current - 1 + imageMedia.length) % imageMedia.length)
  }

  function showNextImage() {
    setActiveImageIndex((current) => current == null ? null : (current + 1) % imageMedia.length)
  }

  return (
    <>
      <DashboardModal open={open} onClose={onClose} width="min(96vw, 1080px)">
        <DialogTitle sx={{ pr: 6 }}>{title}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto', pr: 0.5 }}>
          {coverUrl ? (
            <Box
              sx={{
                width: '100%',
                height: 'clamp(210px, 28vw, 320px)',
                p: { xs: 1, sm: 1.5 },
                flexShrink: 0,
                overflow: 'hidden',
                borderRadius: 'lg',
                background: 'radial-gradient(circle at top, rgba(47, 82, 122, 0.46), rgba(13, 19, 31, 0.96) 72%)',
                border: '1px solid #2a3647'
              }}
            >
              <Box
                sx={{
                  height: '100%',
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: 'md',
                  background: 'linear-gradient(180deg, rgba(18, 28, 44, 0.88), rgba(10, 15, 24, 0.96))',
                  boxShadow: 'inset 0 0 0 1px rgba(103, 122, 148, 0.2)',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: `url(${coverUrl})`,
                    backgroundPosition: 'center',
                    backgroundSize: 'cover',
                    backgroundRepeat: 'no-repeat',
                    filter: 'blur(24px) saturate(1.05)',
                    transform: 'scale(1.08)',
                    opacity: 0.58
                  }
                }}
              >
                <Box sx={{ position: 'relative', zIndex: 1, height: '100%' }}>
                  <DashboardDeferredImage src={coverUrl} alt={title} eager objectFit="contain" objectPosition="center top" />
                </Box>
              </Box>
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
                  {gameDetails.media.map((mediaItem, index) => {
                    const imageIndex = mediaItem.kind === 'image'
                      ? imageMedia.findIndex((imageItem) => imageItem.url === mediaItem.url)
                      : -1

                    return (
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
                            component="button"
                            type="button"
                            onClick={() => openImageViewer(imageIndex)}
                            sx={{
                              display: 'block',
                              width: '100%',
                              p: 0,
                              border: 'none',
                              borderRadius: 'md',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              backgroundColor: '#0d1420'
                            }}
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
                    )
                  })}
                </Box>
              </Stack>
            ) : null}
          </Stack>
        </DialogContent>
      </DashboardModal>

      <DashboardModal open={activeImage != null} onClose={() => setActiveImageIndex(null)} width="min(96vw, 1320px)">
        <DialogTitle sx={{ pr: 6 }}>{activeImage?.label ?? title}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 0, overflow: 'auto' }}>
          {activeImage ? (
            <>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="soft"
                    color="neutral"
                    disabled={imageMedia.length < 2}
                    startDecorator={<WestRoundedIcon fontSize="small" />}
                    onClick={showPreviousImage}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="soft"
                    color="neutral"
                    disabled={imageMedia.length < 2}
                    endDecorator={<EastRoundedIcon fontSize="small" />}
                    onClick={showNextImage}
                  >
                    Next
                  </Button>
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                    {activeImageIndex == null ? 0 : activeImageIndex + 1} / {imageMedia.length}
                  </Typography>
                  <Button
                    component="a"
                    href={activeImage.url}
                    target="_blank"
                    rel="noreferrer"
                    variant="soft"
                    color="primary"
                    endDecorator={<OpenInNewRoundedIcon fontSize="small" />}
                  >
                    Open full size
                  </Button>
                </Stack>
              </Stack>

              <Box
                sx={{
                  height: 'min(72dvh, 760px)',
                  p: { xs: 1, sm: 2 },
                  borderRadius: 'lg',
                  border: '1px solid #2a3647',
                  background: 'radial-gradient(circle at top, rgba(47, 82, 122, 0.42), rgba(10, 15, 24, 0.98) 70%)'
                }}
              >
                <Box
                  sx={{
                    height: '100%',
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: 'md',
                    background: 'linear-gradient(180deg, rgba(18, 28, 44, 0.88), rgba(10, 15, 24, 0.98))',
                    boxShadow: 'inset 0 0 0 1px rgba(103, 122, 148, 0.2)',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      inset: 0,
                      backgroundImage: `url(${activeImage.url})`,
                      backgroundPosition: 'center',
                      backgroundSize: 'cover',
                      backgroundRepeat: 'no-repeat',
                      filter: 'blur(26px) saturate(1.05)',
                      transform: 'scale(1.08)',
                      opacity: 0.6
                    }
                  }}
                >
                  <Box sx={{ position: 'relative', zIndex: 1, height: '100%' }}>
                    <DashboardDeferredImage
                      src={activeImage.url}
                      alt={activeImage.label ?? title}
                      eager
                      objectFit="contain"
                    />
                  </Box>
                </Box>
              </Box>
            </>
          ) : null}
        </DialogContent>
      </DashboardModal>
    </>
  )
}