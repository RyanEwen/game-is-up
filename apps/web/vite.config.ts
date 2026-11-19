import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { devkitViteServer } from '@dynamic-solutions-canada/devkit/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { webBuildIdPlugin } from './webBuildIdPlugin.ts'
import { navigationCaching } from './serviceWorkerConfig.ts'

// Cache-busting version for the icon URLs. devkit-icons writes the PWA icons from assets/brand/
// (`npm run icons`); bump this, and the matching `?v=` in index.html, whenever the icon art changes.
const pwaIconVersion = '20261119'

/** Return process-level Vite variables so runner overlays win over values loaded from `.env`. */
function pickViteEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key, value]) => key.startsWith('VITE_') && value !== undefined,
    ),
  ) as Record<string, string>
}

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, fileURLToPath(new URL('../..', import.meta.url)), 'VITE_'),
    ...pickViteEnv(process.env),
  }
  const apiPort = env.VITE_API_PORT ?? '4000'

  return {
    cacheDir: '.vite',
    plugins: [
      react(),
      webBuildIdPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          navigateFallback: undefined,
          directoryIndex: null,
          globIgnores: ['**/build-id.json'],
          skipWaiting: true,
          runtimeCaching: [
            navigationCaching,
            {
              urlPattern: /^\/api\/media\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'game-media-v1',
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
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
              src: `/icon.svg?v=${pwaIconVersion}`,
              sizes: 'any',
              type: 'image/svg+xml',
            },
            {
              src: `/icon-192.png?v=${pwaIconVersion}`,
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: `/icon-512.png?v=${pwaIconVersion}`,
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: `/maskable-icon-192.png?v=${pwaIconVersion}`,
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: `/maskable-icon-512.png?v=${pwaIconVersion}`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    server: {
      // Port, bind address, routed hostnames and the .worktrees/ watch exclusion come from devkit.
      ...devkitViteServer(env),
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
        },
      },
    },
  }
})
