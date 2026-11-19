/**
 * The app's one TanStack Query client (UI-7). Server data is read and written through it.
 *
 * The defaults keep the app's existing refresh behaviour: data is not refetched on its own
 * (no staleness timer, no refetch on window focus or reconnect, no automatic retries).
 * Freshness comes from the dashboard's server-sent invalidation events and from mutations
 * invalidating what they changed, as before.
 */
import { QueryClient } from '@tanstack/react-query'

/** A client with the app's defaults; tests create their own the same way. */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export const queryClient = createAppQueryClient()
