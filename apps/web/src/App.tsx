import { useEffect, useRef, type RefObject } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { DashboardLayout } from './components/dashboard/DashboardLayout'
import {
  dashboardTabPaths,
  getDashboardTabFromPathname
} from './components/dashboard/dashboardUtils'
import { DashboardProvider } from './contexts/DashboardContext'
import { useDashboardContext } from './contexts/useDashboardContext'
import { InviteLandingView } from './pages/InviteLandingView'
import { DiscoveryView } from './pages/DiscoveryView'
import { DebugView } from './pages/DebugView'
import { FriendsView } from './pages/FriendsView'
import { LibraryView } from './pages/LibraryView'
import { OverviewView } from './pages/OverviewView'
import { PlayView } from './pages/PlayView'

const appTitle = "Game's Up"

const dashboardTabTitles: Record<Exclude<ReturnType<typeof getDashboardTabFromPathname>, null>, string> = {
  overview: `${appTitle} • Overview`,
  friends: `${appTitle} • Friends`,
  library: `${appTitle} • Library`,
  play: `${appTitle} • Play`,
  discovery: `${appTitle} • Discovery`,
  debug: `${appTitle} • Admin and Debug`
}

export default function App() {
  return (
    <Routes>
      <Route path="/invite" element={<InviteLandingView />} />
      <Route
        path="/*"
        element={(
          <DashboardProvider>
            <DashboardAppShell />
          </DashboardProvider>
        )}
      />
    </Routes>
  )
}

function DashboardAppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { layoutProps } = useDashboardContext()
  const requestedTab = getDashboardTabFromPathname(location.pathname)
  const activeTab = requestedTab === 'debug' && !layoutProps.showDebugView ? 'overview' : (requestedTab ?? 'overview')
  const tabsAnchorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    document.title = dashboardTabTitles[activeTab]
  }, [activeTab])

  return (
    <DashboardLayout
      activeTab={activeTab}
      onTabChange={(tab) => navigate(dashboardTabPaths[tab])}
      installPrompt={layoutProps.installPrompt}
      toastNotices={layoutProps.toastNotices}
      onboarding={layoutProps.onboarding}
      showDebugLink={layoutProps.showDebugView}
      tabsAnchorRef={tabsAnchorRef}
    >
      <ScrollReset tabsAnchorRef={tabsAnchorRef} />
      <Routes>
        <Route
          path={dashboardTabPaths.overview}
          element={<OverviewView />}
        />
        <Route path="/overview" element={<Navigate to={dashboardTabPaths.overview} replace />} />
        <Route
          path={dashboardTabPaths.library}
          element={<LibraryView />}
        />
        <Route
          path={dashboardTabPaths.friends}
          element={<FriendsView />}
        />
        <Route
          path={dashboardTabPaths.play}
          element={<PlayView />}
        />
        <Route
          path={dashboardTabPaths.discovery}
          element={<DiscoveryView />}
        />
        <Route
          path={dashboardTabPaths.debug}
          element={layoutProps.showDebugView ? <DebugView /> : <Navigate to={dashboardTabPaths.overview} replace />}
        />
        <Route path="*" element={<Navigate to={dashboardTabPaths.overview} replace />} />
      </Routes>
    </DashboardLayout>
  )
}

function ScrollReset({
  tabsAnchorRef
}: {
  tabsAnchorRef: RefObject<HTMLDivElement>;
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