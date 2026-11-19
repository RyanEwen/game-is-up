/**
 * Mirrors TanStack Query's in-flight mutations into the app-busy registry, so the app never
 * reloads onto a new build while a write is still in the air. Copied from store-sign-controller
 * (which copied printstream). Started once from `main.tsx`, against the app's query client.
 */
import type { QueryClient } from '@tanstack/react-query'
import { setAppBusy } from './appBusy'

/** Start mirroring mutation activity into `appBusy`. Returns an unsubscribe function. */
export function trackMutationsAsAppBusy(queryClient: QueryClient): () => void {
  const sync = (): void => {
    setAppBusy('mutations', queryClient.isMutating() > 0)
  }
  sync()
  return queryClient.getMutationCache().subscribe(sync)
}
