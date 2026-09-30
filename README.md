# Game's Up

Game's Up is a monorepo for a game-discovery PWA. The initial scaffold includes:

- a Vite + React + Joy UI web app
- an Express + TypeScript API
- a shared package for contracts and schemas
- a Prisma schema targeting PostgreSQL
- a Devkit-managed development stack with Node and PostgreSQL
- workspace prompts, instructions, and hooks for repeatable agent-assisted work

## Workspace layout

```text
apps/
  api/        Express API, Prisma schema, route modules
  web/        Vite React app, Joy UI shell, PWA config
packages/
  shared/     Shared Zod schemas, contracts, and domain types
docker/dev/    Development process image
.agents/
  skills/      Codex workflows
.codex/
  hooks.json   Codex lifecycle hooks
AGENTS.md      Codex workspace guidance
compose.yml
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

The dashboard uses route-backed tabs, so the main views live at `/` for Home, `/network`, `/friends`, `/library`, `/discovery`, and `/play`. Admin users also get a `/debug` tab for bot, DM lifecycle simulator, prompt, notification, and invite-attribution diagnostics. Discord sign-in now preserves same-origin return URLs so a user can authenticate and land back on the view they started from, and invite links can land on a dedicated `/invite` route before handing off into Discord OAuth.

The Play tab now keeps both active and recently ended calls to play visible across the viewer's network, including targeted friend-only, friends-list, or selected-server calls that explicitly include that viewer. By default, the Play page filters those lists to calls that apply to the viewer's current library, but each section can be switched to show all visible calls.

Interested players can choose "I'll be late" on the call's detail page or Discord invite and enter an optional delay in minutes. Leave it blank when unsure, or use "Update delay" to revise it later. Estimates appear alongside the player's response and in updates to the creator and other invited players who have not declined. Saving the same estimate again does not send another notification.

The Friends page also supports reusable friends lists so creators can save common audience groups and target those saved lists directly from the Play composer.

Signed-in dashboard sessions now also keep themselves fresh through a same-origin Server-Sent Events invalidation stream. When impactful shared state changes land on the API, open tabs can automatically reload discovery, play, library, network, and session data without a polling loop.

For a clean local reset plus startup in one command, run:

```bash
npm run dev:fresh
```

## Multi-checkout development (optional)

Devkit gives each host checkout and Git worktree a derived `.localhost` URL and private Compose
stack containing Node and PostgreSQL. The primary checkout uses `game-is-up.localhost`; worktrees use
`<worktree>.game-is-up.localhost`.

```bash
npm run dev:bootstrap             # once per host machine
npm run dev:host -- snapshot      # once in the primary checkout, after preparing its dev data
npm run dev
```

On startup, `npm run dev` inherits a missing `.env` from the primary checkout, replaces a missing
or shared dependency tree with a checkout-local `npm ci`, runs Devkit's preflight, overlays the
derived database, port, origins, and Vite settings, applies checked-in Prisma migrations, builds
the shared package, and starts the shared/API/web watchers in the checkout's source-mounted Node
container. A standalone clone still needs an initial `npm install` to install Devkit itself.
The routed and direct URLs are printed before watcher output. An existing worktree `.env` is never
overwritten, and the proxy route is removed when the runner exits.

The baseline contains the database only. Game's Up has no checkout-relative filesystem data to
snapshot. `npm run db:seed` replaces the demo dataset in the current database; run it before
`npm run dev:host -- snapshot` when new worktrees should begin with that seeded state. A worktree
reset restores that portable SQL baseline;
`npm run dev:host -- reset -- --empty` instead creates an empty database, then normal startup
applies the migrations. Devkit refuses to reset the primary checkout because it owns the source
development data.

Useful commands:

- `npm run dev:doctor` reports prerequisites and their fixes.
- `npm run dev:host -- snapshot` refreshes the project database baseline.
- `npm run dev:host -- reset` recreates a worktree database volume from that baseline.
- `npm run dev:host -- prune` lists volumes whose worktrees no longer exist.
- `npm run dev:host -- infra` restarts the machine proxy and this checkout's PostgreSQL container.
- `npm run dev:down` removes this checkout's containers and network while preserving its database volume.


## Validation

Run the full validation suite with:

```bash
npm run validate
```

That runs ESLint, TypeScript checks, and `prisma validate`.

## Brand icons

The Game's Up brand icons live in `apps/web/public` and are generated by
`scripts/dev/generate-brand-icons.mjs` (geometry authored in the script, wordmark set in the
vendored Archivo Black font and converted to path outlines, PNGs rendered with `@resvg/resvg-js`):

```bash
npm run web:icons:export
```

That regenerates the full set:

- `icon-wordmark-gold-bubble` (SVG + 1024/512/192 PNG) — app, PWA, and Discord server icon
- `icon-wordmark-gold-bubble-maskable` (SVG + 512/192 PNG) — PWA maskable variant with the art at 80% safe area
- `icon-up-bang` (SVG + 64 PNG) — small-size favicon cut ("UP!" only)
- `icon-gold-ping-bot` (SVG + 1024/512 PNG) — Discord bot avatar upload

Because the text is outlined, the emitted SVGs have no font dependency and rasterize identically
everywhere. After changing icon art or references, bump the icon version query string in
`apps/web/vite.config.ts` and `apps/web/index.html` so installed clients refetch the new assets.


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
3. If you want Play composer calls to create a temporary Discord space in the Game's Up Discord server, also set `DISCORD_SERVER_ID` to that server's guild id.
4. If you want the web container to proxy API traffic on the same origin, leave `VITE_API_BASE_URL` empty.
5. Build and start the stack:

  ```bash
  docker compose up --build -d
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

Default SSH deployment values are:

- host: `deploy-host`
- port: `22`
- repo path: `/srv/game-is-up`
- branch: `main`

Override them with flags such as `--host`, `--port`, `--repo-path`, `--branch`, and `--compose-file`, or with the env vars `DEPLOY_SSH_HOST`, `DEPLOY_SSH_PORT`, `DEPLOY_REPO_PATH`, `DEPLOY_GIT_BRANCH`, and `DEPLOY_COMPOSE_FILES`. Pass `--compose-file` multiple times when you need an exact Compose stack, for example `--compose-file compose.yml --compose-file compose.prod.yml`.

The deploy helper runs on the host, so it uses your normal SSH config and host aliases directly. With the default host of `deploy-host`, any configured user, key selection, and host-specific settings come from your SSH config rather than deploy-script flags.

The public container runs unprivileged Nginx on internal port `8080`, and Docker maps host port `8080` to it by default. Nginx proxies `/api/*` to the API container so browser clients can stay same-origin in production.

The API container now bootstraps Prisma Migrate on startup: fresh databases get `prisma migrate deploy`, and existing pre-migrate databases are first baselined at the checked-in baseline migration and then migrated forward. The Compose stack includes a PostgreSQL service with persistent storage.

If you already run Nginx on the host, the default Docker publish target is already `8080`, so host Nginx can reverse proxy to that upstream directly.

For a host-Nginx setup, the important production values are:

- `CLIENT_ORIGIN=https://your-public-domain`
- `DISCORD_CALLBACK_URL=https://your-public-domain/api/auth/discord/callback`
- `VITE_API_BASE_URL=` so the frontend uses same-origin `/api`
- `PORT=8080` as the default host port behind Nginx

When the web app is built for same-origin production hosting with `VITE_API_BASE_URL=` empty, client auth flows should still construct absolute OAuth entry URLs so redirects remain stable behind reverse proxies and alternate origins.

For Cloudflare-backed deployments, no cache purge is needed: nginx serves the app-shell URLs (`/`, `/index.html`, `/sw.js`, `/registerSW.js`, `/manifest.webmanifest`) with `Cache-Control: no-store`, so the edge never caches them (`cf-cache-status: BYPASS`/`DYNAMIC`) and installed PWAs pick up new builds on their next service-worker check. Hashed assets stay long-lived and immutable. If a Cloudflare-level cache rule (for example "Cache Everything") is ever added, it must exclude those shell URLs or app updates will stall for installed clients.

This repo now treats Prisma migrations as the source of truth for schema changes. Use `db:migrate` to create new migrations during development and `db:migrate:deploy` for deployment targets.

## Discord OAuth setup

1. In the Discord developer portal, add your OAuth redirect URI.
2. For local development, use the callback in `.env.development.example` unless you intentionally change the API port.
3. Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_CALLBACK_URL` in your environment or `.env` file.
   In Devkit host mode the runner replaces the callback with
   `http://game-is-up.localhost/api/auth/discord/callback` in the primary checkout, or the
   corresponding `<worktree>.game-is-up.localhost` URI in a worktree. Discord requires an exact
   redirect URI match, so sign-in only works after that checkout-specific URI is registered in the
   Discord developer portal. Use `DEVKIT=0 npm run dev` when you need the single registered
   fixed-port callback instead.
4. Start the app with `npm run dev` and use the "Sign in with Discord" button in the web UI.
5. Discord sign-in now also requests the `guilds` scope so the app can sync which servers you share with other users.
6. After signing in, use the in-app Discord server controls to opt specific shared servers into discovery. Synced servers are excluded by default, and a server can only be selected once the bot is installed in that server.
7. If you join a new Discord server or install the bot into one after you have already signed in, use the Network page's `Refresh Discord servers` action to re-sync your server list without signing out.
8. Optional: set `DISCORD_BOT_TOKEN` if you want the app to send Discord DMs. Set `DISCORD_BOT_MODE=gateway` only in the one environment that should own the live gateway connection for presence tracking and interactive bot flows.
9. If you need to reuse that same bot token locally while production still owns the gateway connection, set `DISCORD_BOT_MODE=rest` in development. That mode supports DM send/edit plus read-only server and member browsing without opening a second live gateway session.
10. Development now emulates Discord DM send, edit, and delete by default even when the bot token is configured. Set `DISCORD_SEND_REAL_DMS_IN_DEV=true` only when you explicitly want a dev environment to deliver live Discord DMs.
11. Install the bot in shared Discord servers and enable the Presence Intent in the Discord developer portal if you want lossy recording of currently played Discord games from the gateway-owning environment.
12. Bot-based activity tracking only records activity while the bot is online and present in a shared server, so it should be treated as opportunistic rather than authoritative history.
13. If you want the app to browse every member in a selected Discord server for invite targeting, the bot also needs the Server Members intent enabled in the Discord developer portal.
14. When a call to play matches someone who should be notified and that user has a linked Discord account, the bot can DM them directly. If someone becomes newly eligible later because they add overlapping library games while the call is still active, the app now backfills the missing call notification for them as well. Quick response buttons in Discord are only active in the gateway-owning environment.
15. If a notified recipient responds from Discord, the creator and every other invited recipient who has not passed — including invitees who have not answered yet — see it in their per-call updates-log DM: a single message per recipient listing every live update (interest, passes, running late, voice joins, game launches) newest-first with per-line timestamps in the recipient's timezone, rendered as pure plain text, and deleted and re-sent on each new event so Discord raises a fresh notification. Invitees who have not responded also get a call-to-action line in that log pointing back at their invite buttons, and choosing Can't make it is what stops those update pings for them. Passes always reach the creator and every other non-passed recipient, on every audience scope, so nobody has to guess who dropped out. A recipient who said they can't make it can still switch to interested later. Once interested, a recipient can also flag I'll be late (from the web app or the Discord invite); that notifies the creator and every other non-passed recipient and lists them separately from on-time interest in the call summaries. The original recipient invite stays in place and updates its buttons to match the current choice; instead of sending a separate confirmation DM, the pressed button briefly shows a confirmation ("You're in!", "Got it", or "Running late") before settling back to the updated invite. When the call uses a temporary Discord space, the invite itself carries link buttons for interested recipients: recipients already in the server get Text channel and Voice channel buttons, while everyone else gets a Join Discord invite button in their place. Recipients who already have an overlapping active call to play are still filtered out before those call notifications are sent.
16. Calls to play can optionally request a temporary Discord space in the Game's Up Discord server. That space provisions a dedicated category with paired text and voice channels. People who are already in that server can have access granted immediately, people who join later can be granted access on demand, existing active legacy spaces are backfilled on startup, and creators can delete the retained space early after the call ends.
16. Users can leave a Play page setting on by default so the gateway-owning bot can DM them after it sees them start a game and offer to create a call to play straight from Discord. Those prompts only go out when there is no overlapping active call already, at least one person in the user's network with a matching game in their library could receive it, and the same game has not already prompted that user in the last 10 minutes.
17. Unanswered Discord call-to-play invites and auto-play prompts are edited in place when they go stale, so users see that the session ended or the observed game activity stopped instead of keeping an outdated call to action. Manual call-to-play endings and clears instead replace audience DMs with a fresh ended-summary message so Discord sends a new notification, and retained ended summaries can expose an `Archive` action when interactive Discord buttons are available. The creator's ended summary keeps the richer call details, including who was interested and the temporary Discord channel links, until the space is deleted.
18. Scheduled calls to play still notify the target audience immediately when created. At start time, the creator now gets a check-in prompt to confirm whether the plan is still on.
19. If the creator confirms, users who already accepted get a go-time update and users who never answered get one follow-up reminder. Those go-time DMs stay actionable: accepted recipients can back out with a `No longer interested` action or flag `I'll be late`, unanswered recipients still get the normal `I'm interested` and `Can't make it` actions, the messages include the current interested count and interested-user list where relevant, and they still skip recipients who already declined or muted that creator. The creator check-in prompt itself now stays in place with its buttons removed, and the confirm or end acknowledgement is sent as a separate update tied back to that call's summary DM.
20. When a call to play is created, the creator also gets a persistent Discord DM summary. Major lifecycle updates can still replace that DM with a fresh message so Discord emits a notification, but audience response updates now edit the existing summary in place because the creator also receives the consolidated per-call updates-log DM. Those creator-facing update DMs reply to the tracked summary message when possible so concurrent calls stay visually separated in Discord. Quiet expiry or archive cleanup also falls back to edit-in-place behavior, and expired retained summaries can switch to an archive action for the creator. In the gateway-owning environment, active summaries still include a creator-only `End call to play` button.
21. For active single-game calls to play, the gateway-owning bot now sends one launch alert when the creator starts that game and one launch alert to the creator each time an already-interested audience member initially starts it. Those alerts are one-time per active call and reset when the call changes.
22. Call-to-play DMs now use natural local time phrasing such as `Friday Apr 17th at 10pm, for 2 hours` instead of raw timezone-abbreviation ranges. Right-now calls phrase their window as `For 2 hours starting now` so the duration and start are both explicit.
23. Admin users can inspect the DM lifecycle simulator from the debug surface to rehearse call-to-play and auto-play prompt flows locally without touching live Discord rows.
24. Structured Discord DMs now prefer embed layouts where that feels natural, and the debug view keeps read-only DM previews for prompt and notification rows so admin inspection stays aligned with the live bot output.
25. The Play composer now uses a step-based wizard that shows one section at a time for basics, audience, timing, and details instead of a separate self-only test posting path. The in-app detail view shows a "Can't make it" group alongside interested and running-late players: always for the creator of the call, and for everyone else on friend-targeted calls.
26. Bot-authored Discord DMs tied to tracked call-to-play and auto-play flows participate in retention cleanup. Call-to-play threads are shown as ended in place when their window closes, and the entire chain (creator summary, recipient invites, and dangling replies) is then deleted automatically 12 hours after the window ends. Creators and recipients can still archive or clean up sooner via the explicit actions.
27. In the gateway-owning environment, linked users can also send the bot DM commands for lightweight control without reopening the app: `help`, `status`, `end`, `autoplay`, and `cleanup`. `status` reports the latest active call to play, `end` clears any active calls to play, and `cleanup` removes older bot-authored DM clutter in that thread while preserving still-active tracked bot messages.
28. In that same gateway-owning environment, the bot also registers slash commands for adoption flows: the guild-only `invite-user`, `invite-link`, `app-members`, `server-ctps`, and `setup-ctp-post`, plus `post-ctp` which also works in the bot's DMs.
29. Discord invite links now open a dedicated invite landing page, preserve server and inviter context through Discord OAuth, and can attribute a first accepted sign-in back to the originating Discord invite.
30. Admin debug now includes an invite-attribution section so recent accepted invite flows can be verified without querying the database directly.
31. The Play view keeps recently ended calls to play visible as ended cards, shows whether each call currently applies to your library, and lets the viewer switch between 1 day, 1 week, and 1 month history windows.
32. Calls to play now also have dedicated `/play/:playIntentId` detail pages. Discord DMs can deep-link straight into a specific call, Play cards expose a `Details` action, and legacy library-wide calls still expand the actual game options on that page so recipients can review what overlaps are in scope before they respond.
33. Discovery-based play-intent visibility can now include both explicit friends and users from the Discord servers you opted into discovery.
34. Discovery remains based on opted-in shared Discord servers plus explicit in-app friendships. The Discord friend-list import path has been removed.
35. Discord is still the only sign-in path in this scaffold.
36. Steam can now be linked as a secondary account for library import only. It does not replace Discord auth or discovery.
37. Linked-account flows like Discord sign-in and Steam linking return directly to the current web URL after the provider callback completes.
38. Call-to-play DMs now include a clickable creator Discord mention when available.
39. Subset call-to-play DMs can include game art for small selected-game sets: single-game calls show the chosen cover directly, and small multi-game sets show a lead cover with a short title list.
40. Signed-in web sessions now subscribe to an authenticated dashboard SSE stream so open tabs refresh automatically after impactful changes such as play-intent updates, library edits, friend changes, Discord server selection changes, and linked-account or profile updates.
41. Calls to play can now be composed entirely inside Discord through the same Basics / Audience / Timing / Details wizard as the web composer, rendered as a private step-by-step message. Entry points are a persistent "Start a call to play" button that a server admin places in a channel with `/setup-ctp-post` (its optional `lock-channel` flag stops members from sending messages in that channel so the button is not buried, and `lock-channel: false` reopens it), and the `/post-ctp` slash command in servers or bot DMs. Drafts resume for 24 hours, scheduled times are typed in the user's Game's Up timezone (e.g. `8pm`, `tomorrow 19:00`, `in 45m`), posting goes through the exact same play-intent service and validation as the app, and unlinked users who press the button get the invite landing link with server context instead.

## Steam import setup

1. Create a Steam Web API key at `https://steamcommunity.com/dev/apikey`.
2. Set `STEAM_WEB_API_KEY` and `STEAM_CALLBACK_URL` in your environment or `.env` file.
3. For local development, use the callback in `.env.development.example` unless you intentionally change the API port.
   Devkit host mode instead uses the routed checkout origin at
   `/api/auth/steam/callback`; Steam verifies that dynamic return URL and realm. If the provider
   setup cannot accept the checkout-specific URL, use `DEVKIT=0 npm run dev` for the fixed callback.
4. Sign in with Discord first, open the Library tab, then use the Add games from Steam button to connect Steam and preview owned games.
5. Steam import respects the existing library model: the app shows a picker first and only imports the titles the user selects.
6. Steam import normalizes punctuation, trademark markers, and similar storefront-only title differences before matching against existing catalog games, so reused RAWG-backed games can keep the Steam source plus the original Steam spelling as an alias.
7. The same normalized-title matching is also used when the app records Discord-observed activity, and API startup now repairs previously split duplicate game rows that only differ by storefront-only title decoration such as trademark symbols.
8. Steam may return no importable games when the account's game details are private or effectively unavailable to the API, so manual add should remain the fallback.
9. The picker can filter by library state and playtime, and sort by most played, least played, or recently played. Playtime comes from the Steam preview response and is not persisted at import time, so these controls only apply while the picker is open. The default "Recommended order" keeps the API ordering and pushes single-player-only titles to the end of each page as their metadata loads.

## Game catalog provider

The library search can query RAWG for broad multi-platform game data instead of being limited to any single storefront.

1. Create a RAWG API key at `https://rawg.io/apidocs`.
2. Set `RAWG_API_KEY` in your `.env` file.
3. If the key is missing, the app falls back to locally known games only.
4. Keep the RAWG attribution link visible anywhere RAWG-backed catalog results are shown.

Library entries now store one canonical game with one or more selected platform flags, instead of requiring one separate library row per platform.

When the Discord presence bot sees a user playing a game in a shared server, the API now keeps a lossy observed-game history and uses it to suggest likely library additions above the library grid. In local development, signed-in accounts with no personal observed history yet fall back to the seeded sample observations so the suggestion row can still be reviewed.

Users can also set one profile-level "when do you usually play" note and let individual games inherit it, while still attaching a game-specific schedule override when a title tends to happen at a different time.

## Repository automation

- `AGENTS.md` and nested `AGENTS.md` files define Codex guidance at workspace, web, API, and Prisma scopes.
- `.agents/skills/` provides reusable Codex workflows for documentation audits, commits, and deployments.
- `.codex/hooks.json` runs the hooks in `.codex/hooks/` for session context, destructive-command protection, post-edit reminders, and targeted validation routing.

## Play intent model

Users are not limited to one active call to play. They can keep multiple active calls as long as those availability windows do not overlap. Each call can target:

- a selected subset of 1 to 5 games

Calls to play can also control who sees them:

- explicit friends only
- the broader discovery audience formed by opted-in shared Discord servers, plus friends
- a specific hand-picked set of friends
- one or more specific opted-in Discord servers within that broader discovery audience

Calls to play can start immediately or be scheduled for later, and they remain visible until the configured end time. If a currently active call starts applying to someone later because their library changes, the app will surface it retroactively and backfill the missing invite or go-time reminder.

The Play view keeps recently ended calls to play visible for a short closed-history window and marks whether each visible call currently applies to the signed-in viewer's library.
