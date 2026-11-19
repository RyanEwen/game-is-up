import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react'
import { Box, Typography } from '@mui/joy'
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { DashboardLayout } from './components/dashboard/DashboardLayout'
import { GameDetailsDialog } from './components/dashboard/GameDetailsDialog'
import {
  dashboardTabPaths,
  getDashboardTabFromPathname,
} from './components/dashboard/dashboardUtils'
import { DashboardProvider } from './contexts/DashboardContext'
import { useDashboardContext } from './contexts/useDashboardContext'

const InviteLandingView = lazy(async () => {
  const module = await import('./pages/InviteLandingView')
  return { default: module.InviteLandingView }
})
const PrivacyPage = lazy(async () => {
  const module = await import('./pages/PrivacyPage')
  return { default: module.PrivacyPage }
})

const DiscoveryView = lazy(async () => {
  const module = await import('./pages/DiscoveryView')
  return { default: module.DiscoveryView }
})

const DebugView = lazy(async () => {
  const module = await import('./pages/DebugView')
  return { default: module.DebugView }
})

const FriendsView = lazy(async () => {
  const module = await import('./pages/FriendsView')
  return { default: module.FriendsView }
})

const NetworkView = lazy(async () => {
  const module = await import('./pages/NetworkView')
  return { default: module.NetworkView }
})

const LibraryView = lazy(async () => {
  const module = await import('./pages/LibraryView')
  return { default: module.LibraryView }
})

const OverviewView = lazy(async () => {
  const module = await import('./pages/OverviewView')
  return { default: module.OverviewView }
})

const PlayView = lazy(async () => {
  const module = await import('./pages/PlayView')
  return { default: module.PlayView }
})

const PlayIntentDetailView = lazy(async () => {
  const module = await import('./pages/PlayIntentDetailView')
  return { default: module.PlayIntentDetailView }
})

const appTitle = "Game's Up"

const dashboardTabTitles: Record<
  Exclude<ReturnType<typeof getDashboardTabFromPathname>, null>,
  string
> = {
  overview: `${appTitle} • Home`,
  network: `${appTitle} • Network`,
  friends: `${appTitle} • Friends`,
  library: `${appTitle} • Library`,
  play: `${appTitle} • Play`,
  discovery: `${appTitle} • Discovery`,
  debug: `${appTitle} • Admin and Debug`,
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/invite"
        element={
          <RouteSuspense>
            <InviteLandingView />
          </RouteSuspense>
        }
      />
      <Route
        path="/privacy"
        element={
          <RouteSuspense>
            <PrivacyPage />
          </RouteSuspense>
        }
      />
      <Route
        path="/*"
        element={
          <DashboardProvider>
            <DashboardAppShell />
          </DashboardProvider>
        }
      />
    </Routes>
  )
}

function DashboardAppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { layoutProps, gameDetailsViewProps } = useDashboardContext()
  const requestedTab = getDashboardTabFromPathname(location.pathname)
  const isDebugAccessKnown = layoutProps.isSignedIn || layoutProps.showDebugView
  const shouldRedirectDebugRoute =
    requestedTab === 'debug' && isDebugAccessKnown && !layoutProps.showDebugView
  const activeTab = shouldRedirectDebugRoute
    ? 'overview'
    : (requestedTab ?? 'overview')
  const tabsAnchorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (location.pathname.startsWith('/play/')) {
      return
    }

    document.title = dashboardTabTitles[activeTab]
  }, [activeTab, location.pathname])

  return (
    <DashboardLayout
      activeTab={activeTab}
      onTabChange={(tab) => navigate(dashboardTabPaths[tab])}
      toastNotices={layoutProps.toastNotices}
      onboarding={layoutProps.onboarding}
      showDebugLink={layoutProps.showDebugView}
      tabsAnchorRef={tabsAnchorRef}
    >
      <ScrollReset tabsAnchorRef={tabsAnchorRef} />
      <RouteSuspense>
        <Routes>
          <Route path={dashboardTabPaths.overview} element={<OverviewView />} />
          <Route
            path="/overview"
            element={<Navigate to={dashboardTabPaths.overview} replace />}
          />
          <Route path={dashboardTabPaths.network} element={<NetworkView />} />
          <Route path={dashboardTabPaths.library} element={<LibraryView />} />
          <Route path={dashboardTabPaths.friends} element={<FriendsView />} />
          <Route path={dashboardTabPaths.play} element={<PlayView />} />
          <Route
            path="/play/:playIntentId"
            element={<PlayIntentDetailView />}
          />
          <Route
            path={dashboardTabPaths.discovery}
            element={<DiscoveryView />}
          />
          <Route
            path={dashboardTabPaths.debug}
            element={
              shouldRedirectDebugRoute ? (
                <Navigate to={dashboardTabPaths.overview} replace />
              ) : (
                <DebugView />
              )
            }
          />
          <Route
            path="*"
            element={<Navigate to={dashboardTabPaths.overview} replace />}
          />
        </Routes>
      </RouteSuspense>
      <GameDetailsDialog
        open={gameDetailsViewProps.isOpen}
        target={gameDetailsViewProps.target}
        gameDetails={gameDetailsViewProps.gameDetails}
        loading={gameDetailsViewProps.loading}
        error={gameDetailsViewProps.error}
        onClose={gameDetailsViewProps.closeGameDetails}
      />
    </DashboardLayout>
  )
}

function RouteSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <Box sx={{ py: 4 }}>
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            Loading view...
          </Typography>
        </Box>
      }
    >
      {children}
    </Suspense>
  )
}

function ScrollReset({
  tabsAnchorRef,
}: {
  tabsAnchorRef: RefObject<HTMLDivElement | null>
}) {
  const { pathname } = useLocation()
  const previousPathnameRef = useRef(pathname)

  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return
    }

    previousPathnameRef.current = pathname

    const tabsAnchor = tabsAnchorRef.current

    if (!tabsAnchor) {
      return
    }

    const tabsTop = tabsAnchor.getBoundingClientRect().top + window.scrollY

    if (window.scrollY > tabsTop) {
      window.scrollTo({ top: tabsTop, left: 0, behavior: 'auto' })
    }
  }, [pathname, tabsAnchorRef])

  return null
}
