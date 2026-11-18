/**
 * SSE wiring that turns server-pushed invalidation events into refetch calls.
 *
 * Subscribes to `/api/events`, validates frames against the shared schema,
 * and invokes the registered per-domain refresh callbacks so the dashboard
 * stays current without per-tab polling.
 */

import { useEffect } from 'react'
import {
  dashboardInvalidationEventSchema,
  type DashboardInvalidationDomain,
} from '@game-is-up/shared'

/**
 * Subscribes to the authenticated dashboard SSE stream and invokes
 * `onInvalidation` with the parsed domain list whenever the server publishes
 * an invalidation event. Safely no-ops in non-browser environments and when
 * `enabled` is false. Malformed payloads are ignored so the next valid event
 * still triggers a refresh.
 *
 * Optional callbacks (`onOpen`) let callers piggy-back on connection events
 * without re-implementing the EventSource lifecycle.
 */
export function useDashboardSseInvalidation(options: {
  enabled: boolean
  buildApiUrl: (path: string) => string
  onInvalidation: (domains: DashboardInvalidationDomain[]) => void
  onOpen?: () => void
}) {
  const { enabled, buildApiUrl, onInvalidation, onOpen } = options

  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) {
      return
    }

    const eventSource = new EventSource(buildApiUrl('/api/events/dashboard'), {
      withCredentials: true,
    })

    if (onOpen) {
      eventSource.onopen = () => {
        onOpen()
      }
    }

    eventSource.onmessage = (messageEvent) => {
      try {
        const payload = dashboardInvalidationEventSchema.parse(
          JSON.parse(messageEvent.data) as unknown,
        )

        if (payload.domains.length > 0) {
          onInvalidation(payload.domains)
        }
      } catch {
        // Ignore malformed SSE payloads and rely on the next valid invalidation event.
      }
    }

    return () => {
      eventSource.close()
    }
  }, [enabled, buildApiUrl, onInvalidation, onOpen])
}
