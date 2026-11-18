/**
 * Defines the Game's Up ports, data baseline, inherited local files, and runtime environment that
 * the shared devkit cannot derive from a checkout path.
 *
 * Counterpart: `scripts/dev/run-dev.mjs`, the only caller of `preflight()`.
 */
/** Fixed listeners inside every checkout container; Compose receives these through `env()`. */
export const DEV_PORTS = Object.freeze({
  api: '4000',
  web: '5173',
})

export default {
  /** The web port is first because devkit routes the checkout hostname to the block's base port. */
  ports: ['web'],

  /** Pin the PostgreSQL server version this project expects. */
  database: { engine: 'postgres', version: '16.13-bookworm' },

  /** Prisma migration state used by doctor and automatic database-baseline refreshes. */
  migrationsTable: '_prisma_migrations',

  /** Game's Up has no durable checkout-relative files that must accompany its database rows. */
  baselinePaths: [],

  /** A new worktree inherits required ignored local configuration without overwriting its own. */
  worktreeFiles: ['.env'],

  /** Replace a worktree's shared dependency link with a runtime-matched local install. */
  install: {
    command: ['npm', 'ci'],
    inputs: ['package.json', 'package-lock.json', '.nvmrc'],
    output: 'node_modules',
  },

  /** Open the proxied UI only after its API is ready to serve the application. */
  browser: { path: '/', healthPath: '/api/health' },

  /** Map checkout-derived ports and origin onto the environment the existing servers consume. */
  env: ({ url }) => ({
    API_PORT: DEV_PORTS.api,
    CLIENT_ORIGIN: url,
    DISCORD_CALLBACK_URL: `${url}/api/auth/discord/callback`,
    STEAM_CALLBACK_URL: `${url}/api/auth/steam/callback`,
    VITE_API_BASE_URL: '',
    VITE_API_PORT: DEV_PORTS.api,
    VITE_DEV_PORT: DEV_PORTS.web,
    VITE_PUBLIC_APP_URL: url,
  }),
}
