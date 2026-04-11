import type { ReactNode } from 'react'
import {
  Box,
  Button,
  Card,
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
  toastNotices,
  onboarding,
  children
}: {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  toastNotices: DashboardToast[];
  onboarding?: ReactNode;
  children: ReactNode;
}) => {
  return (
    <CssVarsProvider theme={theme} defaultMode="dark">
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          px: { xs: 2, md: 4 },
          py: { xs: 3, md: 5 }
        }}
      >
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
              <Card
                key={toast.id}
                color={toast.notice.tone}
                variant="soft"
                role="status"
                sx={{
                  p: 1.5,
                  borderRadius: 'sm',
                  boxShadow: 'lg',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  backdropFilter: 'blur(18px)',
                  pointerEvents: 'auto'
                }}
              >
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    columnGap: 1.5,
                    alignItems: 'center'
                  }}
                >
                  <Typography level="body-sm" sx={{ minWidth: 0, lineHeight: 1.5, display: 'flex', alignItems: 'center' }}>
                    {toast.notice.message}
                  </Typography>
                  <Button
                    size="sm"
                    variant="plain"
                    color={toast.notice.tone}
                    onClick={toast.dismiss}
                    sx={{ minWidth: 'auto', px: 0.5, flexShrink: 0 }}
                  >
                    Dismiss
                  </Button>
                </Box>
              </Card>
            ))}
          </Stack>
        ) : null}

        <Stack spacing={4} sx={{ maxWidth: 1200, mx: 'auto' }}>
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
                Find people waiting to play the same games as you.
              </Typography>
              <Typography level="body-lg" sx={{ color: 'neutral.200' }}>
                This first implementation focuses on overlap, friends, and timely play intent. The Android app will wrap this web experience through Capacitor so the same interface and product logic stay shared.
              </Typography>
            </Stack>
          </Sheet>

          {onboarding ?? null}

          <Tabs
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
                p: 1,
                gap: 1,
                borderRadius: 'xl',
                flexWrap: 'wrap',
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