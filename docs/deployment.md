# Deployment

How Game's Up runs in production: the Docker Compose stack, the SSH deploy script, and the data it keeps. Local development is in [development.md](development.md).

## Production Docker

Production runs from `compose.example.yml`, copied to an untracked `compose.yml` in the server checkout. Keep any `compose.prod.yml` override out of the repository; that file exists only on the production server, for host-specific Compose overrides.

1. Copy `.env.server.example` to `.env` and set `POSTGRES_PASSWORD` and `SESSION_SECRET` to long random values. Compose refuses to start without them.
2. For a real deployment, set `CLIENT_ORIGIN` to your public app URL and set `DISCORD_CALLBACK_URL` to `${CLIENT_ORIGIN}/api/auth/discord/callback`.
3. If you want Play composer calls to create a temporary Discord space in the Game's Up Discord server, also set `DISCORD_SERVER_ID` to that server's guild id.
4. If you want the web container to proxy API traffic on the same origin, leave `VITE_API_BASE_URL` empty.
5. Build and start the stack:

```bash
docker compose up --build -d
```

6. Open the app on `http://localhost:8080` by default. If you need a different host port, set `PORT`, for example `PORT=9090 docker compose up --build -d`.

Deploy from your local workspace with:

```bash
npm run deploy:prod
```

It deploys the current commit, and refuses before reaching the server when:

- `DEPLOY_SSH_HOST` or `DEPLOY_REPO_PATH` is not set (in `.env`, which the script loads, or with `--host` and `--repo-path`);
- the local tree has uncommitted changes;
- `HEAD` is not exactly `origin/main`, so push to `main` first.

Then it runs `npm run validate` (skip it with `--skip-validate`), and on the server refuses a checkout with tracked changes, dumps the database to `.backups/` in the server checkout and verifies the dump (see Backup below), fast-forwards the checkout to `origin/main`, and runs `docker compose -f compose.yml up --build -d --wait`, adding `-f compose.prod.yml` when that server-only file exists. It waits up to five minutes for every service to report healthy; if one does not, it prints the service status and recent logs and stops with an error. After a healthy start it prunes dangling images (skip with `--no-prune` or `DEPLOY_PRUNE=0`). `--dry-run` runs the local checks and prints the plan without validating or deploying.

The port defaults to `22` (`DEPLOY_SSH_PORT` or `--port`). `DEPLOY_COMPOSE_FILES` (comma separated) or a repeated `--compose-file` sets an exact Compose stack instead, for example `--compose-file compose.yml --compose-file compose.prod.yml`.

The deploy helper runs on the host, so it uses your normal SSH config and host aliases directly. With a host alias, any configured user, key selection, and host-specific settings come from your SSH config rather than deploy-script flags.

The public container runs unprivileged Nginx on internal port `8080`, and Docker maps host port `8080` to it by default. Nginx proxies `/api/*` to the API container so browser clients can stay same-origin in production.

The API container bootstraps Prisma Migrate on startup: fresh databases get `prisma migrate deploy`, and existing pre-migrate databases are first baselined at the checked-in baseline migration and then migrated forward. The Compose stack includes a PostgreSQL service with persistent storage.

If you already run Nginx on the host, the default Docker publish target is already `8080`, so host Nginx can reverse proxy to that upstream directly.

For a host-Nginx setup, the important production values are:

- `CLIENT_ORIGIN=https://your-public-domain`
- `DISCORD_CALLBACK_URL=https://your-public-domain/api/auth/discord/callback`
- `VITE_API_BASE_URL=` so the frontend uses same-origin `/api`
- `PORT=8080` as the default host port behind Nginx

When the web app is built for same-origin production hosting with `VITE_API_BASE_URL=` empty, client auth flows should still construct absolute OAuth entry URLs so redirects remain stable behind reverse proxies and alternate origins.

For Cloudflare-backed deployments, no cache purge is needed: nginx serves the app-shell URLs (`/`, `/index.html`, `/sw.js`, `/registerSW.js`, `/manifest.webmanifest`) with `Cache-Control: no-store`, so the edge never caches them (`cf-cache-status: BYPASS`/`DYNAMIC`) and installed PWAs pick up new builds on their next service-worker check. Hashed assets stay long-lived and immutable. If a Cloudflare-level cache rule (for example "Cache Everything") is ever added, it must exclude those shell URLs or app updates will stall for installed clients.

This repo treats Prisma migrations as the source of truth for schema changes. Use `db:migrate` to create new migrations during development and `db:migrate:deploy` for deployment targets.

### Changing the database password on an existing deployment

The Postgres image reads `POSTGRES_PASSWORD` only when it creates an empty data volume. On a running deployment, changing the value in `.env` does not change the database password, and the API then fails to connect. Change the role's password inside the database first, then the configuration. Run these in the server checkout:

1. Generate a URL-safe value, for example with `openssl rand -hex 32`.
2. Set it on the database role. `\password` prompts for the value, so it stays out of shell history and the process list:

```bash
docker compose exec db psql -U postgres -d game_is_up -c '\password postgres'
```

3. Put the same value in the server's `.env` as `POSTGRES_PASSWORD`.
4. Make sure the server's `compose.yml` reads `${POSTGRES_PASSWORD}` for both the `db` service and the API's `DATABASE_URL`, as `compose.example.yml` does.
5. Recreate the containers with `docker compose up -d`, then confirm the API reports healthy with `docker compose ps`.

Between steps 2 and 5 the API cannot open new database connections, so do the steps together.

The same order applies when moving an existing deployment off the old built-in default.

## Data and privacy

Game's Up collects no telemetry or crash reports, and it sends no usage data anywhere.

### What is stored

Account and product data lives in the PostgreSQL database in the `postgres-data` volume. Sessions are signed cookies and are not stored on the server. The API also keeps a disk cache of game covers and Discord avatars under the container's temporary directory (`game-is-up/game-media-cache/`), which is lost when the container is recreated; avatars are re-fetched after 7 days.

- **Profile:** the Discord user id, handle, display name, avatar URL and email address from Discord sign-in, plus the timezone, bio and usual-availability note the user sets.
- **Linked accounts:** the Discord OAuth access and refresh tokens, the user's Discord server memberships, and, when linked, the Steam account id.
- **Library and social graph:** games, platforms and interests; friends, blocks, mutes and friends lists; discovery server preferences.
- **Calls to play:** each call, its audience and games, responses, participant invitations, notifications, and the ids of the Discord messages the bot sent for it.
- **Discord activity:** for signed-up users only, the games the bot sees them playing in a server it shares with them, kept against their account and used for library suggestions, the friends' trending row and auto-play prompts. A user who signs up later has no history from before sign-up. Everyone else the bot sees, including members who never signed up, is counted only anonymously: per game, per server and per UTC day, with no Discord id or other identifier (the `DiscordGameActivityDaily` table, for trending views). Since this change was deployed, the count is the number of presence updates seen, which measures activity, not people. Rows backfilled once from the old per-person records instead count distinct people last seen playing that day, and are marked as such.
- **Discord bot state:** composer drafts, invite attribution, and reports.

### On the user's device

The web app keeps the chosen theme in the browser's local storage, and its service worker caches the app shell and up to 500 game covers and avatars for 30 days.

### Retention

- Bot DM chains for a call to play are deleted 12 hours after the call's window ends; temporary Discord spaces 12 hours after their last activity.
- Discord composer drafts expire after 24 hours.
- Everything else is kept until the account is deleted. The anonymous per-game daily counts hold no identifiers, belong to no account, and are kept.

### Account deletion

There is no self-service account deletion in the app yet. A user asks the operator, who deletes the user's row in the `User` table. This procedure has not yet been tried on a real database. Going by the schema:

- Records linked to the account (profile, linked accounts and tokens, library, friends, blocks, mutes, lists, calls to play, responses, notifications, activity observations, observed games, drafts, reports) are removed with it by cascading deletes.
- Invite attributions the user sent are kept, with the inviter's account cleared but their Discord user id kept.
- Other users' notifications and catalog aliases that name the user keep a dangling id.
- Discord messages the bot already delivered stay in Discord. Because their tracking rows are deleted with the account, the retention sweep no longer cleans them up.

### Export

There is no data export.

### Backup

Every deploy first takes a database dump into `.backups/pre-deploy-<UTC time>-<commit>.sql.gz` in the server checkout, before any migration can run. The dump is checked for gzip integrity and for pg_dump's completion trailer, and the deploy stops if either check fails. The newest five are kept. Skip it with `--skip-backup` (or `DEPLOY_BACKUP=0`) only when you have taken a dump another way. To restore one into the running database: `gzip -dc .backups/<file> | docker compose exec -T db psql -U postgres -d game_is_up` (into an empty database, or after dropping and recreating it).

Beyond those dumps, backup is the host's: the server is a virtual machine whose whole disk, including the `postgres-data` volume, is backed up by the hypervisor (Proxmox whole-machine backups). The operator, who runs the server, is responsible for those backups and for restoring from them. A restore has not yet been tried. Backups hold the same personal data and tokens as the live database and need the same protection.
