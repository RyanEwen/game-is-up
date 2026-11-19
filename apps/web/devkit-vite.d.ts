/**
 * Types for `@dynamic-solutions-canada/devkit/vite`, which devkit ships as plain JavaScript with
 * no declarations. Matches the JSDoc of `devkitViteServer` in devkit's src/vite.mjs; remove this
 * file once devkit publishes its own types.
 */
declare module '@dynamic-solutions-canada/devkit/vite' {
  export function devkitViteServer(env?: Record<string, string | undefined>): {
    port: number
    host: string | true
    allowedHosts: string[] | undefined
    watch: { ignored: string[] }
  }
}
