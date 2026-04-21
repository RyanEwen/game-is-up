import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import HomeRoundedIcon from '@mui/icons-material/HomeRounded'
import { Link } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  CssBaseline,
  Sheet,
  Stack,
  Tab,
  TabList,
  Tabs,
  Typography
} from '@mui/joy'
import { CssVarsProvider } from '@mui/joy/styles'
import { theme } from '../../theme/theme'
import { dashboardTabPaths, dashboardTabSx } from './dashboardUtils'
import type { DashboardTab, DashboardToast } from './types'

const dashboardTabs: Array<{ value: DashboardTab; label?: string; desktopLabel?: string; icon?: ReactNode; ariaLabel: string }> = [
  { value: 'overview', label: 'Overview', desktopLabel: 'Overview', icon: <HomeRoundedIcon fontSize="small" />, ariaLabel: 'Overview' },
  { value: 'network', label: 'Network', ariaLabel: 'Network' },
  { value: 'friends', label: 'Friends', ariaLabel: 'Friends' },
  { value: 'library', label: 'Library', ariaLabel: 'Library' },
  { value: 'discovery', label: 'Discover', ariaLabel: 'Discover' },
  { value: 'play', label: 'Play', ariaLabel: 'Play' }
]

const ambientSpectrumGradient = 'linear-gradient(115deg, #92f7de 0%, #70ebcd 28%, #61d4bf 58%, #a9f3de 100%)'
const ambientOverlayBase = [
  'linear-gradient(132deg, rgba(8, 14, 24, 0.03) 0%, rgba(8, 14, 24, 0.09) 100%)',
  'radial-gradient(circle at 50% 10%, rgba(255, 255, 255, 0.08), transparent 34%)'
].join(',')

export const DashboardLayout = ({
  activeTab,
  onTabChange,
  installPrompt,
  toastNotices,
  onboarding,
  showDebugLink,
  tabsAnchorRef,
  children
}: {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  installPrompt?: {
    label: string;
    pending: boolean;
    onInstall: () => void | Promise<void>;
  };
  toastNotices: DashboardToast[];
  onboarding?: ReactNode;
  showDebugLink: boolean;
  tabsAnchorRef: RefObject<HTMLDivElement>;
  children: ReactNode;
}) => {
  const stickyTabsRef = useRef<HTMLDivElement | null>(null)
  const [isTabsStuck, setIsTabsStuck] = useState(false)

  useEffect(() => {
    const stickyTabs = stickyTabsRef.current

    if (!stickyTabs || typeof window === 'undefined') {
      return
    }

    const updateStickyState = () => {
      const stickyTop = Number.parseFloat(window.getComputedStyle(stickyTabs).top) || 0
      setIsTabsStuck(stickyTabs.getBoundingClientRect().top <= stickyTop + 0.5)
    }

    updateStickyState()
    window.addEventListener('scroll', updateStickyState, { passive: true })
    window.addEventListener('resize', updateStickyState)

    return () => {
      window.removeEventListener('scroll', updateStickyState)
      window.removeEventListener('resize', updateStickyState)
    }
  }, [])

  return (
    <CssVarsProvider theme={theme} defaultMode="dark">
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          position: 'relative',
          px: { xs: 2, md: 4 },
          pt: {
            xs: 'calc(var(--app-top-inset, 0px) + 18px)',
            md: 'calc(var(--app-top-inset, 0px) + 28px)'
          },
          pb: { xs: 3, md: 5 }
        }}
      >
        <Box
          aria-hidden="true"
          sx={{
            position: 'fixed',
            inset: 0,
            background: ambientOverlayBase,
            pointerEvents: 'none',
            zIndex: 0
          }}
        />

        <Box
          aria-hidden="true"
          sx={{
            position: 'fixed',
            inset: 0,
            backgroundImage: [
              'radial-gradient(circle at 50% 8%, rgba(255, 255, 255, 0.12), transparent 32%)',
              ambientSpectrumGradient
            ].join(','),
            backgroundBlendMode: 'screen, normal',
            backgroundSize: 'auto, 100% 100%',
            backgroundPosition: 'center top, center',
            opacity: 0.05,
            pointerEvents: 'none',
            zIndex: 0
          }}
        />

        <Box
          aria-hidden="true"
          sx={{
            position: 'fixed',
            top: 0,
            left: 'var(--app-titlebar-x, 0px)',
            width: 'var(--app-titlebar-width, 100%)',
            height: 'var(--app-titlebar-height, 0px)',
            backgroundImage: ambientSpectrumGradient,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center',
            opacity: 0.04,
            pointerEvents: 'none',
            zIndex: 1
          }}
        />

        {toastNotices.length > 0 ? (
          <Stack
            spacing={1.25}
            sx={{
              position: 'fixed',
              right: { xs: 16, sm: 24 },
              bottom: { xs: 16, sm: 24 },
              width: { xs: 'calc(100vw - 32px)', sm: 360 },
              maxWidth: 'calc(100vw - 32px)',
              zIndex: 1400,
              pointerEvents: 'none'
            }}
          >
            {toastNotices.map((toast) => (
              <Alert
                key={toast.id}
                color={toast.notice.tone}
                variant="soft"
                role={toast.notice.tone === 'danger' ? 'alert' : 'status'}
                endDecorator={
                  <Button
                    size="sm"
                    variant="plain"
                    color={toast.notice.tone}
                    onClick={toast.dismiss}
                    sx={{ minWidth: 'auto', px: 0.5, flexShrink: 0 }}
                  >
                    Dismiss
                  </Button>
                }
                sx={{
                  p: 1.5,
                  borderRadius: 'sm',
                  backgroundColor: '#121a28',
                  border: '1px solid #304159',
                  boxShadow: 'none',
                  pointerEvents: 'auto',
                  alignItems: 'center'
                }}
              >
                <Typography level="body-sm" sx={{ minWidth: 0, lineHeight: 1.5 }}>
                  {toast.notice.message}
                </Typography>
              </Alert>
            ))}
          </Stack>
        ) : null}

        <Stack spacing={4} sx={{ position: 'relative', zIndex: 1, maxWidth: 1200, mx: 'auto' }}>
          <Sheet
            variant="plain"
            sx={{
              p: { xs: 3, md: 4 },
              borderRadius: 'lg',
              border: '1px solid var(--joy-palette-neutral-700)',
              backgroundColor: 'var(--joy-palette-background-level2)',
              backgroundImage: 'linear-gradient(135deg, var(--joy-palette-neutral-900) 0%, var(--joy-palette-background-level2) 64%, rgba(var(--joy-palette-primary-darkChannel) / 0.22) 100%)',
              boxShadow: 'xl'
            }}
          >
            <Stack spacing={2}>
              <Box
                sx={{
                  display: 'grid',
                  width: '100%',
                  columnGap: { xs: 2, sm: 2.5 },
                  rowGap: 1.25,
                  gridTemplateColumns: {
                    xs: '1fr auto',
                    sm: '1fr auto'
                  },
                  gridTemplateAreas: {
                    xs: '"title logo" "body body"',
                    sm: '"title logo" "body logo"'
                  },
                  alignItems: 'start'
                }}
              >
                <Box
                  aria-hidden="true"
                  sx={{
                    gridArea: 'logo',
                    width: { xs: 50, md: 128 },
                    height: { xs: 50, md: 128 },
                    flexShrink: 0,
                    borderRadius: { xs: '14px', md: '28px' },
                    p: { xs: 0.6, md: 1 },
                    display: 'grid',
                    placeItems: 'center',
                    overflow: 'hidden',
                    backgroundColor: 'var(--joy-palette-neutral-900)',
                    backgroundImage: 'linear-gradient(180deg, rgba(var(--joy-palette-primary-darkChannel) / 0.1), rgba(var(--joy-palette-neutral-darkChannel) / 0.08))',
                    border: '1px solid rgba(var(--joy-palette-neutral-mainChannel) / 0.22)',
                    boxShadow: 'none'
                  }}
                >
                  <Box
                    component="img"
                    src="/icon-gamepad-voice-green-bubble.svg"
                    alt=""
                    sx={{
                      position: 'relative',
                      width: '100%',
                      height: '100%',
                      display: 'block',
                      objectFit: 'contain',
                      objectPosition: 'center',
                    }}
                  />
                </Box>
                <Typography
                  level="h1"
                  sx={{
                    gridArea: 'title',
                    minWidth: 0,
                    fontSize: { xs: '2.4rem', md: '4rem' },
                    alignSelf: 'start'
                  }}
                >
                  Game's Up
                </Typography>
                <Typography
                  level="body-lg"
                  sx={{
                    gridArea: 'body',
                    color: 'neutral.200',
                    maxWidth: 'none',
                    minWidth: 0
                  }}
                >
                  Build your library, find others that want to play the same games, and connect with them to make it happen.
                </Typography>
              </Box>
            </Stack>
          </Sheet>

          {onboarding ?? null}

          {installPrompt ? (
            <Sheet
              variant="soft"
              color="primary"
              sx={{
                p: { xs: 2, md: 2.5 },
                borderRadius: 'xl',
                border: '1px solid #245f74',
                background: 'linear-gradient(135deg, #173048, #16273a)',
                boxShadow: 'none'
              }}
            >
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                sx={{ alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between' }}
              >
                <Box>
                  <Typography level="title-md" sx={{ color: 'primary.100', mb: 0.5 }}>
                    Keep Game's Up on your home screen.
                  </Typography>
                  <Typography level="body-sm" sx={{ color: 'neutral.200' }}>
                    Install it for faster launches and an app-like shell in supported browsers.
                  </Typography>
                </Box>
                <Button
                  size="md"
                  color="primary"
                  onClick={installPrompt.onInstall}
                  loading={installPrompt.pending}
                  sx={{ flexShrink: 0, minWidth: { sm: 150 } }}
                >
                  {installPrompt.label}
                </Button>
              </Stack>
            </Sheet>
          ) : null}

          <Tabs
            ref={tabsAnchorRef}
            value={activeTab}
            onChange={(_, value) => {
              if (value) {
                onTabChange(value as DashboardTab)
              }
            }}
            sx={{
              '--Tabs-gap': '1rem',
              '--Tab-indicatorThickness': '0px',
              backgroundColor: 'transparent'
            }}
          >
            <Box
              ref={stickyTabsRef}
              sx={{
                position: 'sticky',
                top: {
                  xs: 'calc(var(--app-top-inset, 0px) + 12px)',
                  md: 'calc(var(--app-top-inset, 0px) + 16px)'
                },
                zIndex: 20
              }}
            >
              <TabList
                disableUnderline
                sx={{
                  my: { xs: 0.25, sm: 0.5 },
                  mx: isTabsStuck ? { xs: 0.25, sm: 0.5 } : 0,
                  py: { xs: 0.75, sm: 1 },
                  px: { xs: 0.5, sm: 1 },
                  gap: { xs: 0.25, sm: 1 },
                  transition: 'margin 180ms ease',
                  position: 'relative',
                  borderRadius: 'xl',
                  flexWrap: 'nowrap',
                  overflowX: { xs: 'auto', sm: 'visible' },
                  scrollbarWidth: 'none',
                  '&::-webkit-scrollbar': {
                    display: 'none'
                  },
                  backgroundColor: 'rgba(13, 23, 38, 0.84)',
                  border: '1px solid rgba(118, 164, 220, 0.18)',
                  backdropFilter: 'blur(10px) saturate(1.04)',
                  WebkitBackdropFilter: 'blur(10px) saturate(1.04)',
                  boxShadow: [
                    '0 14px 26px -18px rgba(0, 0, 0, 0.92)',
                    '0 1px 0 rgba(197, 224, 255, 0.16)',
                    'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                    '0 0 0 1px rgba(88, 130, 184, 0.14)'
                  ].join(', ')
                }}
              >
                {dashboardTabs.map((tab) => (
                  <Tab
                    key={tab.value}
                    value={tab.value}
                    sx={dashboardTabSx}
                    aria-label={tab.ariaLabel}
                    title={tab.ariaLabel}
                  >
                    {tab.value === 'overview' ? (
                      <>
                        <Box component="span" sx={{ display: { xs: 'inline-flex', sm: 'none' }, alignItems: 'center' }}>
                          {tab.icon}
                        </Box>
                        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                          {tab.desktopLabel ?? tab.label}
                        </Box>
                      </>
                    ) : (
                      tab.icon ?? tab.label
                    )}
                  </Tab>
                ))}
              </TabList>
            </Box>

            <Box sx={{ pt: 3 }}>{children}</Box>
          </Tabs>

          <Box
            component="footer"
            sx={{ textAlign: 'center', pb: 1 }}
          >
            <Stack direction="row" spacing={0.75} justifyContent="center" alignItems="center" sx={{ flexWrap: 'wrap' }}>
              <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center" sx={{ flexWrap: 'wrap' }}>
                <Typography level="body-xs" sx={{ color: 'neutral.600' }}>
                  Designed and built by
                </Typography>
                <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
                  Ryan Ewen
                </Typography>
                <Typography
                  component="a"
                  href="https://discord.com/users/521605287291240448"
                  target="_blank"
                  rel="noreferrer"
                  level="body-xs"
                  sx={{
                    color: 'neutral.400',
                    textDecoration: 'none',
                    '&:hover': { color: 'primary.200', textDecoration: 'underline' }
                  }}
                >
                  @technicallyreal
                </Typography>
              </Stack>
              {showDebugLink ? (
                <>
                  <Typography level="body-xs" sx={{ color: 'neutral.700' }}>
                    •
                  </Typography>
                  <Typography
                    component={Link}
                    to={dashboardTabPaths.debug}
                    level="body-xs"
                    sx={{
                      color: 'neutral.500',
                      textDecoration: 'none',
                      '&:hover': { color: 'neutral.300' }
                    }}
                  >
                    Debug
                  </Typography>
                </>
              ) : null}
            </Stack>
          </Box>
        </Stack>
      </Box>
    </CssVarsProvider>
  )
}