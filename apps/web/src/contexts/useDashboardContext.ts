import { createContext, useContext } from 'react'
import type { useDashboardApp } from '../hooks/useDashboardApp'

type DashboardContextValue = ReturnType<typeof useDashboardApp>

export const DashboardContext = createContext<DashboardContextValue | null>(
  null,
)

export function useDashboardContext() {
  const value = useContext(DashboardContext)

  if (!value) {
    throw new Error(
      'useDashboardContext must be used within DashboardProvider.',
    )
  }

  return value
}
