import { useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react'
import { Box, Button, Card, Stack, Typography } from '@mui/joy'
import type { LibraryTrendingGame } from '@game-is-up/shared'
import type { DashboardLibraryQuickAddGame } from './types'

const trendingTickerSpeedPxPerSecond = 28
const dragActivationThresholdPx = 6
const minimumTickerCopyCount = 2

function normalizeTickerOffset(offset: number, loopWidth: number) {
  if (loopWidth <= 0) {
    return 0
  }

  const normalizedOffset = offset % loopWidth

  return normalizedOffset >= 0 ? normalizedOffset : normalizedOffset + loopWidth
}

function applyTickerOffset(track: HTMLDivElement | null, offset: number) {
  if (!track) {
    return
  }

  track.style.transform = `translate3d(${-offset}px, 0, 0)`
}

function buildTrendingGameTitle(game: LibraryTrendingGame) {
  return game.alreadyInLibrary
    ? `${game.title} is already in your library.`
    : `Seen played by ${game.recentPlayerCount} ${game.recentPlayerCount === 1 ? 'person' : 'people'} in your network recently.`
}

function buildMinimumTickerCopyCount(baseCycleWidth: number, viewportWidth: number) {
  if (baseCycleWidth <= 0) {
    return minimumTickerCopyCount
  }

  return Math.max(minimumTickerCopyCount, Math.ceil(viewportWidth / baseCycleWidth) + 2)
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
  const baseCycleRef = useRef<HTMLDivElement | null>(null)
  const offsetRef = useRef(0)
  const suppressClickRef = useRef(false)
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startOffset: number;
    moved: boolean;
  } | null>(null)
  const touchDragStateRef = useRef<{
    startX: number;
    startY: number;
    startOffset: number;
    moved: boolean;
    axis: 'undecided' | 'x' | 'y';
  } | null>(null)
  const [copyCount, setCopyCount] = useState(minimumTickerCopyCount)
  const [isViewportHovered, setIsViewportHovered] = useState(false)
  const [hasFocusWithin, setHasFocusWithin] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [loopWidth, setLoopWidth] = useState(0)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(false)
  const isTickerPaused = isViewportHovered || hasFocusWithin || isDragging

  const tickerCycles = useMemo(
    () => Array.from({ length: copyCount }, (_, copyIndex) => ({ copyIndex, games: trendingGames })),
    [copyCount, trendingGames]
  )

  useEffect(() => {
    const viewport = viewportRef.current
    const track = trackRef.current
    const baseCycle = baseCycleRef.current

    if (!viewport || !track || !baseCycle || typeof ResizeObserver === 'undefined' || trendingGames.length === 0) {
      setShouldAutoScroll(false)
      setLoopWidth(0)
      offsetRef.current = 0
      applyTickerOffset(trackRef.current, 0)
      return
    }

    const measureTicker = () => {
      const nextLoopWidth = baseCycle.getBoundingClientRect().width
      const nextCopyCount = buildMinimumTickerCopyCount(nextLoopWidth, viewport.clientWidth)

      setCopyCount((currentCopyCount) => (currentCopyCount === nextCopyCount ? currentCopyCount : nextCopyCount))
      setLoopWidth(nextLoopWidth)

      const canScroll = trendingGames.length > 1 && nextLoopWidth > 0
      setShouldAutoScroll(canScroll)

      offsetRef.current = canScroll
        ? normalizeTickerOffset(offsetRef.current, nextLoopWidth)
        : 0

      applyTickerOffset(track, offsetRef.current)
    }

    measureTicker()

    const observer = new ResizeObserver(() => {
      measureTicker()
    })

    observer.observe(viewport)
    observer.observe(track)
    observer.observe(baseCycle)

    return () => {
      observer.disconnect()
    }
  }, [tickerCycles, trendingGames])

  useEffect(() => {
    const track = trackRef.current

    if (!track || !shouldAutoScroll || isTickerPaused || loopWidth <= 0 || typeof window === 'undefined') {
      return
    }

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    if (reducedMotionQuery.matches) {
      return
    }

    let animationFrameId = 0
    let previousTimestamp: number | null = null

    const tick = (timestamp: number) => {
      const elapsedMs = previousTimestamp === null ? 0 : timestamp - previousTimestamp
      previousTimestamp = timestamp

      offsetRef.current = normalizeTickerOffset(
        offsetRef.current + ((elapsedMs / 1000) * trendingTickerSpeedPxPerSecond),
        loopWidth
      )
      applyTickerOffset(track, offsetRef.current)

      animationFrameId = window.requestAnimationFrame(tick)
    }

    animationFrameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [isTickerPaused, loopWidth, shouldAutoScroll])

  const stopDragging = (pointerId?: number) => {
    const viewport = viewportRef.current

    if (pointerId !== undefined && viewport?.hasPointerCapture(pointerId)) {
      viewport.releasePointerCapture(pointerId)
    }

    dragStateRef.current = null
    setIsDragging(false)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!shouldAutoScroll) {
      return
    }

    if (event.pointerType === 'touch') {
      return
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startOffset: offsetRef.current,
      moved: false
    }
    setIsDragging(true)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== event.pointerId || loopWidth <= 0) {
      return
    }

    const deltaX = event.clientX - dragState.startX

    if (!dragState.moved && Math.abs(deltaX) >= dragActivationThresholdPx) {
      dragState.moved = true
      suppressClickRef.current = true
    }

    if (!dragState.moved) {
      return
    }

    offsetRef.current = normalizeTickerOffset(dragState.startOffset - deltaX, loopWidth)
    applyTickerOffset(trackRef.current, offsetRef.current)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return
    }

    stopDragging(event.pointerId)
  }

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return
    }

    stopDragging(event.pointerId)
  }

  const handleLostPointerCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return
    }

    stopDragging()
  }

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    suppressClickRef.current = false
  }

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (!shouldAutoScroll || event.touches.length !== 1) {
      return
    }

    const touch = event.touches.item(0)

    if (!touch) {
      return
    }

    touchDragStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startOffset: offsetRef.current,
      moved: false,
      axis: 'undecided'
    }
  }

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touchDragState = touchDragStateRef.current

    if (!touchDragState || event.touches.length !== 1 || loopWidth <= 0) {
      return
    }

    const touch = event.touches.item(0)

    if (!touch) {
      return
    }

    const deltaX = touch.clientX - touchDragState.startX
    const deltaY = touch.clientY - touchDragState.startY

    if (touchDragState.axis === 'undecided') {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < dragActivationThresholdPx) {
        return
      }

      touchDragState.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y'

      if (touchDragState.axis === 'y') {
        touchDragStateRef.current = null
        return
      }

      setIsDragging(true)
    }

    if (touchDragState.axis !== 'x') {
      return
    }

    event.preventDefault()

    if (!touchDragState.moved) {
      touchDragState.moved = true
      suppressClickRef.current = true
    }

    offsetRef.current = normalizeTickerOffset(touchDragState.startOffset - deltaX, loopWidth)
    applyTickerOffset(trackRef.current, offsetRef.current)
  }

  const handleTouchEnd = () => {
    if (!touchDragStateRef.current) {
      return
    }

    touchDragStateRef.current = null
    setIsDragging(false)
  }

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
            onPointerEnter={() => setIsViewportHovered(true)}
            onPointerLeave={() => setIsViewportHovered(false)}
            onPointerDownCapture={handlePointerDown}
            onPointerMoveCapture={handlePointerMove}
            onPointerUpCapture={handlePointerUp}
            onPointerCancelCapture={handlePointerCancel}
            onLostPointerCapture={handleLostPointerCapture}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onClickCapture={handleClickCapture}
            onFocusCapture={() => setHasFocusWithin(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setHasFocusWithin(false)
              }
            }}
            sx={{
              overflow: 'hidden',
              cursor: shouldAutoScroll ? (isDragging ? 'grabbing' : 'grab') : 'default',
              userSelect: isDragging ? 'none' : 'auto',
              touchAction: shouldAutoScroll ? 'pan-y' : 'auto',
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
                width: 'max-content',
                py: 0.25,
                willChange: shouldAutoScroll ? 'transform' : 'auto'
              }}
            >
              {tickerCycles.map(({ copyIndex, games }) => {
                const isDuplicateCopy = copyIndex > 0

                return (
                  <Box
                    key={`copy-${copyIndex}`}
                    ref={copyIndex === 0 ? baseCycleRef : undefined}
                    aria-hidden={isDuplicateCopy ? true : undefined}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      pr: 1,
                      flexShrink: 0
                    }}
                  >
                    {games.map((game) => (
                      <Button
                        key={`${game.gameId}-${copyIndex}`}
                        variant={game.alreadyInLibrary ? 'soft' : 'plain'}
                        color={game.alreadyInLibrary ? 'neutral' : 'primary'}
                        size="sm"
                        disabled={game.alreadyInLibrary || addingLibraryGameId === game.gameId}
                        tabIndex={isDuplicateCopy ? -1 : 0}
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
                    ))}
                  </Box>
                )
              })}
            </Box>
          </Box>
        ) : null}
      </Stack>
    </Card>
  )
}