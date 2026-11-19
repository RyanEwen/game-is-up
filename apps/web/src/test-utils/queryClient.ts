/**
 * TanStack Query clients for hook tests: the app's defaults, minus garbage-collection timers,
 * which would otherwise keep Node's test process alive for five minutes after the last test.
 * Call `clearTestQueryClients()` in `afterEach` so no cache leaks between tests.
 *
 * The client module is imported lazily, on the first call: TanStack decides at import time
 * whether it runs on a server (no `window`), so it must load after the test installs jsdom.
 */
import type { QueryClient } from '@tanstack/react-query'

const clients: QueryClient[] = []

/** A fresh client with the app's defaults and no cache timers. Call it after installing jsdom. */
export async function createTestQueryClient(): Promise<QueryClient> {
  const { createAppQueryClient } = await import('../lib/queryClient')
  const client = createAppQueryClient()
  const defaults = client.getDefaultOptions()
  client.setDefaultOptions({
    queries: { ...defaults.queries, gcTime: Number.POSITIVE_INFINITY },
    mutations: { ...defaults.mutations, gcTime: Number.POSITIVE_INFINITY },
  })
  clients.push(client)
  return client
}

/** Empty every client made since the last call. */
export function clearTestQueryClients(): void {
  for (const client of clients.splice(0)) {
    client.clear()
  }
}
