/**
 * Defines the Game's Up ports, data baseline, inherited local files, and runtime environment that
 * the shared devkit cannot derive from a checkout path.
 *
 * Counterpart: `scripts/dev/run-dev.mjs`, the only caller of `preflight()`.
 */
export default {
  /** The web port is first because devkit routes the checkout hostname to the block's base port. */
  ports: ['web', 'api'],

  /** Pin the PostgreSQL server version this project expects. */
  database: { engine: 'postgres', version: '16.13-bookworm' },

  /** Prisma migration state used by doctor and automatic database-baseline refreshes. */
  migrationsTable: '_prisma_migrations',

  /** Game's Up has no durable checkout-relative files that must accompany its database rows. */
  baselinePaths: [],

  /** A new worktree inherits required ignored local configuration without overwriting its own. */
  worktreeFiles: ['.env'],

  /** Map checkout-derived ports and origin onto the environment the existing servers consume. */
  env: ({ ports, url }) => ({
    API_PORT: String(ports.api),
    CLIENT_ORIGIN: url,
    DISCORD_CALLBACK_URL: `${url}/api/auth/discord/callback`,
    STEAM_CALLBACK_URL: `${url}/api/auth/steam/callback`,
    VITE_API_BASE_URL: '',
    VITE_API_PORT: String(ports.api),
    VITE_DEV_PORT: String(ports.web),
    VITE_PUBLIC_APP_URL: url
  })
}
