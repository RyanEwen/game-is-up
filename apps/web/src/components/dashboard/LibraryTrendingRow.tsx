import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Card, Stack, Typography } from '@mui/joy'
import type { LibraryTrendingGame } from '@game-is-up/shared'
import type { DashboardLibraryQuickAddGame } from './types'

const trendingTickerSpeedPxPerSecond = 28

function buildTrendingGameTitle(game: LibraryTrendingGame) {
  return game.alreadyInLibrary
    ? `${game.title} is already in your library.`
    : `Seen played by ${game.recentPlayerCount} ${game.recentPlayerCount === 1 ? 'person' : 'people'} in your network recently.`
}

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
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [isTickerPaused, setIsTickerPaused] = useState(false)
  const [loopWidth, setLoopWidth] = useState(0)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(false)

  const repeatedTrendingGames = useMemo(
    () => (trendingGames.length > 1 ? [...trendingGames, ...trendingGames] : trendingGames),
    [trendingGames]
  )

  useEffect(() => {
    const viewport = viewportRef.current
    const track = trackRef.current

    if (!viewport || !track || trendingGames.length === 0 || typeof ResizeObserver === 'undefined') {
      setShouldAutoScroll(false)
      setLoopWidth(0)
      return
    }

    const measureTicker = () => {
      const nextLoopWidth = trendingGames.length > 1 ? track.scrollWidth / 2 : track.scrollWidth
      setLoopWidth(nextLoopWidth)

      const canScroll = trendingGames.length > 1 && nextLoopWidth > viewport.clientWidth + 8
      setShouldAutoScroll(canScroll)

      if (!canScroll) {
        viewport.scrollLeft = 0
      } else if (viewport.scrollLeft >= nextLoopWidth) {
        viewport.scrollLeft %= nextLoopWidth
      }
    }

    measureTicker()

    const observer = new ResizeObserver(() => {
      measureTicker()
    })

    observer.observe(viewport)
    observer.observe(track)

    return () => {
      observer.disconnect()
    }
  }, [repeatedTrendingGames, trendingGames])

  useEffect(() => {
    const viewport = viewportRef.current

    if (!viewport || !shouldAutoScroll || isTickerPaused || loopWidth <= 0 || typeof window === 'undefined') {
      return
    }

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    if (reducedMotionQuery.matches) {
      return
    }

    let animationFrameId = 0
    let previousTimestamp = performance.now()

    const tick = (timestamp: number) => {
      const elapsedMs = timestamp - previousTimestamp
      previousTimestamp = timestamp

      viewport.scrollLeft += (elapsedMs / 1000) * trendingTickerSpeedPxPerSecond

      if (viewport.scrollLeft >= loopWidth) {
        viewport.scrollLeft -= loopWidth
      }

      animationFrameId = window.requestAnimationFrame(tick)
    }

    animationFrameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [isTickerPaused, loopWidth, shouldAutoScroll])

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
          <Box
            ref={viewportRef}
            onPointerEnter={() => setIsTickerPaused(true)}
            onPointerLeave={() => setIsTickerPaused(false)}
            onFocusCapture={() => setIsTickerPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIsTickerPaused(false)
              }
            }}
            sx={{
              overflow: 'hidden',
              maskImage: shouldAutoScroll
                ? 'linear-gradient(90deg, transparent 0, rgba(0, 0, 0, 1) 2.5rem, rgba(0, 0, 0, 1) calc(100% - 2.5rem), transparent 100%)'
                : 'none',
              WebkitMaskImage: shouldAutoScroll
                ? 'linear-gradient(90deg, transparent 0, rgba(0, 0, 0, 1) 2.5rem, rgba(0, 0, 0, 1) calc(100% - 2.5rem), transparent 100%)'
                : 'none'
            }}
          >
            <Box
              ref={trackRef}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                width: 'max-content',
                py: 0.25,
                pr: shouldAutoScroll ? 1 : 0
              }}
            >
              {repeatedTrendingGames.map((game, index) => {
                const isDuplicate = trendingGames.length > 1 && index >= trendingGames.length

                return (
                  <Button
                    key={`${game.gameId}-${isDuplicate ? 'loop' : 'base'}-${index}`}
                    variant={game.alreadyInLibrary ? 'soft' : 'plain'}
                    color={game.alreadyInLibrary ? 'neutral' : 'primary'}
                    size="sm"
                    disabled={game.alreadyInLibrary || addingLibraryGameId === game.gameId}
                    tabIndex={isDuplicate ? -1 : 0}
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
                      borderRadius: 'xl',
                      px: 1.25,
                      py: 0.5,
                      gap: 0.75,
                      boxShadow: 'none',
                      backgroundColor: game.alreadyInLibrary
                        ? 'rgba(59, 77, 102, 0.46)'
                        : 'rgba(16, 106, 84, 0.12)',
                      color: game.alreadyInLibrary ? 'neutral.500' : 'primary.100',
                      border: game.alreadyInLibrary
                        ? '1px solid rgba(80, 96, 119, 0.58)'
                        : '1px solid rgba(87, 244, 193, 0.14)',
                      transition: 'background-color 180ms ease, color 180ms ease, border-color 180ms ease',
                      '&:hover': {
                        backgroundColor: game.alreadyInLibrary ? 'rgba(59, 77, 102, 0.46)' : 'rgba(16, 106, 84, 0.22)',
                        borderColor: game.alreadyInLibrary ? 'rgba(80, 96, 119, 0.58)' : 'rgba(141, 255, 216, 0.24)',
                        color: game.alreadyInLibrary ? 'neutral.500' : 'primary.50'
                      },
                      '&.Mui-disabled': {
                        opacity: 1,
                        backgroundColor: 'rgba(59, 77, 102, 0.42)',
                        color: 'neutral.500',
                        borderColor: 'rgba(80, 96, 119, 0.54)'
                      },
                      '&:focus-visible': {
                        outline: '2px solid',
                        outlineColor: 'primary.400',
                        outlineOffset: '3px'
                      }
                    }}
                    title={buildTrendingGameTitle(game)}
                    endDecorator={(
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '1.35rem',
                          px: 0.5,
                          py: 0.125,
                          borderRadius: '999px',
                          fontSize: 'xs',
                          lineHeight: 1.2,
                          backgroundColor: game.alreadyInLibrary
                            ? 'rgba(80, 96, 119, 0.38)'
                            : 'rgba(28, 171, 132, 0.22)',
                          color: game.alreadyInLibrary ? 'neutral.400' : 'primary.100'
                        }}
                      >
                        {game.recentPlayerCount}
                      </Box>
                    )}
                  >
                    {game.title}
                  </Button>
                )
              })}
            </Box>
          </Box>
        ) : null}
      </Stack>
    </Card>
  )
}
