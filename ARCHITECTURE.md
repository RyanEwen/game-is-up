# Architecture — Game's Up

## High-level flow

`apps/web` is the primary product surface: a Vite-built PWA with a Joy UI interface and shared TypeScript contracts from `packages/shared`. `apps/api` exposes the typed HTTP surface for auth, discovery, and play-intent orchestration.

Most client data still loads through normal HTTP requests, but signed-in dashboard sessions also hold one authenticated Server-Sent Events connection to the API. That stream carries low-detail invalidation events so the web client can re-fetch shared dashboard state when another user or another tab changes something impactful.

## Layers

| Layer | Description |
|---|---|
| `apps/web` | Web-first client shell, discovery UI, auth entry points, and installable PWA behavior. |
| `apps/api` | Express API, auth integration, discovery ranking, notification fan-out, SSE invalidation publishing, and persistence orchestration around Prisma. |
| `packages/shared` | Zod schemas, DTOs, SSE event contracts, and shared runtime validation used by both the web app and API. |
| `apps/api/prisma` | Core relational model for users, friends, game interests, play intents, moderation, and notifications. |

## Dashboard refresh flow

The web app does not use client-facing WebSockets. Instead, signed-in dashboard tabs subscribe to a single authenticated SSE endpoint that publishes invalidation events for broad domains such as auth, profile, library, network, discovery, and play intents.

When the API completes a mutation in one of those domains, it publishes an invalidation event and the client debounces a normal dashboard reload. That keeps transport simple while still making multi-user state feel live.

The current event fan-out is process-local in the API runtime. That is sufficient for the current single-instance deployment model, but a future multi-instance deployment would need a shared pub-sub layer behind the SSE publisher.

## Discovery-first product model

The product loop is intentionally narrow:

1. Users build a library and mark games they want to play.
2. Discovery surfaces other users through explicit app follow links plus opted-in shared Discord servers.
3. Users add people they want to keep track of to a one-way favorites/follow list rather than forming a mutual friendship.
4. A play intent can target either the full library or a chosen subset.
5. Notifications trigger when a friend or opted-in shared-server user expresses intent that overlaps with the recipient, and active calls can be backfilled later if a recipient's library changes and creates a new overlap.
6. Discord-delivered call-to-play notifications can capture an explicit interested response from the recipient, fan a confirmation back to the original creator, and notify anyone else who was already marked interested on that same call.

Game catalog search is provider-backed rather than store-specific. The current implementation targets a broad catalog source and normalizes platform labels so the product can treat a title as one canonical game with multiple supported platforms. Catalog lookup also normalizes storefront-only title decoration such as trademark symbols so Steam imports, manual entry, and Discord activity resolution can converge on the same canonical game row.

## Media proxy and caching

External media (RAWG game covers, Steam CDN game headers, Discord CDN avatars, and Steam avatar CDN images) is never surfaced to the client as raw third-party URLs. All external image URLs are rewritten by the API to `/api/media/<type>/<token>` before being sent in any response. The API routes handle:

- Server-side disk cache in `$TMPDIR/game-is-up/game-media-cache/` to avoid redundant fetches.
- Per-type TTL: game covers are treated as immutable once cached; avatars are re-fetched after 7 days.
- RAWG cover self-healing: when a stored RAWG media URL returns `404`, the API can refresh the game's stored cover URL from its persisted RAWG source id and retry the image once before surfacing a miss.
- Proper `Cache-Control` / `ETag` headers so browsers and CDN layers can cache aggressively.

The PWA service worker adds a second caching layer on top: all `/api/media/` responses are stored client-side via a Workbox `CacheFirst` strategy with a 30-day TTL and a cap of 500 entries, so media loads instantly on repeat visits even when offline.

Prisma migrations are now the source of truth for schema changes. Development uses checked-in migration history, and deployment bootstraps existing pre-migrate databases to the baseline before applying pending migrations.

## Play intent model

Play intent is represented as a call-to-play aggregate rather than a single game field.

- New or edited calls to play currently require `SELECTED_GAMES`: the user explicitly picks a subset of 1 to 5 games.
- Legacy `ENTIRE_LIBRARY` rows can still exist in stored data and detail surfaces until they are edited or retired.

The persisted schema still carries both enum values so older rows and Discord/history surfaces remain readable while new write paths stay narrowed to explicit game picks.

Play intents can notify either explicit followed users only, a specific hand-picked set of followed users, a saved friends list audience (snapshotted to explicit recipients at send time), the broader discovery audience formed by opted-in shared Discord servers plus explicit followed users, or one or more specific opted-in Discord servers that narrow that broader discovery audience down to selected shared servers.

The scheduling model uses an explicit start and end window so the same aggregate supports both live-now calls to play and scheduled future sessions without a second entity type.

Users can keep multiple active play intents at once as long as their availability windows do not overlap. The API write path enforces that overlap rule against the creator's other active calls, and the web composer edits one explicitly selected active intent at a time instead of assuming there is only one current call. Library writes can also retroactively backfill missing notification rows and Discord delivery for still-active calls that newly apply to the updated recipient.

Notification rows can now also track whether a recipient explicitly said they would join from a Discord DM prompt. That keeps the response flow attached to the original play intent instead of introducing a second RSVP-specific entity. A nullable `runningLateAt` timestamp on the same row models "I'll be late" as a modifier on an existing interested response rather than a separate response state: it requires a prior join, never replaces the stored interested/pass choice, clears when the recipient passes, and fans a dedicated running-late update out to the creator and every other interested recipient.

For audience-facing Discord delivery, the current model is anchor-plus-replies: the original invite DM is the retained anchor message, quiet state changes edit that anchor in place, and follow-up events such as invite updates, go-time reminders, go-time confirmations, and ended notices are sent as replies to that retained invite when possible. When a threaded invite flow reaches its retained ended state, the eventual archive action lives on that retained anchor and is expected to clear both the anchor and its bot-authored dangling replies for that user.

Play-intent feed and current-intent payloads now also include lightweight interested-user previews derived from interested responses. That lets the web app render interested-player summaries directly on the Play view without a second lookup for basic identity data. Each interested-user preview carries a `runningLate` flag, and previews expose a `viewerRunningLate` field, so the web and Discord summaries can split running-late players into their own list without changing the interested count's meaning.

Feed previews now also expose a lightweight status (`active` or `ended`) plus an `appliesToViewer` flag. The web client uses those fields to keep recently ended calls visible for a short history window, default the Play page to only calls that apply to the viewer, and let the viewer expand active or ended sections to all calls they are allowed to see in their network.

The Play-intent feed query itself must include not only broad network creators but also targeted calls that explicitly include the viewer, such as specific-friends or selected-server calls. That keeps the server-side visibility model authoritative while still allowing the web client to do lightweight `appliesToViewer` filtering without dropping visible calls before they reach the page.

Play intents also expose a dedicated detail contract in `packages/shared` and a corresponding API detail builder in `apps/api`. The web app uses that richer payload for `/play/:playIntentId`, which is the deep-link target for specific Discord DM buttons and for the in-app Open details action on Play cards. That detail view can still expand legacy library-wide calls into an explicit list of current overlapping games, and current calls continue to show their chosen titles directly.

Play intents can also attach an optional temporary Discord space in the Game's Up Discord server. That state is modeled explicitly as a `PlayIntentDiscordSpace` row plus per-user access grants so the API can track who already belongs to the server, who has already been invited, and who should receive access if they join later. The current provisioning flow creates a dedicated category with paired text and voice channels, posts an opening message in the text channel, and startup maintenance backfills still-active legacy spaces that only had the older voice-only shape before refreshing tracked Discord DMs.

Scheduled calls to play now add a second-stage check-in flow. The audience is still notified immediately at creation time, but the creator receives an explicit confirmation prompt when the scheduled start time arrives. If confirmed, accepted recipients receive a go-time update, unanswered recipients receive one follow-up reminder, those go-time messages remain actionable for later response changes, and recipients who previously declined or muted that creator remain opted out.

Creators also receive a persistent Discord DM summary for each live call to play. Major lifecycle changes can still replace that DM with a fresh message so Discord sends a notification, but audience response updates now edit the existing summary in place because the creator also receives a separate response-notification DM. When someone newly marks interested, other already-interested recipients can also receive a threaded system update under their retained invite prompt. Those creator-facing update DMs should reply to the tracked summary message when possible so multiple live calls remain visually distinguishable inside Discord. Quiet expiry or archive cleanup also falls back to edit-in-place behavior. In the gateway-owning environment it can expose creator-only actions such as ending the call directly from Discord while active, deleting the retained temporary Discord channel after the call ends, then switching to an archive action after the retained summary has gone stale. That retained creator summary is also the cleanup anchor for the thread, so archiving it should remove the summary and any bot-authored replies hanging beneath it.

The Play composer is modeled as a step-based web flow for basics, audience, timing, and details. Its audience model no longer has a separate self-only test-send branch, and its basics step now requires the creator to choose up to five specific games instead of targeting the whole library; the API and shared contracts stay focused on the real notification scopes.

For targeted friend calls, the detail contract now also includes passed-user identities in addition to interested-user identities. That data is only exposed for `specific-friends` calls so the web detail view can show who passed without broadening pass visibility for other audience scopes.

Notification and auto-play prompt rows also store the Discord DM message reference when the bot delivers an interactive DM. Recipient responses no longer send a separate confirmation DM: the API keeps the original invite prompt in place, updates its buttons and (for interested recipients) its temporary-Discord-space link buttons to match the current choice, and flashes a momentary confirmation on the pressed button before settling back. It still edits stale bot prompts in place when a play intent expires or an observed Discord activity ends, and decides between edit-in-place or full replacement when a live call-to-play update should trigger a fresh Discord notification. The legacy per-recipient response-DM reference columns remain on the notification row but are no longer written.

Auto-play prompts now use the same retained-anchor approach for closed outcomes. When a prompt closes because conditions changed or it can no longer complete, the original prompt DM is kept as the anchor with its interactive buttons removed, and the specific close reason is sent as a reply to that prompt instead of replacing it with a second standalone terminal state. Closed prompt threads eventually archive from that retained prompt anchor unless the prompt has already handed off into a creator summary, in which case the creator summary becomes the cleanup anchor for the thread.

The admin debug snapshot now exposes serialized DM previews for recent notification and auto-play prompt rows. Those previews are derived from the same DM payload builders used by the live bot runtime, so the web debug view can inspect current message output without maintaining a separate DM-emulator surface.

Those serialized DM previews include Discord embed payloads as well as button rows and fallback content. That keeps the read-only debug previews aligned with the live bot output as structured Discord flows move from markdown-heavy content blocks to embed-first layouts.

Tracked Discord DM rows also participate in retention cleanup. Auto-play prompts can still be removed after they age out. Call-to-play threads are shown as ended in place when the window closes — both creator and audience flows archive the retained main DM (marked once via `PlayIntent.dmChainEndedAt` so the sweep does not re-edit it, while keeping the anchor references intact) and sweep bot-authored dangling replies under the retained anchor — and the entire chain (creator summary, recipient invites, and their replies) is then deleted automatically by the hourly sweep 12 hours after the play-intent window ends. Retained temporary Discord spaces are deleted on a separate countdown, 12 hours after their last tracked text or voice activity (a backfill sweep retroactively assigns this countdown to retained spaces that lack one). Creators and recipients can still trigger the explicit archive action to clear the tracked bot-authored DM history sooner.

The Discord bot runtime is now intentionally split by environment. Exactly one environment should run the live Discord gateway connection for presence tracking and interactive Discord buttons, while other environments can reuse the same bot token in a REST-only mode for DM send/edit plus read-only server-member browsing without competing for gateway ownership.

Discord activity observations can also drive a secondary auto-prompt flow: when the presence bot sees a user start a game, the API can persist a prompt record, DM that user through the bot, and create a normal play intent if the user accepts.

The gateway-owning Discord bot can also react to plain DM text commands from linked users for lightweight control and cleanup. That command surface currently supports status checks against the latest active call to play, ending active calls to play, toggling auto-play prompts, and removing settled bot-authored DM history.

The same bot surface now also supports guild-only slash commands for server adoption and discovery shortcuts. Those commands generate richer invite flows, including a dedicated web invite landing page that preserves server and inviter context through Discord OAuth instead of dropping every invite into the generic app shell.

Invite acceptance attribution is persisted as its own relational record keyed to the accepted user, optional inviter identity, optional Discord server snapshot, and invite kind. The auth session can expose the latest attribution to the web app for onboarding copy, and the admin debug snapshot can expose recent attribution rows for operational verification.

That same presence stream now powers one-time live-activity nudges for active calls to play. Game-launch observations can send a threaded Discord reply under the retained call anchor when someone in the live group first launches the planned game, and Discord voice-state updates can do the same when someone first joins the associated voice channel. Audience-side nudges are limited to recipients who already expressed interest in that call, while creator-side nudges can still reflect audience activity. Those alerts are keyed to the active play-intent row so they naturally reset when the call is materially changed.

The API now runs a lightweight cleanup sweep for expired play intents so unanswered Discord invite prompts can be marked expired and rewritten even if the affected users do not immediately reopen the app. On process start, that same maintenance pass also refreshes tracked Discord DM content so restored environments do not leave stale buttons, embeds, or summary states behind.

Discord presence tracking now also maintains a lossy observed-game history keyed by Discord identity rather than only by app user. That lets the library API return suggested games based on titles the bot has seen the user playing, while still allowing non-members to contribute to the raw observation set. On API startup, a lightweight maintenance pass also repairs preexisting duplicate game rows whose titles collapse to the same normalized form so older trademark-split records do not keep fragmenting library, prompt, and observation state.

Discovery currently depends on explicit app follow links plus opted-in shared Discord servers. Those app links are directional, so one user can follow another without creating a mutual relationship. The Discord Activity-based friend import path has been removed.

Discord-linked identities now also persist Discord OAuth access and refresh tokens. The initial guild membership sync still happens during Discord OAuth, but signed-in users can later trigger a Network-page refresh that reuses the stored refresh token to pull their latest guild memberships without forcing a sign-out or full reconnect unless Discord has revoked the grant.

## Repository guidance

The repository includes shared Copilot customization files under `.github/`:

- `copilot-instructions.md` for workspace-wide guidance
- `instructions/` for area-specific rules
- `prompts/` for reusable implementation tasks
- `hooks/` plus `scripts/copilot/` for deterministic safety and startup context

These are kept small and focused so they remain usable during day-to-day implementation.
