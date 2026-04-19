# Game's Up

Game's Up is a monorepo for a game-discovery PWA. The initial scaffold includes:

- a Vite + React + Joy UI web app
- an Express + TypeScript API
- a shared package for contracts and schemas
- a Prisma schema targeting PostgreSQL
- a devcontainer with PostgreSQL and VS Code linting support
- workspace prompts, instructions, and hooks for repeatable agent-assisted work

## Workspace layout

```text
apps/
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

Optional: set `VITE_PUBLIC_APP_URL` when you want in-app invites to point at a public web URL, especially from any staging environment that is not directly shareable.

Optional: set `VITE_API_BASE_URL` to an explicit origin if the web app should call an API on a different host. Leave it empty when the app is served behind a reverse proxy on the same origin.

The dashboard uses route-backed tabs, so the main views live at `/`, `/library`, `/discovery`, and `/play`. Admin users also get a `/debug` tab for bot, prompt, notification, DM-emulator, and invite-attribution diagnostics. Discord sign-in now preserves same-origin return URLs so a user can authenticate and land back on the view they started from, and invite links can land on a dedicated `/invite` route before handing off into Discord OAuth.

Signed-in dashboard sessions now also keep themselves fresh through a same-origin Server-Sent Events invalidation stream. When impactful shared state changes land on the API, open tabs can automatically reload discovery, play, library, network, and session data without a polling loop.

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
- In local development, seeded sample discovery and call-to-play data are only rebound after an admin signs in. That admin account is linked to the seeded sample friends, and seeded server-scoped or targeted calls to play are retargeted onto the admin's real bot-visible Discord network when possible so discovery and play-intent flows can be tested without exposing sample data to signed-out or non-admin users.
- `npm run db:generate` refreshes the Prisma client after schema changes.
- `npm run dev:fresh` waits for PostgreSQL, resets the schema, reseeds demo data, and starts the full stack.

Postgres is expected to run in Docker for both development and deployment, and the app uses the Compose service hostname: `postgresql://postgres:postgres@db:5432/game_is_up?schema=public`.

The development scripts default to that Docker network address unless you explicitly override `DATABASE_URL`.

## Production Docker

The repository now includes a root `compose.yml` for production-style local or server deployment.
Keep any `compose.prod.yml` override out of the repository; that file is intended to exist only on the production server when you need host-specific Compose overrides.

1. Copy `.env.production.example` to `.env` and set at least `SESSION_SECRET` to a long random value.
2. For a real deployment, set `CLIENT_ORIGIN` to your public app URL and set `DISCORD_CALLBACK_URL` to `${CLIENT_ORIGIN}/api/auth/discord/callback`.
3. If you want Play composer calls to create temporary Discord channels in the Game's Up Discord server, also set `DISCORD_SERVER_ID` to that server's guild id.
4. If you want the web container to proxy API traffic on the same origin, leave `VITE_API_BASE_URL` empty.
5. Build and start the stack:

  ```bash
  docker compose up --build -d
  ```

   If you serve the app through Cloudflare, you can follow the deploy with a targeted edge-cache purge:

  ```bash
  docker compose up --build -d && npm run cache:purge:cloudflare
  ```

6. Open the app on `http://localhost:8080` by default. If you need a different host port, set `PORT`, for example `PORT=9090 docker compose up --build -d`.

For a minimal SSH-driven deployment from your local workspace, the repo now includes:

```bash
npm run deploy:prod:ssh -- --push
```

That script:

- runs `npm run validate` locally by default
- optionally pushes local `HEAD` to the target branch when you pass `--push`
- SSHes into the production host
- refuses to deploy if the remote repo has tracked uncommitted changes
- runs `docker compose -f compose.yml -f compose.prod.yml up --build -d` in the remote checkout when a server-only `compose.prod.yml` exists there
- runs `npm run cache:purge:cloudflare` on the server after deploy when the remote `.env` includes the required Cloudflare values

Default SSH deployment values are:

- host: `deploy@server.example`
- port: `22`
- repo path: `/srv/game-is-up`
- branch: `main`

Override them with flags such as `--host`, `--port`, `--repo-path`, `--branch`, `--compose-file`, and `--ssh-key`, or with the env vars `DEPLOY_SSH_HOST`, `DEPLOY_SSH_PORT`, `DEPLOY_REPO_PATH`, `DEPLOY_GIT_BRANCH`, `DEPLOY_COMPOSE_FILES`, and `DEPLOY_SSH_KEY`. Pass `--compose-file` multiple times when you need an exact Compose stack, for example `--compose-file compose.yml --compose-file compose.prod.yml`. If you need to bypass the post-deploy purge for an emergency rollout, pass `--skip-cache-purge`.

If you omit `--ssh-key`, the deploy script falls back to your normal SSH authentication setup, which may use your default key or prompt for a password.

If you want a dedicated deployment key, create one locally and add the public key to `~/.ssh/authorized_keys` for the deploy user on the server:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/game-is-up-prod
npm run deploy:prod:ssh -- --push --ssh-key ~/.ssh/game-is-up-prod
```

The public container runs unprivileged Nginx on internal port `8080`, and Docker maps host port `8080` to it by default. Nginx proxies `/api/*` to the API container so browser clients can stay same-origin in production.

The API container now bootstraps Prisma Migrate on startup: fresh databases get `prisma migrate deploy`, and existing pre-migrate databases are first baselined at the checked-in baseline migration and then migrated forward. The Compose stack includes a PostgreSQL service with persistent storage.

If you already run Nginx on the host, the default Docker publish target is already `8080`, so host Nginx can reverse proxy to that upstream directly.

For a host-Nginx setup, the important production values are:

- `CLIENT_ORIGIN=https://your-public-domain`
- `DISCORD_CALLBACK_URL=https://your-public-domain/api/auth/discord/callback`
- `VITE_API_BASE_URL=` so the frontend uses same-origin `/api`
- `PORT=8080` as the default host port behind Nginx

When the web app is built for same-origin production hosting with `VITE_API_BASE_URL=` empty, client auth flows should still construct absolute OAuth entry URLs so redirects remain stable behind reverse proxies and alternate origins.

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
7. Optional: set `DISCORD_BOT_TOKEN` if you want the app to send Discord DMs. Set `DISCORD_BOT_MODE=gateway` only in the one environment that should own the live gateway connection for presence tracking and interactive bot flows.
8. If you need to reuse that same bot token locally while production still owns the gateway connection, set `DISCORD_BOT_MODE=rest` in development. That mode supports DM send/edit plus read-only server and member browsing without opening a second live gateway session.
9. Development now emulates Discord DM send, edit, and delete by default even when the bot token is configured. Set `DISCORD_SEND_REAL_DMS_IN_DEV=true` only when you explicitly want a dev environment to deliver live Discord DMs.
10. Install the bot in shared Discord servers and enable the Presence Intent in the Discord developer portal if you want lossy recording of currently played Discord games from the gateway-owning environment.
11. Bot-based activity tracking only records activity while the bot is online and present in a shared server, so it should be treated as opportunistic rather than authoritative history.
12. If you want the app to browse every member in a selected Discord server for invite targeting, the bot also needs the Server Members intent enabled in the Discord developer portal.
13. When a call to play matches someone who should be notified and that user has a linked Discord account, the bot can DM them directly. Quick response buttons in Discord are only active in the gateway-owning environment.
14. If a notified recipient marks themselves interested from Discord, the creator gets a follow-up DM confirmation. Recipients can also choose Pass without notifying the creator, and can still switch to interested later. The original recipient invite stays in place and updates its buttons to match the current choice, while a separate recipient confirmation DM below it is reused as a single rolling acknowledgement instead of stacking a new confirmation each time the user changes their mind. Recipients who already have an overlapping active call to play are still filtered out before those call notifications are sent.
15. Calls to play can optionally request temporary Discord channels in the Game's Up Discord server. People who are already in that server get channel links immediately, people who join later can be granted access on demand, and creators can delete the retained channels early after the call ends.
16. Users can leave a Play page setting on by default so the gateway-owning bot can DM them after it sees them start a game and offer to create a call to play straight from Discord. Those prompts only go out when there is no active call already, at least one visible overlap could receive it, and the same game has not already prompted that user in the last 10 minutes.
17. Unanswered Discord call-to-play invites and auto-play prompts are edited in place when they go stale, so users see that the session ended or the observed game activity stopped instead of keeping an outdated call to action. Manual call-to-play cancellations and clears instead replace audience DMs with a fresh ended-summary message so Discord sends a new notification, and retained ended summaries can expose an `Archive` action when interactive Discord buttons are available.
18. Scheduled calls to play still notify the target audience immediately when created. At start time, the creator now gets a check-in prompt to confirm whether the plan is still on.
19. If the creator confirms, users who already accepted get a go-time update and users who never answered get one follow-up reminder. Those go-time DMs stay actionable: accepted recipients can back out with a `No longer interested` action, unanswered recipients still get the normal `I'm interested` and `Pass` actions, the messages include the current interested count and interested-user list where relevant, and they still skip recipients who already declined or muted that creator. The creator check-in prompt itself now stays in place with its buttons removed, and the confirm or close acknowledgement arrives as a separate message below it.
20. When a call to play is created, the creator also gets a persistent Discord DM summary. Major lifecycle updates can still replace that DM with a fresh message so Discord emits a notification, but audience response updates now edit the existing summary in place because the creator also receives a separate response-notification DM. Quiet expiry or archive cleanup also falls back to edit-in-place behavior, and expired retained summaries can switch to an archive action for the creator. In the gateway-owning environment, active summaries still include a creator-only cancel button.
21. For active single-game calls to play, the gateway-owning bot now sends one launch alert when the creator starts that game and one launch alert to the creator each time an already-interested audience member initially starts it. Those alerts are one-time per active call and reset when the call changes.
22. Call-to-play DMs now use natural local time phrasing such as `Friday Apr 17th at 10pm, for 2 hours` instead of raw timezone-abbreviation ranges.
23. Admin users can inspect a DM emulator in the debug surface and from Play cards. That emulator shows the latest thread state plus derived revisions for tracked call-to-play DMs, and the debug view now includes a DM template library for the major Discord DM flows with a self-send sample action for each template.
24. Structured Discord DMs now prefer embed layouts where that feels natural, and the debug DM emulator mirrors those embed payloads, fields, images, and buttons so admin previews match the live bot output more closely.
25. Admin users can also post a self-only test call to play from the Play composer. That path targets only the creator for the audience-facing DM flow instead of adding the creator onto the normally selected audience.
26. Bot-authored Discord DMs tied to tracked call-to-play and auto-play flows still participate in retention cleanup, but call-to-play threads now retain one ended-history DM per user and per call to play instead of deleting the entire thread state until a user explicitly archives or cleans them up.
27. In the gateway-owning environment, linked users can also send the bot DM commands for lightweight control without reopening the app: `help`, `status`, `cancel`, `autoplay`, and `cleanup`. The `cleanup` command removes older bot-authored DM clutter in that thread and keeps at most the newest still-active tracked bot message.
28. In that same gateway-owning environment, the bot also registers guild-only slash commands for adoption flows: `invite-user`, `invite-link`, `app-members`, and `server-ctps`.
29. Discord invite links now open a dedicated invite landing page, preserve server and inviter context through Discord OAuth, and can attribute a first accepted sign-in back to the originating Discord invite.
30. Admin debug now includes an invite-attribution section so recent accepted invite flows can be verified without querying the database directly.
31. The Play view keeps recently ended calls to play visible for 24 hours as closed cards, shows whether each call currently applies to your library, and only leaves response actions enabled while the call is still active and applicable.
32. Calls to play now also have dedicated `/play/:playIntentId` detail pages. Discord DMs can deep-link straight into a specific call, Play cards expose an Open details action, and library-wide calls expand the actual game options on that page so recipients can see what overlaps are in scope before they respond.
33. Discovery-based play-intent visibility can now include both explicit friends and users from the Discord servers you opted into discovery.
34. Discovery remains based on opted-in shared Discord servers plus explicit in-app friendships. The Discord friend-list import path has been removed.
35. Discord is still the only sign-in path in this scaffold.
36. Steam can now be linked as a secondary account for library import only. It does not replace Discord auth or discovery.
37. Linked-account flows like Discord sign-in and Steam linking return directly to the current web URL after the provider callback completes.
38. Call-to-play DMs now include a clickable creator Discord mention when available.
39. Subset call-to-play DMs can include game art for small selected-game sets: single-game calls show the chosen cover directly, and small multi-game sets show a lead cover with a short title list.
40. Signed-in web sessions now subscribe to an authenticated dashboard SSE stream so open tabs refresh automatically after impactful changes such as play-intent updates, library edits, friend changes, Discord server selection changes, and linked-account or profile updates.

## Steam import setup

1. Create a Steam Web API key at `https://steamcommunity.com/dev/apikey`.
2. Set `STEAM_WEB_API_KEY` and `STEAM_CALLBACK_URL` in your environment or `.env` file.
3. For local development, use the callback in `.env.development.example` unless you intentionally change the API port.
4. Sign in with Discord first, open the Library tab, then use the Add games from Steam button to connect Steam and preview owned games.
5. Steam import respects the existing library model: the app shows a picker first and only imports the titles the user selects.
6. Steam import normalizes punctuation, trademark markers, and similar storefront-only title differences before matching against existing catalog games, so reused RAWG-backed games can keep the Steam source plus the original Steam spelling as an alias.
7. The same normalized-title matching is also used when the app records Discord-observed activity, and API startup now repairs previously split duplicate game rows that only differ by storefront-only title decoration such as trademark symbols.
8. Steam may return no importable games when the account's game details are private or effectively unavailable to the API, so manual add should remain the fallback.

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

## Play intent model

Users are not limited to one active game when expressing play intent. A call to play can target:

- any game in the user library
- a selected subset of games

Calls to play can also control who sees them:

- explicit friends only
- the broader discovery audience formed by opted-in shared Discord servers, plus friends
- a specific hand-picked set of friends
- one or more specific opted-in Discord servers within that broader discovery audience

Calls to play can start immediately or be scheduled for later, and they remain visible until the configured end time.

The Play view keeps recently ended calls to play visible for a short closed-history window and marks whether each visible call currently applies to the signed-in viewer's library.

