import type { ReactNode, RefObject } from 'react'
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
import { dashboardTabSx } from './dashboardUtils'
import type { DashboardTab, DashboardToast } from './types'

const dashboardTabs: Array<{ value: DashboardTab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'library', label: 'Library' },
  { value: 'discovery', label: 'Discover' },
  { value: 'play', label: 'Play' },
  { value: 'debug', label: 'Debug' }
]

const ambientSpectrumGradient = 'linear-gradient(115deg, #49ff66 0%, #1dff8f 18%, #14ffd6 40%, #20d8ff 62%, #4d93ff 82%, #49ff66 100%)'
const ambientOverlayBase = [
  'linear-gradient(180deg, rgba(6, 9, 18, 0.16) 0px, rgba(7, 11, 20, 0.24) 220px, rgba(7, 11, 20, 0.46) 520px, rgba(7, 11, 20, 0.78) 860px, rgba(7, 11, 20, 0.94) 100%)',
  'radial-gradient(circle at 50% 14%, rgba(255, 255, 255, 0.07), transparent 40%)',
  'radial-gradient(circle at 14% 18%, rgba(255, 255, 255, 0.04), transparent 26%)',
  'radial-gradient(circle at 84% 16%, rgba(255, 255, 255, 0.04), transparent 28%)'
].join(',')

export const DashboardLayout = ({
  activeTab,
  onTabChange,
  installPrompt,
  toastNotices,
  onboarding,
  showDebugTab,
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
  showDebugTab: boolean;
  tabsAnchorRef: RefObject<HTMLDivElement>;
  children: ReactNode;
}) => {
  const visibleTabs = showDebugTab ? dashboardTabs : dashboardTabs.filter((tab) => tab.value !== 'debug')

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
            background: [
              'linear-gradient(180deg, rgba(7, 11, 20, 0.14) 0%, rgba(7, 11, 20, 0.2) 18%, rgba(7, 11, 20, 0.34) 34%, rgba(7, 11, 20, 0.58) 50%, rgba(7, 11, 20, 0.8) 66%, rgba(7, 11, 20, 0.94) 82%, rgba(7, 11, 20, 1) 100%)',
              'radial-gradient(circle at 50% 120%, rgba(4, 7, 16, 0.98), transparent 50%)'
            ].join(','),
            mixBlendMode: 'multiply',
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
              'radial-gradient(circle at 50% 12%, rgba(255, 255, 255, 0.36), transparent 40%)',
              'radial-gradient(circle at 16% 20%, rgba(255, 255, 255, 0.22), transparent 26%)',
              'radial-gradient(circle at 84% 16%, rgba(255, 255, 255, 0.24), transparent 28%)',
              ambientSpectrumGradient
            ].join(','),
            backgroundBlendMode: 'screen, screen, screen, normal',
            backgroundSize: 'auto, auto, auto, 220% 220%',
            backgroundPosition: 'center top, left top, right top, 0% 50%',
            opacity: 0.08,
            WebkitMaskImage: 'linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.96) 22%, rgba(0, 0, 0, 0.82) 44%, rgba(0, 0, 0, 0.52) 66%, rgba(0, 0, 0, 0.18) 86%, rgba(0, 0, 0, 0.06) 100%)',
            maskImage: 'linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.96) 22%, rgba(0, 0, 0, 0.82) 44%, rgba(0, 0, 0, 0.52) 66%, rgba(0, 0, 0, 0.18) 86%, rgba(0, 0, 0, 0.06) 100%)',
            transformOrigin: '50% 18%',
            willChange: 'transform, background-position, opacity',
            animation: [
              'ambientSpectrumPan var(--ambient-cycle-duration) ease-in-out infinite',
              'ambientSpectrumPulse calc(var(--ambient-cycle-duration) * 0.75) ease-in-out infinite',
              'ambientDrift var(--ambient-drift-duration) ease-in-out infinite'
            ].join(', '),
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
            backgroundSize: '220% 220%',
            backgroundPosition: '0% 50%',
            opacity: 0.05,
            animation: 'ambientSpectrumPanSingle var(--ambient-cycle-duration) ease-in-out infinite',
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
                  boxShadow: 'lg',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  backdropFilter: 'blur(18px)',
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
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'linear-gradient(135deg, rgba(10, 16, 31, 0.94), rgba(19, 28, 46, 0.78))',
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
                    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.015))',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    boxShadow: '0 20px 44px rgba(0, 0, 0, 0.28)',
                    backdropFilter: 'blur(8px)'
                  }}
                >
                  <Box
                    sx={{
                      width: '100%',
                      height: '100%',
                      backgroundImage: ambientSpectrumGradient,
                      backgroundSize: '220% 220%',
                      backgroundPosition: '0% 50%',
                      WebkitMaskImage: 'url(/icon-discord-transparent.svg)',
                      maskImage: 'url(/icon-discord-transparent.svg)',
                      WebkitMaskRepeat: 'no-repeat',
                      maskRepeat: 'no-repeat',
                      WebkitMaskPosition: 'center',
                      maskPosition: 'center',
                      WebkitMaskSize: 'contain',
                      maskSize: 'contain',
                      opacity: 1,
                      filter: 'saturate(1.12) brightness(1.1) contrast(1.02) drop-shadow(0 10px 22px rgba(0, 0, 0, 0.2))',
                      willChange: 'background-position, opacity',
                      animation: [
                        'ambientSpectrumPanSingle var(--ambient-cycle-duration) ease-in-out infinite',
                        'logoSpectrumPresence calc(var(--ambient-cycle-duration) * 0.82) ease-in-out infinite',
                        'logoPulse calc(var(--ambient-cycle-duration) * 0.78) ease-in-out infinite'
                      ].join(', ')
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
                      Game Is Up
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
                border: '1px solid rgba(87, 244, 193, 0.2)',
                background: 'linear-gradient(135deg, rgba(18, 47, 43, 0.88), rgba(11, 16, 32, 0.82))',
                boxShadow: 'lg'
              }}
            >
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                sx={{ alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between' }}
              >
                <Box>
                  <Typography level="title-md" sx={{ color: 'primary.100', mb: 0.5 }}>
                    Keep Game Is Up on your home screen.
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
            <TabList
              disableUnderline
              sx={{
                p: { xs: 0.75, sm: 1 },
                gap: { xs: 0.5, sm: 1 },
                position: 'sticky',
                top: {
                  xs: 'calc(var(--app-top-inset, 0px) + 12px)',
                  md: 'calc(var(--app-top-inset, 0px) + 16px)'
                },
                zIndex: 20,
                borderRadius: 'xl',
                flexWrap: 'nowrap',
                backgroundColor: 'rgba(11, 16, 32, 0.82)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(18px)',
                boxShadow: 'lg'
              }}
            >
              {visibleTabs.map((tab) => (
                <Tab key={tab.value} value={tab.value} sx={dashboardTabSx}>
                  {tab.label}
                </Tab>
              ))}
            </TabList>

            <Box sx={{ pt: 3 }}>{children}</Box>
          </Tabs>
        </Stack>
      </Box>
    </CssVarsProvider>
  )
}