import type { ReactNode, RefObject } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
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
  { value: 'play', label: 'Play' }
]

export const DashboardLayout = ({
  activeTab,
  onTabChange,
  installPrompt,
  toastNotices,
  onboarding,
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
            position: 'absolute',
            inset: 0,
            background: [
              'linear-gradient(180deg, rgba(7, 11, 20, 0) 0px, rgba(7, 11, 20, 0.22) 140px, rgba(7, 11, 20, 0.74) 320px, rgba(7, 11, 20, 0.9) 520px)',
              'radial-gradient(circle at 50% 220px, rgba(28, 171, 132, 0.08), transparent 420px)'
            ].join(','),
            pointerEvents: 'none',
            zIndex: 0
          }}
        />

        <Box
          aria-hidden="true"
          sx={{
            position: 'absolute',
            top: 0,
            left: 'var(--app-titlebar-x, 0px)',
            width: 'var(--app-titlebar-width, 100%)',
            height: 'var(--app-titlebar-height, 0px)',
            background: 'linear-gradient(90deg, rgba(78, 240, 183, 0.1), rgba(78, 240, 183, 0))',
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
              <Chip size="lg" color="primary" variant="soft" sx={{ alignSelf: 'flex-start' }}>
                Beta
              </Chip>
              <Typography level="h1" sx={{ fontSize: { xs: '2.4rem', md: '4rem' } }}>
                Game Is Up
              </Typography>
              <Typography level="body-lg" sx={{ color: 'neutral.200' }}>
                Build your library, find others who play, and turn "anyone up for a game?" into an actual plan.
              </Typography>
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
              {dashboardTabs.map((tab) => (
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