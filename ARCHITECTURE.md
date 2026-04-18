# Architecture — Game's Up

## High-level flow

`apps/web` is the primary product surface: a Vite-built PWA with a Joy UI interface and shared TypeScript contracts from `packages/shared`. `apps/api` exposes the typed HTTP surface for auth, discovery, and play-intent orchestration.

## Layers

| Layer | Description |
|---|---|
| `apps/web` | Web-first client shell, discovery UI, auth entry points, and installable PWA behavior. |
| `apps/api` | Express API, auth integration, discovery ranking, notification fan-out, and persistence orchestration around Prisma. |
| `packages/shared` | Zod schemas, DTOs, and shared runtime validation used by both the web app and API. |
| `apps/api/prisma` | Core relational model for users, friends, game interests, play intents, moderation, and notifications. |

## Discovery-first product model

The product loop is intentionally narrow:

1. Users build a library and mark games they want to play.
2. Discovery surfaces other users through explicit friendships plus opted-in shared Discord servers.
3. Users add people they want to keep track of as friends.
4. A play intent can target either the full library or a chosen subset.
5. Notifications trigger when a friend or opted-in shared-server user expresses intent that overlaps with the recipient.
6. Discord-delivered call-to-play notifications can capture an explicit interested response from the recipient and fan a confirmation back to the original creator.

Game catalog search is provider-backed rather than store-specific. The current implementation targets a broad catalog source and normalizes platform labels so the product can treat a title as one canonical game with multiple supported platforms. Catalog lookup also normalizes storefront-only title decoration such as trademark symbols so Steam imports, manual entry, and Discord activity resolution can converge on the same canonical game row.

## Media proxy and caching

External media (RAWG game covers, Steam CDN game headers, Discord CDN avatars, and Steam avatar CDN images) is never surfaced to the client as raw third-party URLs. All external image URLs are rewritten by the API to `/api/media/<type>/<token>` before being sent in any response. The API routes handle:

- Server-side disk cache in `$TMPDIR/game-is-up/game-media-cache/` to avoid redundant fetches.
- Per-type TTL: game covers are treated as immutable once cached; avatars are re-fetched after 7 days.
- Proper `Cache-Control` / `ETag` headers so browsers and CDN layers can cache aggressively.

The PWA service worker adds a second caching layer on top: all `/api/media/` responses are stored client-side via a Workbox `CacheFirst` strategy with a 30-day TTL and a cap of 500 entries, so media loads instantly on repeat visits even when offline.

Prisma migrations are now the source of truth for schema changes. Development uses checked-in migration history, and deployment bootstraps existing pre-migrate databases to the baseline before applying pending migrations.

## Play intent model

Play intent is represented as a call-to-play aggregate rather than a single game field.

- `ENTIRE_LIBRARY`: the user is open to any game already in their active library.
- `SELECTED_GAMES`: the user explicitly picks a subset of games.

This keeps the schema aligned with the product requirement that users can say “I’m up for anything tonight” without creating one event per game.

Play intents can notify either explicit friends only, a specific hand-picked set of friends, the broader discovery audience formed by opted-in shared Discord servers plus explicit friends, or one or more specific opted-in Discord servers that narrow that broader discovery audience down to selected shared servers.

The scheduling model uses an explicit start and end window so the same aggregate supports both live-now calls to play and scheduled future sessions without a second entity type.

Notification rows can now also track whether a recipient explicitly said they would join from a Discord DM prompt. That keeps the response flow attached to the original play intent instead of introducing a second RSVP-specific entity.

Play-intent feed and current-intent payloads now also include lightweight interested-user previews derived from interested responses. That lets the web app render interested-player summaries directly on the Play view without a second lookup for basic identity data.

Feed previews now also expose a lightweight status (`active` or `closed`) plus an `appliesToViewer` flag. The web client uses those fields to keep recently ended calls visible for a short history window without leaving stale response actions enabled for calls that no longer match the viewer's library or have already ended.

Scheduled calls to play now add a second-stage check-in flow. The audience is still notified immediately at creation time, but the creator receives an explicit confirmation prompt when the scheduled start time arrives. If confirmed, accepted recipients receive a go-time update, unanswered recipients receive one follow-up reminder, those go-time messages remain actionable for later response changes, and recipients who previously declined or muted that creator remain opted out.

Creators also receive a persistent Discord DM summary for each live call to play. Major lifecycle changes can still replace that DM with a fresh message so Discord sends a notification, but audience response updates now edit the existing summary in place because the creator also receives a separate response-notification DM. Quiet expiry or archive cleanup also falls back to edit-in-place behavior. In the gateway-owning environment it can expose creator-only actions such as canceling the call directly from Discord while active, then switch to a cleanup action after the retained summary has gone stale.

Admin users also have a self-only test path in the Play composer. That path still creates the normal creator summary DM, but it overrides recipient selection so the audience-facing notification flow targets only the creator instead of combining the creator with the selected audience.

Notification and auto-play prompt rows also store the Discord DM message reference when the bot delivers an interactive DM. That allows the API to edit stale bot prompts in place when a play intent expires or an observed Discord activity ends, and to decide between edit-in-place or full replacement when a live call-to-play update should trigger a fresh Discord notification.

The admin debug snapshot now also exposes serialized DM previews, a DM template library for the major Discord DM flows, sendable self-sample previews for those templates, and derived revision history for tracked call-to-play threads. Those revisions are reconstructed from play-intent and notification lifecycle timestamps instead of being stored in a separate message-history table, which keeps Discord as the single live message surface while still giving the web emulator historical states to inspect.

Those serialized DM previews now include Discord embed payloads as well as button rows and fallback content. That keeps the debug emulator aligned with the live bot output as structured Discord flows move from markdown-heavy content blocks to embed-first layouts.

Tracked Discord DM rows also participate in retention cleanup. Auto-play prompts can still be removed after they age out, while call-to-play threads now retain one ended-history DM per user and per call to play; manual cancellations can replace the prior audience message with a fresh ended-summary DM so the audience is notified immediately, and those retained summaries can later expose an explicit cleanup action that deletes the tracked bot-authored DM history for that user or creator.

The Discord bot runtime is now intentionally split by environment. Exactly one environment should run the live Discord gateway connection for presence tracking and interactive Discord buttons, while other environments can reuse the same bot token in a REST-only mode for DM send/edit plus read-only server-member browsing without competing for gateway ownership.

Discord activity observations can also drive a secondary auto-prompt flow: when the presence bot sees a user start a game, the API can persist a prompt record, DM that user through the bot, and create a normal play intent if the user accepts.

The gateway-owning Discord bot can also react to plain DM text commands from linked users for lightweight control and cleanup. That command surface currently supports status checks, canceling the active call to play, toggling auto-play prompts, and removing settled bot-authored DM history.

The same bot surface now also supports guild-only slash commands for server adoption and discovery shortcuts. Those commands generate richer invite flows, including a dedicated web invite landing page that preserves server and inviter context through Discord OAuth instead of dropping every invite into the generic app shell.

Invite acceptance attribution is persisted as its own relational record keyed to the accepted user, optional inviter identity, optional Discord server snapshot, and invite kind. The auth session can expose the latest attribution to the web app for onboarding copy, and the admin debug snapshot can expose recent attribution rows for operational verification.

That same presence stream now powers one-time launch alerts for active single-game play intents: interested recipients can be notified when the creator starts the planned game, and creators can be notified when already-interested recipients initially launch it. Those alerts are keyed to the active play-intent row so they naturally reset when the call is materially changed.

The API now runs a lightweight cleanup sweep for expired play intents so unanswered Discord invite prompts can be marked expired and rewritten even if the affected users do not immediately reopen the app. On process start, that same maintenance pass also refreshes tracked Discord DM content so restored environments do not leave stale buttons, embeds, or summary states behind.

Discord presence tracking now also maintains a lossy observed-game history keyed by Discord identity rather than only by app user. That lets the library API return suggested games based on titles the bot has seen the user playing, while still allowing non-members to contribute to the raw observation set. On API startup, a lightweight maintenance pass also repairs preexisting duplicate game rows whose titles collapse to the same normalized form so older trademark-split records do not keep fragmenting library, prompt, and observation state.

Discovery currently depends on explicit app friendships plus opted-in shared Discord servers. The Discord Activity-based friend import path has been removed.

## Repository guidance

The repository includes shared Copilot customization files under `.github/`:

- `copilot-instructions.md` for workspace-wide guidance
- `instructions/` for area-specific rules
- `prompts/` for reusable implementation tasks
- `hooks/` plus `scripts/copilot/` for deterministic safety and startup context

These are kept small and focused so they remain usable during day-to-day implementation.
