import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Box, Button, Card, Stack, Typography } from '@mui/joy'
import type { LibrarySuggestedGame } from '@game-is-up/shared'
import { formatWeekdayMonthDay } from '../../lib/dateTime'
import type { DashboardLibraryQuickAddGame } from './types'

const dragActivationThresholdPx = 6

function formatObservedLabel(lastObservedAt: string): string {
  return `Seen on Discord ${formatWeekdayMonthDay(lastObservedAt)}`
}

function buildSuggestionMaskImage(hasOverflowLeft: boolean, hasOverflowRight: boolean) {
  if (hasOverflowLeft && hasOverflowRight) {
    return 'linear-gradient(90deg, transparent 0, rgba(0, 0, 0, 1) 2.5rem, rgba(0, 0, 0, 1) calc(100% - 2.5rem), transparent 100%)'
  }

  if (hasOverflowRight) {
    return 'linear-gradient(90deg, rgba(0, 0, 0, 1) 0, rgba(0, 0, 0, 1) calc(100% - 2.5rem), transparent 100%)'
  }

  if (hasOverflowLeft) {
    return 'linear-gradient(90deg, transparent 0, rgba(0, 0, 0, 1) 2.5rem, rgba(0, 0, 0, 1) 100%)'
  }

  return 'none'
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
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const suppressClickRef = useRef(false)
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null)
  const [canScroll, setCanScroll] = useState(false)
  const [hasOverflowLeft, setHasOverflowLeft] = useState(false)
  const [hasOverflowRight, setHasOverflowRight] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const maskImage = canScroll ? buildSuggestionMaskImage(hasOverflowLeft, hasOverflowRight) : 'none'

  useEffect(() => {
    const scrollElement = scrollRef.current

    if (!scrollElement) {
      setCanScroll(false)
      setHasOverflowLeft(false)
      setHasOverflowRight(false)
      return
    }

    const updateOverflowState = () => {
      const maxScrollLeft = Math.max(0, scrollElement.scrollWidth - scrollElement.clientWidth)
      const nextCanScroll = maxScrollLeft > 1

      setCanScroll(nextCanScroll)
      setHasOverflowLeft(nextCanScroll && scrollElement.scrollLeft > 1)
      setHasOverflowRight(nextCanScroll && scrollElement.scrollLeft < maxScrollLeft - 1)
    }

    updateOverflowState()

    scrollElement.addEventListener('scroll', updateOverflowState, { passive: true })

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        scrollElement.removeEventListener('scroll', updateOverflowState)
      }
    }

    const observer = new ResizeObserver(() => {
      updateOverflowState()
    })

    observer.observe(scrollElement)

    if (scrollElement.firstElementChild instanceof HTMLElement) {
      observer.observe(scrollElement.firstElementChild)
    }

    return () => {
      scrollElement.removeEventListener('scroll', updateOverflowState)
      observer.disconnect()
    }
  }, [suggestedGames])

  const stopDragging = (pointerId?: number) => {
    const scrollElement = scrollRef.current

    if (pointerId !== undefined && scrollElement?.hasPointerCapture(pointerId)) {
      scrollElement.releasePointerCapture(pointerId)
    }

    dragStateRef.current = null
    setIsDragging(false)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scrollElement = scrollRef.current

    if (!scrollElement || !canScroll) {
      return
    }

    if (event.pointerType === 'touch') {
      return
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    scrollElement.setPointerCapture(event.pointerId)
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: scrollElement.scrollLeft,
      moved: false
    }
    setIsDragging(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scrollElement = scrollRef.current
    const dragState = dragStateRef.current

    if (!scrollElement || !dragState || dragState.pointerId !== event.pointerId) {
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

    scrollElement.scrollLeft = dragState.startScrollLeft - deltaX
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return
    }

    stopDragging(event.pointerId)
  }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return
    }

    stopDragging(event.pointerId)
  }

  const handleLostPointerCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return
    }

    stopDragging()
  }

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    suppressClickRef.current = false
  }

  if (suggestedGames.length === 0) {
    return null
  }

  return (
    <Card variant="soft" sx={{ p: 2.25, overflow: 'hidden' }}>
      <Stack spacing={1.25}>
        <Box>
          <Typography level="title-md">Suggestions based on your activity</Typography>
        </Box>
        <Box>
          <Stack
            ref={scrollRef}
            direction="row"
            spacing={1}
            onPointerDownCapture={handlePointerDown}
            onPointerMoveCapture={handlePointerMove}
            onPointerUpCapture={handlePointerUp}
            onPointerCancelCapture={handlePointerCancel}
            onLostPointerCapture={handleLostPointerCapture}
            onClickCapture={handleClickCapture}
            sx={{
              flexWrap: 'nowrap',
              overflowX: 'auto',
              overflowY: 'hidden',
              pb: 0.5,
              scrollbarWidth: 'none',
              cursor: canScroll ? (isDragging ? 'grabbing' : 'grab') : 'default',
              userSelect: isDragging ? 'none' : 'auto',
              touchAction: 'auto',
              WebkitOverflowScrolling: 'touch',
              maskImage,
              WebkitMaskImage: maskImage,
              '&::-webkit-scrollbar': {
                display: 'none'
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
                  flexShrink: 0,
                  minWidth: 'max-content',
                  whiteSpace: 'nowrap',
                  justifyContent: 'flex-start',
                  alignSelf: 'flex-start',
                  cursor: 'pointer',
                  boxShadow: 'none',
                  transition: 'background-color 180ms ease, color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
                  '&:hover': {
                    backgroundColor: libraryGameIds.has(game.gameId) ? undefined : 'primary.400',
                    color: libraryGameIds.has(game.gameId) ? undefined : 'common.white',
                    transform: libraryGameIds.has(game.gameId) ? undefined : 'translateY(-1px)',
                    boxShadow: libraryGameIds.has(game.gameId) ? undefined : '0 0 0 1px rgba(var(--joy-palette-primary-lightChannel) / 0.22)'
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
        </Box>
      </Stack>
    </Card>
  )
}