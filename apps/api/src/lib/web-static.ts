/**
 * Serves the built web app from the API in the production image (DIST-12), replacing the old
 * nginx web container. Development does not use it: Vite serves the app there.
 *
 * Cache rules keep installed PWAs updating (they match what the nginx container sent):
 * - hashed files under `/assets/` never change, so they are cached for a year as immutable;
 * - the app shell and the files update checks read (`index.html`, `sw.js`, `registerSW.js`,
 *   `manifest.webmanifest`, `build-id.json`) are `no-store`, so a new build is seen at once;
 * - any other GET that matches no file is a client-side route and gets `index.html`, `no-store`,
 *   unless its last path segment has a file extension (`/old-icon.png`): that is a missing file,
 *   so it is a `no-store` 404 rather than HTML under an image or script URL. No app route has a
 *   dot in its last segment (play-intent ids are UUIDs); keep it that way.
 *
 * Mounted after the `/api` 404, so an unknown API path never falls back to the app shell.
 */
import express, { type Express, type Response } from 'express'

/** Files that must always be fetched fresh, matched by their path's last segment. */
const alwaysFreshFiles = new Set([
  'index.html',
  'sw.js',
  'registerSW.js',
  'manifest.webmanifest',
  'build-id.json',
])

const noStore = 'no-store, no-cache, must-revalidate, proxy-revalidate'
const immutableYear = 'public, max-age=31536000, immutable'

/** A last path segment ending in a file extension, such as `icon.png`; `uuid.` does not count. */
const fileExtension = /\.[A-Za-z0-9]+$/

/**
 * True when a path that matched no file names a file rather than a client-side route: its last
 * segment has a file extension.
 */
export function looksLikeFilePath(urlPath: string): boolean {
  const lastSegment = urlPath.split('/').at(-1) ?? ''
  return fileExtension.test(lastSegment)
}

/** The Cache-Control header for a served file, by its URL path. */
export function cacheControlFor(urlPath: string): string | null {
  if (urlPath.startsWith('/assets/')) {
    return immutableYear
  }

  const fileName = urlPath.split('/').at(-1) ?? ''
  return alwaysFreshFiles.has(fileName) ? noStore : null
}

/** Mark a response as never cached, the way the app shell is sent. */
function setNoStore(response: Response): void {
  response.setHeader('Cache-Control', noStore)
  response.setHeader('Pragma', 'no-cache')
  response.setHeader('Expires', '0')
}

/**
 * Serve the web build in `distDir`: static files with the cache rules above, then the app shell
 * for every other GET.
 */
export function serveWebApp(app: Express, distDir: string): void {
  app.use(
    express.static(distDir, {
      index: false,
      // Cache-Control comes from `cacheControlFor`, not from express.static's max-age.
      cacheControl: false,
      setHeaders: (response) => {
        const header = cacheControlFor(response.req.path)

        if (header === noStore) {
          setNoStore(response)
        } else if (header) {
          response.setHeader('Cache-Control', header)
        }
      },
    }),
  )

  // A missing hashed asset is a 404, not the app shell, so a stale page fails visibly.
  app.get('/assets/{*path}', (_request, response) => {
    response.status(404).end()
  })

  app.get('/{*path}', (request, response) => {
    setNoStore(response)

    // A missing file is a 404, not the app shell; `no-store` keeps a CDN from caching the miss.
    if (looksLikeFilePath(request.path)) {
      response.status(404).end()
      return
    }

    response.sendFile('index.html', { root: distDir })
  })
}
