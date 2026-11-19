/**
 * Build config for the shared contracts package (ESM + CJS + bundled d.ts).
 *
 * The dts compilerOptions exist because tsup unconditionally injects
 * `baseUrl: "."` into its declaration build, and TypeScript 6 (which tsup
 * uses via the `typescript` alias while TS 7 has no programmatic API) treats
 * `baseUrl` as a hard deprecation error (TS5101) unless silenced.
 *
 * Watch mode does not clean `dist`: the dev runner builds the package just before starting the
 * watchers, and cleaning would empty `dist` while the API watcher starts, so the API crashes on a
 * missing `dist/index.js` and never restarts.
 */
import { defineConfig } from 'tsup'

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  clean: !options.watch,
  dts: {
    compilerOptions: {
      ignoreDeprecations: '6.0',
    },
  },
}))
