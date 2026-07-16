import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pwaIconVersion = '20260716'

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
        theme_color: '#101117',
        background_color: '#101117',
        display_override: ['window-controls-overlay', 'standalone'],
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: `/icon-wordmark-gold-bubble.svg?v=${pwaIconVersion}`,
            sizes: 'any',
            type: 'image/svg+xml'
          },
          {
            src: `/icon-wordmark-gold-bubble-192.png?v=${pwaIconVersion}`,
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: `/icon-wordmark-gold-bubble-512.png?v=${pwaIconVersion}`,
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: `/icon-wordmark-gold-bubble-maskable-192.png?v=${pwaIconVersion}`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: `/icon-wordmark-gold-bubble-maskable-512.png?v=${pwaIconVersion}`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
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