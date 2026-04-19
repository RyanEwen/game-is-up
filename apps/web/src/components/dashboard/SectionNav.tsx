import { Box } from '@mui/joy'
import { useEffect, useRef, useState } from 'react'

// Tab bar pill bottom = sticky-top + margin(4) + border(1) + padding + tab-minHeight + padding + border(1)
// xs: 12 + 4 + 1 + 6 + 44 + 6 + 1 = 74px
// md: 16 + 4 + 1 + 8 + 52 + 8 + 1 = 90px
const sectionNavTop = {
  xs: 'calc(var(--app-top-inset, 0px) + 73px)',
  md: 'calc(var(--app-top-inset, 0px) + 89px)'
} as const

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export type SectionNavEntry = {
  id: string
  label: string
  mobileLabel?: string
  desktopLabel?: string
  ariaLabel?: string
  count?: number
}

export function SectionNav({
  sections,
  mb = 3,
  'aria-label': ariaLabel = 'Page sections'
}: {
  sections: SectionNavEntry[]
  mb?: number
  'aria-label'?: string
}) {
  const navRef = useRef<HTMLDivElement>(null)
  const [isStuck, setIsStuck] = useState(false)

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const check = () => {
      const rect = nav.getBoundingClientRect()
      const stickyTop = parseFloat(getComputedStyle(nav).top) || 0
      setIsStuck(rect.top <= stickyTop + 1)
    }
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check, { passive: true })
    check()
    return () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [])

  const topRadius = isStuck ? 0 : 'var(--joy-radius-xl, 16px)'

  return (
    <Box
      ref={navRef}
      component="nav"
      aria-label={ariaLabel}
      sx={{
        position: 'sticky',
        top: sectionNavTop,
        zIndex: 19,
        mb,
        display: 'flex',
        justifyContent: 'center'
      }}
    >
      <Box
        sx={{
          display: 'inline-flex',
          width: 'fit-content',
          maxWidth: 'calc(100% - 8px)',
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'nowrap',
          justifyContent: 'center',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': {
            display: 'none'
          },
          gap: 0,
          px: { xs: 2, sm: 2.5 },
          py: { xs: 0.75, sm: 1 },
          borderTop: 'none',
          borderLeft: '1px solid rgba(129, 166, 214, 0.22)',
          borderRight: '1px solid rgba(129, 166, 214, 0.22)',
          borderBottom: '1px solid rgba(129, 166, 214, 0.22)',
          borderTopLeftRadius: topRadius,
          borderTopRightRadius: topRadius,
          borderBottomLeftRadius: 'var(--joy-radius-xl, 16px)',
          borderBottomRightRadius: 'var(--joy-radius-xl, 16px)',
          transition: 'border-top-left-radius 120ms ease, border-top-right-radius 120ms ease',
          backgroundColor: 'rgba(7, 12, 24, 0.86)',
          backdropFilter: 'blur(10px) saturate(1.04)',
          WebkitBackdropFilter: 'blur(10px) saturate(1.04)',
          boxShadow: [
            '0 14px 26px -18px rgba(0, 0, 0, 0.92)',
            'inset 0 -1px 0 rgba(255, 255, 255, 0.04)',
            '0 0 0 1px rgba(94, 144, 206, 0.14)'
          ].join(', ')
        }}
      >
        {sections.map(({ id, label, mobileLabel, desktopLabel, ariaLabel, count }, i) => (
          <Box key={id} sx={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && (
              <Box
                component="span"
                aria-hidden
                sx={{ mx: 1.5, color: 'rgba(255,255,255,0.18)', userSelect: 'none', fontSize: 'sm' }}
              >
                ·
              </Box>
            )}
            <Box
              component="button"
              aria-label={ariaLabel ?? label}
              onClick={() => scrollToSection(id)}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                border: 'none',
                background: 'none',
                padding: 0,
                color: 'var(--joy-palette-neutral-400)',
                fontSize: { xs: 'var(--joy-fontSize-sm)', sm: 'var(--joy-fontSize-md)' },
                fontWeight: 'var(--joy-fontWeight-md)',
                fontFamily: 'var(--joy-fontFamily-body)',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                transition: 'color 150ms ease',
                '&:hover': { color: 'var(--joy-palette-neutral-100)' },
                '&:focus-visible': {
                  outline: '2px solid rgba(129, 166, 214, 0.6)',
                  outlineOffset: 3,
                  borderRadius: 2
                }
              }}
            >
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                {mobileLabel ?? label}
              </Box>
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                {desktopLabel ?? label}
              </Box>
              {count != null && count > 0 && (
                <Box
                  component="span"
                  sx={{
                    color: 'var(--joy-palette-neutral-500)',
                    fontSize: { xs: 'var(--joy-fontSize-xs)', sm: 'var(--joy-fontSize-sm)' },
                    fontWeight: 'var(--joy-fontWeight-md)'
                  }}
                >
                  {count}
                </Box>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
