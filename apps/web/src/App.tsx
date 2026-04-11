import { useEffect, useRef, type RefObject } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { DashboardLayout } from './components/dashboard/DashboardLayout'
import {
  dashboardTabPaths,
  getDashboardTabFromPathname
} from './components/dashboard/dashboardUtils'
import { DashboardProvider } from './contexts/DashboardContext'
import { useDashboardContext } from './contexts/useDashboardContext'
import { DiscoveryView } from './pages/DiscoveryView'
import { LibraryView } from './pages/LibraryView'
import { OverviewView } from './pages/OverviewView'
import { PlayView } from './pages/PlayView'

export default function App() {
  return (
    <DashboardProvider>
      <DashboardAppShell />
    </DashboardProvider>
  )
}

function DashboardAppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { layoutProps } = useDashboardContext()
  const activeTab = getDashboardTabFromPathname(location.pathname) ?? 'overview'
  const tabsAnchorRef = useRef<HTMLDivElement | null>(null)

  return (
    <DashboardLayout
      activeTab={activeTab}
      onTabChange={(tab) => navigate(dashboardTabPaths[tab])}
      toastNotices={layoutProps.toastNotices}
      onboarding={layoutProps.onboarding}
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
          path={dashboardTabPaths.play}
          element={<PlayView />}
        />
        <Route
          path={dashboardTabPaths.discovery}
          element={<DiscoveryView />}
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