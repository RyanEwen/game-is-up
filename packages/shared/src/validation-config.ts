/**
 * Runtime settings for zod, applied when this package loads. It is the first import of
 * `index.ts`, so it runs before any schema in the package is created.
 *
 * zod 4 speeds up object parsing with generated code, and decides whether it may by calling
 * `new Function` once, when the first object schema is created. Under the web app's Content
 * Security Policy (`script-src 'self'`, no `unsafe-eval`) that probe is blocked and reported as a
 * CSP violation on every page load, even though zod catches it and falls back. In a browser,
 * `jitless` skips the probe (and the generated code, which the CSP forbids anyway). The API keeps
 * the faster parsing. zod keeps the setting on `globalThis`, so it covers every zod copy.
 */
import { config } from 'zod'

if ('document' in globalThis) {
  config({ jitless: true })
}
