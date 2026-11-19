/**
 * Whether this tab is in the middle of something a reload would destroy.
 *
 * One caller reads it: `webUpdate.ts`, which reloads the tab onto a new build and must wait
 * while the user has a dialog open or a write in flight. A scripted reload fires no `beforeunload` prompt, so
 * nothing else would catch a badly timed one. Copied from store-sign-controller, whose shape
 * and names follow printstream's `lib/appBusy.ts`.
 *
 * The source list is a closed union so a new kind of losable work has to name itself here.
 */
export type AppBusySource =
  /** Any dialog is open (web-app-kit's dialog stack, `lib/appBusyDialogs.ts`): nearly always a decision in progress. */
  | 'dialog-open'
  /** Any TanStack Query mutation in flight (`lib/appBusyMutations.ts`). */
  | 'mutations'

/** How many holders each source has; holds can overlap. */
const holders = new Map<AppBusySource, number>()
const listeners = new Set<() => void>()

/** Notify listeners only when the overall busy state flips. */
function update(source: AppBusySource, count: number): void {
  const wasBusy = isAppBusy()
  if (count > 0) {
    holders.set(source, count)
  } else {
    holders.delete(source)
  }
  if (wasBusy !== isAppBusy()) {
    for (const listener of listeners) listener()
  }
}

/**
 * Mark a source busy or idle outright. Idempotent, for callers that mirror a state.
 * @param source What is busy.
 * @param busy Whether it now holds losable work.
 */
export function setAppBusy(source: AppBusySource, busy: boolean): void {
  update(source, busy ? 1 : 0)
}

/**
 * Hold a source busy until the returned release runs; releasing twice is harmless.
 * @param source What is busy.
 * @returns The release function.
 */
export function holdAppBusy(source: AppBusySource): () => void {
  update(source, (holders.get(source) ?? 0) + 1)
  let released = false
  return () => {
    if (released) {
      return
    }
    released = true
    update(source, (holders.get(source) ?? 1) - 1)
  }
}

/** True when any source holds work a reload would lose. */
export function isAppBusy(): boolean {
  return holders.size > 0
}

/** Subscribe to busy and idle transitions. Returns an unsubscribe function. */
export function subscribeAppBusy(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test seam: drop all registered busy state. */
export function resetAppBusyForTests(): void {
  holders.clear()
  listeners.clear()
}
