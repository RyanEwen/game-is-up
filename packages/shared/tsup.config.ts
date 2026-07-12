/**
 * Build config for the shared contracts package (ESM + CJS + bundled d.ts).
 *
 * The dts compilerOptions exist because tsup unconditionally injects
 * `baseUrl: "."` into its declaration build, and TypeScript 6 (which tsup
 * uses via the `typescript` alias while TS 7 has no programmatic API) treats
 * `baseUrl` as a hard deprecation error (TS5101) unless silenced.
 */
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  clean: true,
  dts: {
    compilerOptions: {
      ignoreDeprecations: '6.0'
    }
  }
})
