import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  cacheDir: '.vite',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /^\/api\/media\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-media-v1',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 30 * 24 * 60 * 60
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      manifest: {
        name: "Game's Up",
        short_name: "Game's Up",
        description: 'Find players who want to queue the same games as you.',
        theme_color: '#070b14',
        background_color: '#070b14',
        display_override: ['window-controls-overlay', 'standalone'],
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000'
      }
    }
  }
})