# Development

How to set up, run, test and change Game's Up locally. Deployment is in [deployment.md](deployment.md); how the product behaves is in [behaviour.md](behaviour.md); structure and data flow are in [ARCHITECTURE.md](../ARCHITECTURE.md).

## Stack

- a Vite + React + Joy UI web app
- an Express + TypeScript API
- a shared package for contracts and schemas
- a Prisma schema targeting PostgreSQL
- a devkit-managed development stack with Node and PostgreSQL

## Workspace layout

```text
apps/
  api/        Express API, Prisma schema, route modules
  web/        Vite React app, Joy UI shell, PWA config
packages/
  shared/     Shared Zod schemas, contracts, and domain types
docker/dev/    Development process image
.agents/
  guides/      Agent topic guides
  skills/      Agent workflows
.claude/
  skills       Symlink to .agents/skills
assets/        Generated brand exports (README icon)
docs/          Development, deployment and behaviour docs
scripts/       Dev, test, icon and deploy scripts
AGENTS.md      Agent instructions
compose.dev.yml       Development stack (devkit)
compose.example.yml   Production stack template
```

## Quick start

1. Copy `.env.development.example` to `.env` if you need local overrides.
2. Select the exact Node and npm toolchain, then install dependencies:

   ```bash
   nvm install
   nvm use
   npm install
   ```

3. Bootstrap Devkit once on this machine:

   ```bash
   npm run dev:bootstrap
   ```

4. Generate the Prisma client:

   ```bash
   npm run db:generate
   ```

5. Wait for the configured database to become reachable:

  ```bash
  npm run db:wait
  ```

6. Apply the checked-in migrations and seed demo data:

  ```bash
  npm run db:migrate:deploy
  npm run db:seed
  ```

7. Start the workspace:

   ```bash
   npm run dev
   ```

Optional: set `VITE_PUBLIC_APP_URL` when you want in-app invites to point at a public web URL, especially from any staging environment that is not directly shareable.

Optional: set `VITE_API_BASE_URL` to an explicit origin if the web app should call an API on a different host. Leave it empty when the app is served behind a reverse proxy on the same origin.

For a clean local reset plus startup in one command, run:

```bash
npm run dev:fresh
```

## Multi-checkout development (optional)

Devkit gives each host checkout and Git worktree a derived `.localhost` URL and private Compose stack containing Node and PostgreSQL. The primary checkout uses `game-is-up.localhost`; worktrees use `<worktree>.game-is-up.localhost`.

```bash
npm run dev:bootstrap             # once per host machine
npm run dev:host -- snapshot      # once in the primary checkout, after preparing its dev data
npm run dev
```

On startup, `npm run dev` inherits a missing `.env` from the primary checkout, replaces a missing or shared dependency tree with a checkout-local `npm ci`, runs Devkit's preflight, overlays the derived database, port, origins, and Vite settings, applies checked-in Prisma migrations, builds the shared package, and starts the shared/API/web watchers in the checkout's source-mounted Node container. A standalone clone still needs an initial `npm install` to install Devkit itself. The routed and direct URLs are printed before watcher output. An existing worktree `.env` is never overwritten, and the proxy route is removed when the runner exits.

The baseline contains the database only. Game's Up has no checkout-relative filesystem data to snapshot. `npm run db:seed` replaces the demo dataset in the current database; run it before `npm run dev:host -- snapshot` when new worktrees should begin with that seeded state. A worktree reset restores that portable SQL baseline; `npm run dev:host -- reset -- --empty` instead creates an empty database, then normal startup applies the migrations. Devkit refuses to reset the primary checkout because it owns the source development data.

Useful commands:

- `npm run dev:doctor` reports prerequisites and their fixes.
- `npm run dev:prepare-worktree` inherits missing local configuration and installs checkout-local dependencies without starting Docker or the application.
- `npm run dev:background` starts the same development runner detached, prints its PID and log path after preflight succeeds, and returns control to the terminal. Application readiness still depends on the container finishing its database preparation and watcher startup.
- `npm run dev:host -- snapshot` refreshes the project database baseline.
- `npm run dev:host -- reset` recreates a worktree database volume from that baseline.
- `npm run dev:host -- prune` lists volumes whose worktrees no longer exist.
- `npm run dev:host -- infra` restarts the machine proxy and this checkout's PostgreSQL container.
- `npm run dev:down` removes this checkout's containers and network while preserving its database volume.

Paseo reads `paseo.json` to prepare new worktrees automatically and stop their checkout stack on teardown. The configuration also exposes foreground `dev`, detached `dev-background`, `dev-down`, preparation, diagnostics, validation, and build scripts. Use foreground `dev` for Paseo's running status and Stop control. A completed `dev-background` launcher leaves its runner active until `dev-down` is run. Run `npm run dev:bootstrap` once on each host before using the development scripts; bootstrap also places `devkit` on the host PATH for setup in worktrees without dependencies.

Devkit itself (runtime selection, worktree cleanup, remote hosts and secondary domains) is documented in [devkit's README](https://github.com/RyanEwen/devkit#readme).

## Validation

Run the full validation suite with:

```bash
npm run validate
```

That runs ESLint, the TypeScript checks of every workspace, every unit test (`npm test`), and `prisma validate`.

`npm test` discovers every `*.test.ts` under `apps/`, `packages/` and `scripts/`. The database integration tests skip unless `RUN_ACCOUNT_HUB_DATABASE_TESTS=1` and `RUN_INVITE_DATABASE_TESTS=1` are set against a disposable database.

## Brand icons

The Game's Up brand icons live in `apps/web/public` and are generated by `scripts/dev/generate-brand-icons.mjs` (geometry authored in the script, wordmark set in the vendored Archivo Black font and converted to path outlines, PNGs rendered with `@resvg/resvg-js`):

```bash
npm run web:icons:export
```

That regenerates the full set:

- `icon-wordmark-gold-bubble` (SVG + 1024/512/192 PNG): app, PWA, and Discord server icon
- `icon-wordmark-gold-bubble-maskable` (SVG + 512/192 PNG): PWA maskable variant with the art at 80% safe area
- `icon-up-bang` (SVG + 64 PNG): small-size favicon cut ("UP!" only)
- `icon-gold-ping-bot` (SVG + 1024/512 PNG): Discord bot avatar upload

Because the text is outlined, the emitted SVGs have no font dependency and rasterize identically everywhere. After changing icon art or references, bump the icon version query string in `apps/web/vite.config.ts` and `apps/web/index.html` so installed clients refetch the new assets.

The same script also writes `assets/generated/icon-256.png` (the README header) and `icon-512.png` (website and promo catalog).

## Database helpers

- `npm run db:wait` waits for the configured PostgreSQL host and port before starting app processes.
- `npm run db:migrate` creates and applies a new development migration after Prisma schema changes.
- `npm run db:migrate:deploy` applies the checked-in migrations to the target database.
- `npm run db:migrate:bootstrap` baselines an existing non-managed database at the checked-in baseline and then applies pending migrations.
- `npm run db:push` force-resets the dev database and applies the current Prisma schema. Keep this for disposable local resets only, not shared or production databases.
- `npm run db:seed` reloads the demo discovery dataset.
- In local development, seeded sample discovery and call-to-play data are only rebound after an admin signs in. That admin account is linked to the seeded sample friends, and seeded server-scoped or targeted calls to play are retargeted onto the admin's real bot-visible Discord network when possible so discovery and play-intent flows can be tested without exposing sample data to signed-out or non-admin users.
- `npm run db:generate` refreshes the Prisma client after schema changes.
- `npm run dev:fresh` waits for PostgreSQL, resets the schema, reseeds demo data, and starts the full stack.

Postgres runs in Docker for both development and deployment, and the app reaches it through the Compose service hostname `db`. Development uses the local default `postgresql://postgres:postgres@db:5432/game_is_up?schema=public`; deployment builds the URL from the required `POSTGRES_PASSWORD`.

The development scripts default to that Docker network address unless you explicitly override `DATABASE_URL`.

## Discord OAuth setup

1. In the Discord developer portal, add your OAuth redirect URI.
2. For local development, use the callback in `.env.development.example` unless you intentionally change the API port.
3. Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_CALLBACK_URL` in your environment or `.env` file. In Devkit host mode the runner replaces the callback with `http://game-is-up.localhost/api/auth/discord/callback` in the primary checkout, or the corresponding `<worktree>.game-is-up.localhost` URI in a worktree. Discord requires an exact redirect URI match, so sign-in only works after that checkout-specific URI is registered in the Discord developer portal. Use `DEVKIT=0 npm run dev` when you need the single registered fixed-port callback instead.
4. Start the app with `npm run dev` and use the "Sign in with Discord" button in the web UI.
5. Discord sign-in also requests the `guilds` scope so the app can sync which servers you share with other users.
6. After signing in, use the in-app Discord server controls to opt specific shared servers into discovery. Synced servers are excluded by default, and a server can only be selected once the bot is installed in that server.
7. If you join a new Discord server or install the bot into one after you have already signed in, use the Network page's `Refresh Discord servers` action to re-sync your server list without signing out.
8. Optional: set `DISCORD_BOT_TOKEN` if you want the app to send Discord DMs. Set `DISCORD_BOT_MODE=gateway` only in the one environment that should own the live gateway connection for presence tracking and interactive bot flows.
9. If you need to reuse that same bot token locally while production still owns the gateway connection, set `DISCORD_BOT_MODE=rest` in development. That mode supports DM send/edit plus read-only server and member browsing without opening a second live gateway session.
10. Development emulates Discord DM send, edit, and delete by default even when the bot token is configured. Set `DISCORD_SEND_REAL_DMS_IN_DEV=true` only when you explicitly want a dev environment to deliver live Discord DMs.
11. Install the bot in shared Discord servers and enable the Presence Intent in the Discord developer portal if you want lossy recording of currently played Discord games from the gateway-owning environment.
12. Bot-based activity tracking only records activity while the bot is online and present in a shared server, so it should be treated as opportunistic rather than authoritative history.
13. If you want the app to browse every member in a selected Discord server for invite targeting, the bot also needs the Server Members intent enabled in the Discord developer portal.

How the bot behaves once it is set up (calls to play, DMs, slash commands, cleanup) is in [behaviour.md](behaviour.md#discord).

## Steam import setup

1. Create a Steam Web API key at `https://steamcommunity.com/dev/apikey`.
2. Set `STEAM_WEB_API_KEY` and `STEAM_CALLBACK_URL` in your environment or `.env` file.
3. For local development, use the callback in `.env.development.example` unless you intentionally change the API port. Devkit host mode instead uses the routed checkout origin at `/api/auth/steam/callback`; Steam verifies that dynamic return URL and realm. If the provider setup cannot accept the checkout-specific URL, use `DEVKIT=0 npm run dev` for the fixed callback.

How the import picker and title matching behave is in [behaviour.md](behaviour.md#steam-import).

## Game catalog provider

The library search can query RAWG for broad multi-platform game data instead of being limited to any single storefront.

1. Create a RAWG API key at `https://rawg.io/apidocs`.
2. Set `RAWG_API_KEY` in your `.env` file.
3. If the key is missing, the app falls back to locally known games only.
4. Keep the RAWG attribution link visible anywhere RAWG-backed catalog results are shown.
## Repository automation

- `AGENTS.md` and nested `AGENTS.md` files define agent guidance at workspace, web, API, and Prisma scopes.
- `.agents/guides/` holds topic guides, starting with the UI conventions.
- `.agents/skills/` provides reusable agent workflows for documentation audits, commits, and deployments; `.claude/skills` links to it.
