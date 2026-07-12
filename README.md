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

The dashboard uses route-backed tabs, so the main views live at `/` for Home, `/network`, `/friends`, `/library`, `/discovery`, and `/play`. Admin users also get a `/debug` tab for bot, DM lifecycle simulator, prompt, notification, and invite-attribution diagnostics. Discord sign-in now preserves same-origin return URLs so a user can authenticate and land back on the view they started from, and invite links can land on a dedicated `/invite` route before handing off into Discord OAuth.

The Play tab now keeps both active and recently ended calls to play visible across the viewer's network, including targeted friend-only, friends-list, or selected-server calls that explicitly include that viewer. By default, the Play page filters those lists to calls that apply to the viewer's current library, but each section can be switched to show all visible calls.

The Friends page also supports reusable friends lists so creators can save common audience groups and target those saved lists directly from the Play composer.

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

## Logo PNG export

The web app keeps the SVG files in `apps/web/public` as the source of truth, and generates square PNGs from them when the app icon set needs to be refreshed.

Use the checked-in helper:

```bash
npm run web:icons:export
```

That exports the current logo variants:

- `apps/web/public/icon-gamepad-voice-green-bubble.svg`
- `apps/web/public/icon-gamepad-voice-red-bubble.svg`

And writes these PNG sizes for each variant:

- `1024x1024`
- `512x512`
- `192x192`

The exact conversion flow is intentionally two-step because a direct one-step SVG-to-square ImageMagick export introduced an opaque white matte around the artwork.

Exact manual steps:

```bash
cd apps/web/public

convert -background none icon-gamepad-voice-green-bubble.svg PNG32:icon-gamepad-voice-green-bubble-render.png
convert icon-gamepad-voice-green-bubble-render.png -background none -gravity center -extent 1063x1063 -resize 1024x1024 PNG32:icon-gamepad-voice-green-bubble-1024.png
convert icon-gamepad-voice-green-bubble-render.png -background none -gravity center -extent 1063x1063 -resize 512x512 PNG32:icon-gamepad-voice-green-bubble-512.png
convert icon-gamepad-voice-green-bubble-render.png -background none -gravity center -extent 1063x1063 -resize 192x192 PNG32:icon-gamepad-voice-green-bubble-192.png
rm -f icon-gamepad-voice-green-bubble-render.png

convert -background none icon-gamepad-voice-red-bubble.svg PNG32:icon-gamepad-voice-red-bubble-render.png
convert icon-gamepad-voice-red-bubble-render.png -background none -gravity center -extent 1063x1063 -resize 1024x1024 PNG32:icon-gamepad-voice-red-bubble-1024.png
convert icon-gamepad-voice-red-bubble-render.png -background none -gravity center -extent 1063x1063 -resize 512x512 PNG32:icon-gamepad-voice-red-bubble-512.png
convert icon-gamepad-voice-red-bubble-render.png -background none -gravity center -extent 1063x1063 -resize 192x192 PNG32:icon-gamepad-voice-red-bubble-192.png
rm -f icon-gamepad-voice-red-bubble-render.png
```

Why `1063x1063`: the current logo SVGs are `1063x824`, so the square padding step uses the larger source dimension to preserve transparent space rather than stretching the art.

The helper script computes that square padding size dynamically from the source SVG dimensions, so it stays reusable if the source art changes later.

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

- host: `deploy-host`
- port: `22`
- repo path: `/srv/game-is-up`
- branch: `main`

Override them with flags such as `--host`, `--port`, `--repo-path`, `--branch`, and `--compose-file`, or with the env vars `DEPLOY_SSH_HOST`, `DEPLOY_SSH_PORT`, `DEPLOY_REPO_PATH`, `DEPLOY_GIT_BRANCH`, and `DEPLOY_COMPOSE_FILES`. Pass `--compose-file` multiple times when you need an exact Compose stack, for example `--compose-file compose.yml --compose-file compose.prod.yml`. If you need to bypass the post-deploy purge for an emergency rollout, pass `--skip-cache-purge`.

The devcontainer now bind-mounts your local `.ssh` directory, so this deploy path uses your normal SSH config and host aliases directly. With the default host of `deploy-host`, any configured user, key selection, and host-specific settings come from your mounted SSH config rather than deploy-script flags.

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
7. If you join a new Discord server or install the bot into one after you have already signed in, use the Network page's `Refresh Discord servers` action to re-sync your server list without signing out.
8. Optional: set `DISCORD_BOT_TOKEN` if you want the app to send Discord DMs. Set `DISCORD_BOT_MODE=gateway` only in the one environment that should own the live gateway connection for presence tracking and interactive bot flows.
9. If you need to reuse that same bot token locally while production still owns the gateway connection, set `DISCORD_BOT_MODE=rest` in development. That mode supports DM send/edit plus read-only server and member browsing without opening a second live gateway session.
10. Development now emulates Discord DM send, edit, and delete by default even when the bot token is configured. Set `DISCORD_SEND_REAL_DMS_IN_DEV=true` only when you explicitly want a dev environment to deliver live Discord DMs.
11. Install the bot in shared Discord servers and enable the Presence Intent in the Discord developer portal if you want lossy recording of currently played Discord games from the gateway-owning environment.
12. Bot-based activity tracking only records activity while the bot is online and present in a shared server, so it should be treated as opportunistic rather than authoritative history.
13. If you want the app to browse every member in a selected Discord server for invite targeting, the bot also needs the Server Members intent enabled in the Discord developer portal.
14. When a call to play matches someone who should be notified and that user has a linked Discord account, the bot can DM them directly. If someone becomes newly eligible later because they add overlapping library games while the call is still active, the app now backfills the missing call notification for them as well. Quick response buttons in Discord are only active in the gateway-owning environment.
15. If a notified recipient responds from Discord, the creator and every other invited recipient who has not passed — including invitees who have not answered yet — see it in their per-call updates-log DM: a single message per recipient listing every live update (interest, passes, running late, voice joins, game launches) newest-first with per-line timestamps in the recipient's timezone, rendered as pure plain text, and deleted and re-sent on each new event so Discord raises a fresh notification. Invitees who have not responded also get a call-to-action line in that log pointing back at their invite buttons, and choosing Can't make it is what stops those update pings for them. Passes follow the existing visibility rule — a first-time pass on a broad network call stays quiet, while passes on friend-targeted calls and pass-after-interested changes land in the updates log of the creator and every other non-passed recipient — and a passed recipient can still switch to interested later. Once interested, a recipient can also flag I'll be late (from the web app or the Discord invite); that notifies the creator and every other non-passed recipient and lists them separately from on-time interest in the call summaries. The original recipient invite stays in place and updates its buttons to match the current choice; instead of sending a separate confirmation DM, the pressed button briefly shows a confirmation ("You're in!", "Got it", or "Running late") before settling back to the updated invite. When the call uses a temporary Discord space, the invite itself carries link buttons for interested recipients: recipients already in the server get Text channel and Voice channel buttons, while everyone else gets a Join Discord invite button in their place. Recipients who already have an overlapping active call to play are still filtered out before those call notifications are sent.
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
25. The Play composer now uses a step-based wizard that shows one section at a time for basics, audience, timing, and details instead of a separate self-only test posting path. For friend-targeted calls, the in-app detail view also shows which targeted friends passed.
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

- `.github/copilot-instructions.md` defines workspace-wide coding guidance.
- `.github/instructions/` scopes additional guidance by area.
- `.github/prompts/` adds reusable prompts for vertical-slice work, provider adapters, commit workflow, and documentation audits.
- `.github/hooks/` adds Copilot hooks for session guidance, destructive-command protection, post-edit reminders, and targeted validation routing.

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

