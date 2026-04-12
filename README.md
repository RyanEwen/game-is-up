# Game Is Up

Game Is Up is a monorepo for a game-discovery PWA and Android wrapper. The initial scaffold includes:

- a Vite + React + Joy UI web app
- an Express + TypeScript API
- a Capacitor-based Android wrapper scaffold
- a shared package for contracts and schemas
- a Prisma schema targeting PostgreSQL
- a devcontainer with PostgreSQL and VS Code linting support
- workspace prompts, instructions, and hooks for repeatable agent-assisted work

## Workspace layout

```text
apps/
  android/    Capacitor wrapper package for the shared web app
  api/        Express API, Prisma schema, route modules
  web/        Vite React app, Joy UI shell, PWA config
packages/
  shared/     Shared Zod schemas, contracts, and domain types
.devcontainer/
  devcontainer.json
  compose.yml
.github/
  copilot-instructions.md
  instructions/
  prompts/
  hooks/
compose.yml
```

## Quick start

1. Open the repository in the devcontainer.
2. Copy `.env.development.example` to `.env` if you need local overrides outside the devcontainer.
3. Install dependencies:

   ```bash
   npm install
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

Optional: set `VITE_PUBLIC_APP_URL` when you want in-app invites to point at a public web URL, especially from the Android wrapper or any staging environment that is not directly shareable.

Optional: set `VITE_API_BASE_URL` to an explicit origin if the web app should call an API on a different host. Leave it empty when the app is served behind a reverse proxy on the same origin.

The dashboard uses route-backed tabs, so the main views live at `/`, `/library`, `/discovery`, and `/play`. In local development, a dev-only `/debug` tab is also available for bot, prompt, and notification diagnostics. Discord sign-in now preserves same-origin return URLs so a user can authenticate and land back on the view they started from.

For a clean local reset plus startup in one command, run:

```bash
npm run dev:fresh
```

## Validation

Run the full validation suite with:

```bash
npm run validate
```

That runs ESLint, TypeScript checks, and `prisma validate`.

## Database helpers

- `npm run db:wait` waits for the configured PostgreSQL host and port before starting app processes.
- `npm run db:migrate` creates and applies a new development migration after Prisma schema changes.
- `npm run db:migrate:deploy` applies the checked-in migrations to the target database.
- `npm run db:migrate:bootstrap` baselines an existing non-managed database at the checked-in baseline and then applies pending migrations.
- `npm run db:push` force-resets the dev database and applies the current Prisma schema. Keep this for disposable local resets only, not shared or production databases.
- `npm run db:seed` reloads the demo discovery dataset.
- In local development, a signed-in non-demo account with no friends yet is automatically linked to the seeded sample friends on the next session refresh so discovery and friend-driven UI can be tested without rebuilding the graph manually.
- `npm run db:generate` refreshes the Prisma client after schema changes.
- `npm run dev:fresh` waits for PostgreSQL, resets the schema, reseeds demo data, and starts the full stack.

Postgres is expected to run in Docker for both development and deployment, and the app uses the Compose service hostname: `postgresql://postgres:postgres@db:5432/game_is_up?schema=public`.

The development scripts default to that Docker network address unless you explicitly override `DATABASE_URL`.

## Production Docker

The repository now includes a root `compose.yml` for production-style local or server deployment.

1. Copy `.env.production.example` to `.env` and set at least `SESSION_SECRET` to a long random value.
2. For a real deployment, set `CLIENT_ORIGIN` to your public app URL and set `DISCORD_CALLBACK_URL` to `${CLIENT_ORIGIN}/api/auth/discord/callback`.
3. If you want the web container to proxy API traffic on the same origin, leave `VITE_API_BASE_URL` empty.
4. Build and start the stack:

  ```bash
  docker compose up --build -d
  ```

   If you serve the app through Cloudflare, you can follow the deploy with a targeted edge-cache purge:

  ```bash
  docker compose up --build -d && npm run cache:purge:cloudflare
  ```

5. Open the app on `http://localhost:8080` by default. If you need a different host port, set `PORT`, for example `PORT=9090 docker compose up --build -d`.

The public container runs unprivileged Nginx on internal port `8080`, and Docker maps host port `8080` to it by default. Nginx proxies `/api/*` to the API container so browser clients can stay same-origin in production.

The API container now bootstraps Prisma Migrate on startup: fresh databases get `prisma migrate deploy`, and existing pre-migrate databases are first baselined at the checked-in baseline migration and then migrated forward. The Compose stack includes a PostgreSQL service with persistent storage.

If you already run Nginx on the host, the default Docker publish target is already `8080`, so host Nginx can reverse proxy to that upstream directly.

For a host-Nginx setup, the important production values are:

- `CLIENT_ORIGIN=https://your-public-domain`
- `DISCORD_CALLBACK_URL=https://your-public-domain/api/auth/discord/callback`
- `VITE_API_BASE_URL=` so the frontend uses same-origin `/api`
- `PORT=8080` as the default host port behind Nginx

When the web app is built for same-origin production hosting with `VITE_API_BASE_URL=` empty, native Android login flows should still construct absolute OAuth entry URLs before calling the Capacitor browser plugin. Keep that behavior intact if the auth shell changes later.

For Cloudflare-backed deployments, the repo now includes a purge helper that reads the same root `.env` file used by Docker Compose. Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID`, then run `npm run cache:purge:cloudflare` after deployment. By default it purges the app shell URLs most likely to stay stale at the edge: `/`, `/index.html`, `/sw.js`, `/registerSW.js`, and `/manifest.webmanifest`.

If you need to add more URLs, set `CLOUDFLARE_PURGE_PATHS` as a comma-separated list or pass repeated `--path` flags, for example:

```bash
npm run cache:purge:cloudflare -- --path /discovery --path /library

Note: if you are purging route-backed dashboard pages, use `/discovery` rather than `/discover`.
```

For an emergency full-zone purge, run:

```bash
npm run cache:purge:cloudflare:everything
```

Prefer the targeted purge command for normal releases so long-lived hashed assets can stay cached.

This repo now treats Prisma migrations as the source of truth for schema changes. Use `db:migrate` to create new migrations during development and `db:migrate:deploy` for deployment targets.

## Discord OAuth setup

1. In the Discord developer portal, add your OAuth redirect URI.
2. For local development, use the callback in `.env.development.example` unless you intentionally change the API port.
3. Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_CALLBACK_URL` in your environment or `.env` file.
4. Start the app in the devcontainer and use the "Sign in with Discord" button in the web UI.
5. Discord sign-in now also requests the `guilds` scope so the app can sync which servers you share with other users.
6. After signing in, use the in-app Discord server controls to opt specific shared servers into discovery. Synced servers are excluded by default, and a server can only be selected once the bot is installed in that server.
7. Optional: set `DISCORD_BOT_TOKEN`, install the bot in shared Discord servers, and enable the Presence Intent in the Discord developer portal if you want lossy recording of currently played Discord games.
8. Bot-based activity tracking only records activity while the bot is online and present in a shared server, so it should be treated as opportunistic rather than authoritative history.
9. If you want the app to browse every member in a selected Discord server for invite targeting, the bot also needs the Server Members intent enabled in the Discord developer portal.
10. When a call to play matches someone who should be notified and that user has a linked Discord account, the bot can DM them directly.
11. Users can leave a Play page setting on by default so the bot can DM them after it sees them start a game and offer to create a call to play straight from Discord. Those prompts only go out when there is no active call already, at least one visible overlap could receive it, and the same game has not already prompted that user in the last 10 minutes.
12. Discovery-based play-intent visibility can now include both explicit friends and users from the Discord servers you opted into discovery.
13. Discord is the only sign-in path in this scaffold.
14. On Android, Discord sign-in opens in the system browser and returns to the app through the `gameisup://auth` deep link. For local development, keep `adb reverse` active so the installed app can still reach the local API while completing sign-in.

## Game catalog provider

The library search can query RAWG for broad multi-platform game data instead of being limited to any single storefront.

1. Create a RAWG API key at `https://rawg.io/apidocs`.
2. Set `RAWG_API_KEY` in your `.env` file or devcontainer environment.
3. If the key is missing, the app falls back to locally known games only.
4. Keep the RAWG attribution link visible anywhere RAWG-backed catalog results are shown.

Library entries now store one canonical game with one or more selected platform flags, instead of requiring one separate library row per platform.

When the Discord presence bot sees a user playing a game in a shared server, the API now keeps a lossy observed-game history and uses it to suggest likely library additions above the library grid. In local development, signed-in accounts with no personal observed history yet fall back to the seeded sample observations so the suggestion row can still be reviewed.

Users can also set one profile-level "when do you usually play" note and let individual games inherit it, while still attaching a game-specific schedule override when a title tends to happen at a different time.

## Repository automation

- `.husky/pre-commit` runs the validation suite before commits.
- `.github/copilot-instructions.md` defines workspace-wide coding guidance.
- `.github/instructions/` scopes additional guidance by area.
- `.github/prompts/` adds reusable prompts for vertical-slice work, provider adapters, commit workflow, and documentation audits.
- `.github/hooks/` adds Copilot hooks for session guidance, destructive-command protection, post-edit reminders, and targeted validation routing.

## Android devcontainer flow

The devcontainer now provisions Java 21 plus the Android SDK needed by the Capacitor wrapper.

- `npm run ensure --workspace @game-is-up/android` builds the web app, generates or syncs the local Android project, and writes `local.properties`.
- `npm run assemble:debug --workspace @game-is-up/android` builds a debug APK.
- `npm run assemble:debug:prod --workspace @game-is-up/android` builds a debug APK that loads the hosted production app at `https://app.example.com`.
- `npm run adb:reverse --workspace @game-is-up/android` maps Android `localhost:4000` back to the adb host for local API testing.
- `npm run install:debug --workspace @game-is-up/android` installs the debug build with `adb`.

For local USB testing against the devcontainer API, use `npm run install:debug:usb --workspace @game-is-up/android`.

Android Discord sign-in uses the system browser plus the app deep link instead of trying to finish OAuth inside the WebView. The browser returns to `gameisup://auth`, and the app then exchanges a short-lived mobile auth handoff with the API to establish the in-app session.

The generated `apps/android/android` project remains local and is not checked into git.

On ARM hosts, the devcontainer image also installs the `amd64` runtime libraries required for the Android toolchain's x86_64 binaries.

## Play intent model

Users are not limited to one active game when expressing play intent. A call to play can target:

- any game in the user library
- a selected subset of games

Calls to play can also control who sees them:

- explicit friends only
- the broader discovery audience formed by opted-in shared Discord servers, plus friends
- a specific hand-picked set of friends

Calls to play can start immediately or be scheduled for later, and they remain visible until the configured end time.

