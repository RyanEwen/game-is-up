import { registerSW } from 'virtual:pwa-register'

let serviceWorkerRegistration: ServiceWorkerRegistration | null = null
let updateEventListenersRegistered = false

function checkForUpdates() {
  void serviceWorkerRegistration?.update()
}

export function checkForAppUpdate() {
  checkForUpdates()
}

export function registerAppServiceWorker() {
  if (typeof window === 'undefined') {
    return
  }

  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateServiceWorker(true)
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
    }
  })
}