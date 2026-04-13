# Architecture — Game Is Up

## High-level flow

`apps/web` is the primary product surface: a Vite-built PWA with a Joy UI interface and shared TypeScript contracts from `packages/shared`. `apps/api` exposes the typed HTTP surface for auth, discovery, and play-intent orchestration. The Android app will wrap the same built web bundle through Capacitor so the product logic and UI remain shared.

## Layers

| Layer | Description |
|---|---|
| `apps/web` | Web-first client shell, discovery UI, auth entry points, and installable PWA behavior. |
| `apps/api` | Express API, auth integration, discovery ranking, notification fan-out, and persistence orchestration around Prisma. |
| `packages/shared` | Zod schemas, DTOs, and shared runtime validation used by both the web app and API. |
| `apps/api/prisma` | Core relational model for users, friends, game interests, play intents, moderation, and notifications. |
| `apps/android` | Thin Capacitor wrapper that packages the PWA for Android while keeping native code limited to lifecycle, push, and deep-link concerns. |

## Discovery-first product model

The product loop is intentionally narrow:

1. Users build a library and mark games they want to play.
2. Discovery surfaces other users through explicit friendships plus opted-in shared Discord servers.
3. Users add people they want to keep track of as friends.
4. A play intent can target either the full library or a chosen subset.
5. Notifications trigger when a friend or opted-in shared-server user expresses intent that overlaps with the recipient.

Game catalog search is provider-backed rather than store-specific. The current implementation targets a broad catalog source and normalizes platform labels so the product can treat a title as one canonical game with multiple supported platforms.

Prisma migrations are now the source of truth for schema changes. Development uses checked-in migration history, and deployment bootstraps existing pre-migrate databases to the baseline before applying pending migrations.

## Play intent model

Play intent is represented as a call-to-play aggregate rather than a single game field.

- `ENTIRE_LIBRARY`: the user is open to any game already in their active library.
- `SELECTED_GAMES`: the user explicitly picks a subset of games.

This keeps the schema aligned with the product requirement that users can say “I’m up for anything tonight” without creating one event per game.

Play intents can notify either explicit friends only, a specific hand-picked set of friends, or the broader discovery audience formed by opted-in shared Discord servers plus explicit friends.

The scheduling model uses an explicit start and end window so the same aggregate supports both live-now calls to play and scheduled future sessions without a second entity type.

Discord activity observations can also drive a secondary auto-prompt flow: when the presence bot sees a user start a game, the API can persist a prompt record, DM that user through the bot, and create a normal play intent if the user accepts.

Discord presence tracking now also maintains a lossy observed-game history keyed by Discord identity rather than only by app user. That lets the library API return suggested games based on titles the bot has seen the user playing, while still allowing non-members to contribute to the raw observation set.

Discovery currently depends on explicit app friendships plus opted-in shared Discord servers. The Discord Activity-based friend import path has been removed.

## Repository guidance

The repository includes shared Copilot customization files under `.github/`:

- `copilot-instructions.md` for workspace-wide guidance
- `instructions/` for area-specific rules
- `prompts/` for reusable implementation tasks
- `hooks/` plus `scripts/copilot/` for deterministic safety and startup context

These are kept small and focused so they remain usable during day-to-day implementation.
