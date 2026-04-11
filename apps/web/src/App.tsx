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

  return (
    <DashboardLayout
      activeTab={activeTab}
      onTabChange={(tab) => navigate(dashboardTabPaths[tab])}
      toastNotices={layoutProps.toastNotices}
      onboarding={layoutProps.onboarding}
    >
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