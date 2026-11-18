import type { ReactNode } from 'react'
import { useDashboardApp } from '../hooks/useDashboardApp'
import { DashboardContext } from './useDashboardContext'

export function DashboardProvider({ children }: { children: ReactNode }) {
  const value = useDashboardApp()

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  )
}
