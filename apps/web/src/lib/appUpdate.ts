/** Worker activation and wake-up signals check actual page staleness before reloading. */
import { registerSW } from 'virtual:pwa-register'
import { checkForWebUpdate } from './webUpdate'

let serviceWorkerRegistration: ServiceWorkerRegistration | null = null
let updateEventListenersRegistered = false

function checkForUpdates() {
  // Offline update checks are expected to fail; the next wake or poll retries.
  void serviceWorkerRegistration?.update().catch(() => {})
  void checkForWebUpdate()
}

/** Check both the worker and the served page after a suspected stale asset. */
export function checkForAppUpdate() {
  checkForUpdates()
}

/** Register once and keep long-lived tabs current when they wake or regain connectivity. */
export function registerAppServiceWorker() {
  if (typeof window === 'undefined') {
    return
  }

  registerSW({
    immediate: true,
    onNeedReload() {
      void checkForWebUpdate()
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) {
        return
      }

      serviceWorkerRegistration = registration
      checkForUpdates()

      if (updateEventListenersRegistered) {
        return
      }

      updateEventListenersRegistered = true

      window.setInterval(checkForUpdates, 60 * 1000)
      window.addEventListener('focus', checkForUpdates)
      window.addEventListener('online', checkForUpdates)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkForUpdates()
        }
      })
    },
  })
}
