/**
 * Reloads only when the served web build differs from the page already loaded.
 * Worker activation and wake-up checks share this policy. Unknown/offline answers
 * leave the page alone; one recorded attempt per target prevents reload loops.
 * While the app is busy (a dialog open or a write in flight, see `appBusy.ts`) the reload
 * waits, and the check runs again once the app goes idle.
 */
import { isAppBusy, subscribeAppBusy } from './appBusy'
import { readLocalWebBuildId } from './webBuildId'

interface UpdateEnvironment {
  localBuildId: () => string | null
  servedBuildId: () => Promise<string | null>
  storage: () => Storage
  reload: () => void
  /** Whether a reload now would lose the user's work. */
  isBusy: () => boolean
  /** Call back on busy and idle transitions; returns an unsubscribe function. */
  onBusyChange: (listener: () => void) => () => void
}

/** Own one page's update checks, coalescing concurrent signals and reload attempts. */
export function createWebUpdateChecker(
  environment: UpdateEnvironment,
): () => Promise<void> {
  let checking: Promise<void> | null = null
  let reloading = false
  let stopWaitingForIdle: (() => void) | null = null
  const attemptKey = 'game-is-up:web-reload-target'

  /** Re-run the check once the app goes idle; at most one wait is registered at a time. */
  function checkWhenIdle(): void {
    if (stopWaitingForIdle) return
    stopWaitingForIdle = environment.onBusyChange(() => {
      if (environment.isBusy()) return
      stopWaitingForIdle?.()
      stopWaitingForIdle = null
      void run()
    })
  }

  async function check(): Promise<void> {
    const local = environment.localBuildId()
    if (!local || reloading) return
    try {
      const target = await environment.servedBuildId()
      if (!target) return
      const storage = environment.storage()
      if (target === local) {
        storage.removeItem(attemptKey)
        return
      }
      if (storage.getItem(attemptKey) === target) return
      if (environment.isBusy()) {
        checkWhenIdle()
        return
      }
      // If storage is unavailable, a reload could loop. Leave the page usable.
      storage.setItem(attemptKey, target)
      reloading = true
      environment.reload()
    } catch {
      // Offline or blocked storage is not evidence that this page needs a refresh.
    }
  }

  async function run(): Promise<void> {
    if (!checking) checking = check()
    try {
      await checking
    } finally {
      checking = null
    }
  }

  return run
}

/** Read a fresh build identity; this static probe must never enter the precache. */
async function fetchServedBuildId(): Promise<string | null> {
  const response = await fetch(`${import.meta.env.BASE_URL}build-id.json`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) return null
  const body = (await response.json()) as { buildId?: unknown }
  return typeof body.buildId === 'string' ? body.buildId.trim() || null : null
}

export const checkForWebUpdate = createWebUpdateChecker({
  localBuildId: readLocalWebBuildId,
  servedBuildId: fetchServedBuildId,
  storage: () => window.sessionStorage,
  reload: () => window.location.reload(),
  isBusy: isAppBusy,
  onBusyChange: subscribeAppBusy,
})
