/**
 * Auto-dismisses a `Notice` after a TTL, keeping the dashboard banners
 * disposable without requiring callers to manage their own timers.
 */

import type { Dispatch, SetStateAction } from 'react'
import { useEffect } from 'react'
import type { Notice } from '../components/dashboard/types'

/**
 * Auto-dismiss a transient `Notice` after a short delay so callers don't have
 * to wire up timers themselves. Cancels the pending timeout if the notice
 * changes (or unmounts) before it fires.
 */
export function useTimedNotice(
  notice: Notice | null,
  setNotice: Dispatch<SetStateAction<Notice | null>>,
): void {
  useEffect(() => {
    if (!notice) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setNotice(null)
    }, 5000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [notice, setNotice])
}
