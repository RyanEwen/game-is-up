# Devcontainer Handoff

## Current state

- The app is intended to run with a real PostgreSQL database. The temporary no-database auth fallback was removed.
- Local database setup is working again.
- The durable devcontainer path now uses the Compose `db` service via `postgresql://postgres:postgres@db:5432/game_is_up?schema=public`.
- `npm run db:seed` now works correctly and inserts the demo dataset.
- `npm run validate` passes.
- Discord OAuth reaches the real callback path again. If the database is reseeded afterward, the signed-in user record is deleted and sign-in must be repeated.
- `npm run db:wait` now blocks until the configured PostgreSQL host is reachable, and `npm run dev` runs it before starting the app processes.
- `npm run dev:fresh` now provides a one-command local reset plus startup path.
- Discord sign-in now requests `guilds` and syncs shared server memberships into local tables used for discovery filtering.
- Signed-in users can now choose which synced Discord servers should count for mutual-user discovery.
- The devcontainer now also needs to support Android wrapper builds, including Java 21, the Android SDK, and local generation of the Capacitor Android project.

## Recent fixes

### Database-backed auth restored

- The original OAuth failure was caused by Prisma being unable to connect to PostgreSQL on `localhost:5432`.
- The root issue was environment drift between the devcontainer runtime and the actual database host. The devcontainer is now configured to start `db` explicitly and wait for it to become healthy.
- The workspace startup flow now verifies database reachability before booting the API and web processes.

### Seed command fixed

- The previous `prisma db seed` wrapper did not actually execute the seed file in this environment.
- The working fix is in `apps/api/package.json`:
  - `prisma:seed` now runs `tsx prisma/seed.ts` directly.

### Demo viewer made deterministic

- The unsigned demo path previously picked the first created user.
- Seed users were created concurrently, so that viewer was nondeterministic.
- The fix is in `apps/api/src/lib/demo-viewer.ts`:
  - unsigned demo requests now explicitly use the seeded `partyfinder` user.

## Expected behavior now

### Signed out

- `GET /api/discovery/feed` returns the seeded demo overlap feed.
- `GET /api/play-intents/examples` returns the seeded demo play-intent examples.

### Signed in with a fresh Discord account

- Discovery and play-intent sections are expected to be empty until the user adds games to their own library.
- That is product behavior, not a bug.
- If the user already has games but still sees no mutual users, check whether they have deselected all synced Discord servers from discovery.

## Devcontainer reopen workflow

1. Reopen the repository in the devcontainer.
2. Let the devcontainer finish its startup checks. `postStartCommand` now runs `npm run db:wait`.
3. Run:

```bash
npm run db:push
npm run db:seed
npm run dev
```

Or use the one-command path:

```bash
npm run dev:fresh
```

4. If testing the real signed-in flow after reseeding, sign in with Discord again.
5. If a user signed in before the `guilds` scope change, have them sign out and sign back in so Discord server memberships get synced.

## Useful checks

```bash
curl -s http://localhost:4000/api/health
curl -s http://localhost:4000/api/discovery/feed
curl -s http://localhost:4000/api/play-intents/examples
npm run validate
```

## Best next steps

1. Rebuild the devcontainer so the new Android toolchain image is used.
2. Run `npm run assemble:debug --workspace @game-is-up/android` inside the rebuilt container and verify whether `adb devices` can see your target device.
3. Improve first-run onboarding for newly signed-in Discord users so the empty state is more actionable.