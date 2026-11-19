/**
 * Mirrors web-app-kit's open-dialog stack into the app-busy registry, so the app never reloads
 * onto a new build while a dialog is open: an open dialog is nearly always a decision in progress.
 * Started once from `main.tsx`, beside `appBusyMutations.ts`.
 */
import {
  hasOpenBackAwareDialog,
  subscribeBackAwareDialogs,
} from '@dynamic-solutions-canada/web-app-kit'
import { setAppBusy } from './appBusy'

/** Start mirroring open dialogs into `appBusy`. Returns an unsubscribe function. */
export function trackDialogsAsAppBusy(): () => void {
  const sync = (): void => {
    setAppBusy('dialog-open', hasOpenBackAwareDialog())
  }
  sync()
  return subscribeBackAwareDialogs(sync)
}
