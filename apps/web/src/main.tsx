import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateServiceWorker(true)
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) {
      return
    }

    const checkForUpdates = () => {
      void registration.update()
    }

    checkForUpdates()
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)