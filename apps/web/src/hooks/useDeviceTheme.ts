/**
 * Per-device theme selection, persisted in localStorage. There is no shared
 * server-side theme setting yet, so this is the whole story: unknown or
 * missing stored values fall back to the default theme, and reads/writes are
 * guarded so non-browser contexts (tests, SSR experiments) stay safe.
 */
import { useCallback, useState } from 'react'
import {
  type AppThemeId,
  DEFAULT_APP_THEME,
  isAppThemeId,
} from '../theme/themes'

const STORAGE_KEY = 'gameisup:appTheme'

function readStoredTheme(): AppThemeId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isAppThemeId(stored) ? stored : DEFAULT_APP_THEME
  } catch {
    return DEFAULT_APP_THEME
  }
}

export function useDeviceTheme(): [AppThemeId, (value: AppThemeId) => void] {
  const [themeId, setThemeId] = useState<AppThemeId>(readStoredTheme)

  const setDeviceTheme = useCallback((value: AppThemeId) => {
    setThemeId(value)
    try {
      window.localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Persisting is best-effort; the in-memory selection still applies.
    }
  }, [])

  return [themeId, setDeviceTheme]
}
