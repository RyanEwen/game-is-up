import { type ReactNode, type RefObject } from 'react'
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

const dashboardTabs: Array<{ value: DashboardTab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'friends', label: 'Friends' },
  { value: 'library', label: 'Library' },
  { value: 'discovery', label: 'Discover' },
  { value: 'play', label: 'Play' }
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
              border: '1px solid #304159',
                background: 'linear-gradient(135deg, #162338, #1d2f48)',
              boxShadow: 'xl'
            }}
          >
            <Stack spacing={2}>
              <Stack
                direction="row"
                spacing={{ xs: 2, sm: 2.5 }}
                sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, width: '100%' }}
              >
                <Box
                  aria-hidden="true"
                  sx={{
                    width: { xs: 72, md: 92 },
                    height: { xs: 72, md: 92 },
                    flexShrink: 0,
                    borderRadius: '24px',
                    p: 1,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'linear-gradient(180deg, #20304a, #151d2b)',
                    border: '1px solid #3b516c',
                    boxShadow: 'none'
                  }}
                >
                  <Box
                    sx={{
                      width: '100%',
                      height: '100%',
                      backgroundImage: ambientSpectrumGradient,
                      backgroundSize: '100% 100%',
                      backgroundPosition: 'center',
                      WebkitMaskImage: 'url(/icon-discord-transparent.svg)',
                      maskImage: 'url(/icon-discord-transparent.svg)',
                      WebkitMaskRepeat: 'no-repeat',
                      maskRepeat: 'no-repeat',
                      WebkitMaskPosition: 'center',
                      maskPosition: 'center',
                      WebkitMaskSize: 'contain',
                      maskSize: 'contain',
                      filter: 'saturate(1.12) brightness(1.06) contrast(1.03) drop-shadow(0 10px 22px #02050d)'
                    }}
                  />
                </Box>
                <Stack spacing={1.25} sx={{ minWidth: 0, flex: 1 }}>
                  <Stack
                    direction="row"
                    spacing={1.5}
                    sx={{ alignItems: 'center' }}
                  >
                    <Typography level="h1" sx={{ fontSize: { xs: '2.4rem', md: '4rem' } }}>
                      Game's Up
                    </Typography>
                  </Stack>
                  <Typography level="body-lg" sx={{ color: 'neutral.200', maxWidth: 'none' }}>
                    Build your library, find others who play, and turn "anyone up for a game?" into an actual plan.
                  </Typography>
                </Stack>
              </Stack>
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
                  m: 0.5,
                  p: { xs: 0.75, sm: 1 },
                  gap: { xs: 0.5, sm: 1 },
                  position: 'relative',
                  borderRadius: 'xl',
                  flexWrap: 'nowrap',
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
                  <Tab key={tab.value} value={tab.value} sx={dashboardTabSx}>
                    {tab.label}
                  </Tab>
                ))}
              </TabList>
            </Box>

            <Box sx={{ pt: 3 }}>{children}</Box>
          </Tabs>

          {showDebugLink ? (
            <Box
              component="footer"
              sx={{ textAlign: 'center', pb: 1 }}
            >
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
            </Box>
          ) : null}
        </Stack>
      </Box>
    </CssVarsProvider>
  )
}