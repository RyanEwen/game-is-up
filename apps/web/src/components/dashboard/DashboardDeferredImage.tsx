import { Box, Skeleton } from '@mui/joy'
import { useEffect, useRef, useState } from 'react'
import { useResetOnChange } from '../../hooks/useResetOnChange'

export function DashboardDeferredImage({
  src,
  alt,
  rootMargin = '400px 0px',
  eager = false,
  objectFit = 'cover',
  objectPosition = 'center',
}: {
  src: string
  alt: string
  rootMargin?: string
  eager?: boolean
  objectFit?: 'cover' | 'contain'
  objectPosition?: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [shouldLoad, setShouldLoad] = useState(eager)
  const [loaded, setLoaded] = useState(false)

  // A new image starts unloaded; an eager image (or one switched to eager) loads at once.
  useResetOnChange([src], () => setLoaded(false))
  useResetOnChange([eager, src], () => {
    if (eager) {
      setShouldLoad(true)
    }
  })

  useEffect(() => {
    if (shouldLoad) {
      return
    }

    const node = containerRef.current

    if (!node || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some(
            (entry) => entry.isIntersecting || entry.intersectionRatio > 0,
          )
        ) {
          setShouldLoad(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )

    observer.observe(node)

    return () => observer.disconnect()
  }, [rootMargin, shouldLoad, src])

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        position: 'relative',
        display: 'block',
        overflow: 'hidden',
      }}
    >
      {!loaded ? (
        <Skeleton
          variant="overlay"
          sx={{ position: 'absolute', inset: 0, borderRadius: 0 }}
        />
      ) : null}
      {shouldLoad ? (
        <Box
          component="img"
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit,
            objectPosition,
            opacity: loaded ? 1 : 0,
            transition: 'opacity 180ms ease-out',
          }}
        />
      ) : null}
    </Box>
  )
}
