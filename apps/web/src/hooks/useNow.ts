/**
 * The current time for rendering, from one shared clock that ticks every 30 seconds.
 *
 * Rendering must not read `Date.now()` (the React Compiler treats it as impure, and a label built
 * from it only changes when something else happens to re-render). Components call `useNow()`
 * instead: every caller reads the same store through `useSyncExternalStore`, so one timer serves
 * the whole page and time-based labels (scheduled versus live, recent windows) update on their own
 * within half a minute.
 *
 * The clock starts with its first subscriber and then keeps running while the page is visible,
 * so a newly mounted component never reads a stale time. While the tab is hidden it stops, and it
 * ticks at once when the tab becomes visible again.
 *
 * A decision made at a moment, such as validating a start time on save, reads `Date.now()` in its
 * event handler instead: the shared clock can be up to one tick behind.
 */
import { useSyncExternalStore } from 'react'

/** How often the shared clock advances, in milliseconds. */
export const nowTickMs = 30_000

/** What the clock needs from its environment; tests pass fakes. */
export type NowStoreEnvironment = {
  readNow: () => number
  setInterval: (callback: () => void, ms: number) => unknown
  clearInterval: (handle: unknown) => void
  /** The page's visibility; absent outside a browser. */
  document?: Pick<
    Document,
    'hidden' | 'addEventListener' | 'removeEventListener'
  >
}

/**
 * A clock store for `useSyncExternalStore`: `getSnapshot` returns the time of the last tick, and
 * `subscribe` starts the clock on first use.
 */
export function createNowStore(
  environment: NowStoreEnvironment,
  tickMs = nowTickMs,
) {
  const listeners = new Set<() => void>()
  let now = environment.readNow()
  let timer: unknown = null
  let started = false

  /** Advance to the current time and tell every subscriber. */
  function tick() {
    now = environment.readNow()
    for (const listener of listeners) {
      listener()
    }
  }

  function startTimer() {
    if (timer == null) {
      timer = environment.setInterval(tick, tickMs)
    }
  }

  function stopTimer() {
    if (timer != null) {
      environment.clearInterval(timer)
      timer = null
    }
  }

  /** Stop while the tab is hidden; on return, catch up at once and resume. */
  function handleVisibilityChange() {
    if (environment.document?.hidden) {
      stopTimer()
      return
    }

    tick()
    startTimer()
  }

  /** Start the clock with its first subscriber; it then runs for the life of the page. */
  function start() {
    if (started) {
      return
    }

    started = true
    now = environment.readNow()
    environment.document?.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    if (!environment.document?.hidden) {
      startTimer()
    }
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      start()
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return now
    },
  }
}

const sharedNowStore = createNowStore({
  readNow: () => Date.now(),
  setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  clearInterval: (handle) =>
    globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
  document: typeof document === 'undefined' ? undefined : document,
})

/** The current time in milliseconds, as of the shared clock's last tick. */
export function useNow(): number {
  return useSyncExternalStore(
    sharedNowStore.subscribe,
    sharedNowStore.getSnapshot,
    sharedNowStore.getSnapshot,
  )
}
