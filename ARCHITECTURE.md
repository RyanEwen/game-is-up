# Game's Up: Architecture

How the product behaves for users, feature by feature, is in [docs/behaviour.md](docs/behaviour.md); this document covers the structure and data flow behind it.

## High-level flow

`apps/web` is the primary product surface: a Vite-built PWA with a Joy UI interface and shared TypeScript contracts from `packages/shared`. `apps/api` exposes the typed HTTP surface for auth, discovery, and play-intent orchestration.

Most client data still loads through normal HTTP requests, but signed-in dashboard sessions also hold one authenticated Server-Sent Events connection to the API. That stream carries low-detail invalidation events so the web client can re-fetch shared dashboard state when another user or another tab changes something impactful.

## Layers

| Layer             | Description                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`        | Web-first client shell, discovery UI, auth entry points, and installable PWA behavior.                                                            |
| `apps/api`        | Express API, auth integration, discovery ranking, notification fan-out, SSE invalidation publishing, and persistence orchestration around Prisma. |
| `packages/shared` | Zod schemas, DTOs, SSE event contracts, and shared runtime validation used by both the web app and API.                                           |
| `apps/api/prisma` | Core relational model for users, friends, game interests, play intents, moderation, and notifications.                                            |

## API skeleton

Every request gets a correlation id from the first middleware: it is returned as `X-Request-Id`, added to every log line written while handling the request, and included in error bodies, so a failure a user reports can be found in the logs. The API logs only through `apps/api/src/lib/logger.ts`, which reduces errors to their name, message, code, stack and cause so library errors cannot leak URLs, tokens or request bodies.

Every failed request answers with one shape, `{ error, code, requestId }` (`apiErrorResponseSchema` in the shared package): `error` is copy safe to show the user, and `code` is stable for clients. Unknown `/api` paths answer 404 in that shape, and a malformed JSON body is a 400, not a 500.

Rate limits are per route, not global, because the media route serves many covers per page and the dashboard refetches in bursts (`apps/api/src/lib/rate-limits.ts`). Sign-in and Steam linking allow 30 attempts per client per 15 minutes; writes that notify people through Discord (saving, starting or answering a call to play, inviting a friend, retrying a Discord space) allow 60. A rejection is a 429 in the error shape with code `rate_limited`. The client is told apart by address: the server's nginx site restores the visitor's address from Cloudflare's `CF-Connecting-IP` only for requests from Cloudflare's ranges (`nginx.server.conf`), and the API trusts exactly that one proxy hop, so a caller reaching the server directly cannot forge its address.

`GET /api/health` is liveness: it answers whenever the process is serving, and the container health check uses it, so a database outage never restarts the API. `GET /api/health/ready` is readiness: it pings the database with a two-second limit and answers 503 when that fails. The optional Discord bot does not count towards readiness.

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

Accepted participants can add one of their own followed users to a call when the organizer allows participant invitations. The web and Discord pickers use the same API service and eligibility checks. `PlayIntentParticipantInvite` records each addition independently from the organizer's selected audience, so disabling further invitations or editing the audience does not remove existing additions. A call-row lock serializes invitation creation with organizer edits.

Audience answers belong to the retained `FRIEND_PLAYING` invitation. Informational scheduled reminders and confirmations do not override that answer. Substantive edits record `Notification.responseResetAt` and require a new answer. The upgrade preserves unambiguous legacy answers and requires reacceptance where a historical acceptance cannot be distinguished from a later organizer reset.

Organizer and participant invitation delivery share a notification-specific PostgreSQL session advisory lock. A separate pool with one connection per API process keeps lock waiters outside Prisma's query pool and retains ownership through slow Discord operations. Both senders rebuild their payload from current state after acquiring the lock, then reconcile tracked messages with edits, expiry, or deletion before releasing it. A lost lock connection aborts further sends and reports an uncertain outcome.

Users can keep multiple active play intents at once as long as their availability windows do not overlap. The API write path enforces that overlap rule against the creator's other active calls, and the web composer edits one explicitly selected active intent at a time instead of assuming there is only one current call. Library writes can also retroactively backfill missing notification rows and Discord delivery for still-active calls that newly apply to the updated recipient.

Notification rows can now also track whether a recipient explicitly said they would join from a Discord DM prompt. That keeps the response flow attached to the original play intent instead of introducing a second RSVP-specific entity. A nullable `runningLateAt` timestamp on the same row models "I'll be late" as a modifier on an existing interested response rather than a separate response state: it requires a prior join, never replaces the stored interested/pass choice, and clears when the recipient passes. The optional `runningLateMinutes` estimate accepts whole minutes from 1 to 1440; null means unknown. The web detail page and Discord modal share validation and the same response service, which checks ownership, current interest, and expiry. New or revised estimates update the creator's summary and fan out through the existing status log to the creator and other invited recipients who have not passed. Repeating an unchanged estimate stays quiet.

For audience-facing Discord delivery, the current model is anchor-plus-replies: the original invite DM is the retained anchor message, quiet state changes edit that anchor in place, and follow-up events such as invite updates, go-time reminders, go-time confirmations, and ended notices are sent as replies to that retained invite when possible. When a threaded invite flow reaches its retained ended state, the eventual archive action lives on that retained anchor and is expected to clear both the anchor and its bot-authored dangling replies for that user.

Live SYSTEM status updates on an active call (interest confirmed, pass, running late, voice-channel join, game launch) do not each get their own DM. Every recipient, creator included, has at most one per-intent "updates log" DM (owned by `apps/api/src/lib/play-intent-updates-log.ts`) that lists all such updates newest-first as a reply under that recipient's anchor, each line stamped with a compact "Fri 7:05pm" timestamp in that recipient's own timezone. Updates fan out to every invited recipient who has not passed: interested players and not-yet-responded invitees alike. A pass is treated like any other response change: it always reaches the creator and that whole group ("Another player can't make it"), on every audience scope, deliberately accepting the extra pings on a broadcast call in exchange for everyone knowing who dropped out. Saying you can't make it is what removes a recipient from the fan-out and stops the pings. Recipients who have not answered their invite get a trailing call-to-action line pointing back at the invite buttons. Each new event deletes and re-sends that log DM because a fresh message is the only way Discord raises a push notification; quiet corrections (startup refresh, response resets after a substantive edit) edit it in place. The Discord message refs are tracked on exactly one SYSTEM notification row per (play intent, recipient) pair so the archive and retention sweeps keep seeing a single tracked message. The log DM renders as pure plain text, with no `<@id>` mentions and no markdown such as `-#` subtext, because Android push notifications show the raw message content; mentions and markup remain only on the original invite/summary embeds and on in-place edits, which never trigger a push. Other freshly sent DMs (go-time replies, the creator check-in prompt) likewise use plain display names.

Play-intent feed and current-intent payloads now also include lightweight interested-user previews derived from interested responses. That lets the web app render interested-player summaries directly on the Play view without a second lookup for basic identity data. Each interested-user preview carries a `runningLate` flag and optional `runningLateMinutes` estimate; previews expose `viewerRunningLate` and optional `viewerRunningLateMinutes` fields. The web and Discord summaries can split running-late players into their own list without changing the interested count's meaning. Shared contracts keep older payloads without estimates compatible, and both real-data debug previews and the local DM simulator include delay estimates and revision controls.

Feed previews now also expose a lightweight status (`active` or `ended`) plus an `appliesToViewer` flag. The web client uses those fields to keep recently ended calls visible for a short history window, default the Play page to only calls that apply to the viewer, and let the viewer expand active or ended sections to all calls they are allowed to see in their network.

The Play-intent feed query itself must include not only broad network creators but also targeted calls that explicitly include the viewer, such as specific-friends or selected-server calls. That keeps the server-side visibility model authoritative while still allowing the web client to do lightweight `appliesToViewer` filtering without dropping visible calls before they reach the page.

Play intents also expose a dedicated detail contract in `packages/shared` and a corresponding API detail builder in `apps/api`. The web app uses that richer payload for `/play/:playIntentId`, which is the deep-link target for specific Discord DM buttons and for the in-app Open details action on Play cards. That detail view can still expand legacy library-wide calls into an explicit list of current overlapping games, and current calls continue to show their chosen titles directly.

Play intents can also attach an optional temporary Discord space in the Game's Up Discord server. That state is modeled explicitly as a `PlayIntentDiscordSpace` row plus per-user access grants so the API can track who already belongs to the server, who has already been invited, and who should receive access if they join later. The current provisioning flow creates a dedicated category with paired text and voice channels, posts an opening message in the text channel, and startup maintenance backfills still-active legacy spaces that only had the older voice-only shape before refreshing tracked Discord DMs.

The space's shareable invite deliberately does not point at the temporary channels themselves. Those channels deny `ViewChannel` to `@everyone`, and an invite whose target channel the invitee cannot see is useless to the non-members it exists for, so the invite is created against a channel a brand-new member can actually land on: the guild rules channel, the system channel, or the first `@everyone`-visible text channel, falling back to the space's own text channel only when the guild exposes nothing public. Access to the temporary channels comes from the space role, which is granted on `GuildMemberAdd` once the invitee is in the server, not from the invite target.

When a recipient marks themselves interested on a call whose temporary space lives in a server they have not joined, they also get a dedicated "join the Discord server" DM (`apps/api/src/lib/play-intent-discord-space-invite-dm.ts`) rather than only a link appended to the interested acknowledgement: being asked to join a whole server needs room to explain what the server is and that channel access is granted automatically. `PlayIntentDiscordSpaceAccessGrant.inviteSentAt` is claimed before the send, so the DM goes out at most once per (space, recipient) even across interested/pass flip-flops, and it is sent as a reply under the recipient's tracked invite so the end-of-call cleanup sweep collects it with the rest of the chain. That DM is not backed by a `Notification` row (a SYSTEM row would land in the updates log), so it is currently the one call-to-play DM the admin debug snapshot cannot preview.

Scheduled calls to play now add a second-stage check-in flow. The audience is still notified immediately at creation time, but the creator receives an explicit confirmation prompt when the scheduled start time arrives. If confirmed, accepted recipients receive an informational go-time update, unanswered recipients receive one follow-up reminder, and recipients who previously declined or muted that creator remain opted out. Recipient answers stay on the original invitation, whose controls remain available for later response changes.

Creators also receive a persistent Discord DM summary for each live call to play. Major lifecycle changes can still replace that DM with a fresh message so Discord sends a notification, but audience response updates now edit the existing summary in place because the creator also receives the consolidated updates-log DM described above. When someone newly marks interested, passes, or flags running late, every other invited recipient who has not passed sees the same event appended to their own updates-log DM. Those creator-facing update DMs should reply to the tracked summary message when possible so multiple live calls remain visually distinguishable inside Discord. Quiet expiry or archive cleanup also falls back to edit-in-place behavior. In the gateway-owning environment it can expose creator-only actions such as ending the call directly from Discord while active, deleting the retained temporary Discord channel after the call ends, then switching to an archive action after the retained summary has gone stale. That retained creator summary is also the cleanup anchor for the thread, so archiving it should remove the summary and any bot-authored replies hanging beneath it.

The Play composer is modeled as a step-based web flow for basics, audience, timing, and details. Its audience model no longer has a separate self-only test-send branch, and its basics step now requires the creator to choose up to five specific games instead of targeting the whole library; the API and shared contracts stay focused on the real notification scopes.

The detail contract includes passed-user identities in addition to interested-user identities. Creators always see who could not make their own call, on every audience scope. Other viewers only see that list on `specific-friends` and `friends-list` calls, where the whole audience is already told about passes, so pass visibility is not broadened for broadcast scopes.

Notification and auto-play prompt rows also store the Discord DM message reference when the bot delivers an interactive DM. Recipient responses no longer send a separate confirmation DM: the API keeps the original invite prompt in place, updates its buttons and (for interested recipients) its temporary-Discord-space link buttons to match the current choice, and flashes a momentary confirmation on the pressed button before settling back. It still edits stale bot prompts in place when a play intent expires or an observed Discord activity ends, and decides between edit-in-place or full replacement when a live call-to-play update should trigger a fresh Discord notification. The legacy per-recipient response-DM reference columns remain on the notification row but are no longer written.

Auto-play prompts now use the same retained-anchor approach for closed outcomes. When a prompt closes because conditions changed or it can no longer complete, the original prompt DM is kept as the anchor with its interactive buttons removed, and the specific close reason is sent as a reply to that prompt instead of replacing it with a second standalone terminal state. Closed prompt threads eventually archive from that retained prompt anchor unless the prompt has already handed off into a creator summary, in which case the creator summary becomes the cleanup anchor for the thread.

The admin debug snapshot now exposes serialized DM previews for recent notification and auto-play prompt rows. Those previews are derived from the same DM payload builders used by the live bot runtime, so the web debug view can inspect current message output without maintaining a separate DM-emulator surface.

Those serialized DM previews include Discord embed payloads as well as button rows and fallback content. That keeps the read-only debug previews aligned with the live bot output as structured Discord flows move from markdown-heavy content blocks to embed-first layouts.

Tracked Discord DM rows also participate in retention cleanup. Auto-play prompts can still be removed after they age out. Call-to-play threads are shown as ended in place when the window closes: both creator and audience flows archive the retained main DM (marked once via `PlayIntent.dmChainEndedAt` so the sweep does not re-edit it, while keeping the anchor references intact) and sweep bot-authored dangling replies under the retained anchor. The entire chain (creator summary, recipient invites, and their replies) is then deleted automatically by the hourly sweep 12 hours after the play-intent window ends. Retained temporary Discord spaces are deleted on a separate countdown, 12 hours after their last tracked text or voice activity (a backfill sweep retroactively assigns this countdown to retained spaces that lack one). Creators and recipients can still trigger the explicit archive action to clear the tracked bot-authored DM history sooner.

The Discord bot runtime is now intentionally split by environment. Exactly one environment should run the live Discord gateway connection for presence tracking and interactive Discord buttons, while other environments can reuse the same bot token in a REST-only mode for DM send/edit plus read-only server-member browsing without competing for gateway ownership.

Discord activity observations can also drive a secondary auto-prompt flow: when the presence bot sees a user start a game, the API can persist a prompt record, DM that user through the bot, and create a normal play intent if the user accepts.

The gateway-owning Discord bot can also react to plain DM text commands from linked users for lightweight control and cleanup. That command surface currently supports status checks against the latest active call to play, ending active calls to play, toggling auto-play prompts, and removing settled bot-authored DM history.

The same bot surface now also supports guild-only slash commands for server adoption and discovery shortcuts. Those commands generate richer invite flows, including a dedicated web invite landing page that preserves server and inviter context through Discord OAuth instead of dropping every invite into the generic app shell.

Calls to play can also be created from inside Discord through a wizard that mirrors the web composer's steps, rendered as one ephemeral message that updates in place. It is reachable from a persistent channel button (placed and refreshed by a Manage Server admin via `setup-ctp-post`, with the post location tracked on the Discord server record so re-runs replace the previous post; an optional `lock-channel` flag denies member sends/threads in that channel via permission overwrites so the post stays visible, and passing it as false lifts exactly those denies) and from the `post-ctp` slash command in guilds or bot DMs. The wizard's game picker lists the user's playable library alphabetically, 25 games per page, with dedicated paging buttons under the select. Wizard state lives in per-user, per-context draft rows with a 24-hour TTL so dismissed ephemeral messages resume, all component routing uses the stateless `guild-ctp:` customId prefix and draft id so bot restarts do not orphan buttons, and posting delegates to the same play-intent upsert service as the web app so audience rules, validation, and notification side effects stay identical. Free-text timing input is parsed in the user's stored timezone. Unlinked Discord users are handed the invite landing link instead of the wizard.

The persistent channel launch post is a combined Game's Up hub. Its join action reuses the web invite landing page and regular Discord OAuth with server context. Linked users can manage games, one-way app follows, and reusable friends lists through ephemeral panels, including initial setup before web onboarding is finished. The panels own the stateless `account-hub:` customId prefix, include the interacting Discord user id in private controls, and resolve the linked app account on each interaction. Public launches use the shared action lifecycle's private-launch mode so personal responses never edit or disable the shared hub. Private reads and mutations recheck record ownership, missing records return to a current panel, and removal actions require confirmation. Mutable game/list controls carry compact timestamp revisions. Shared writes advance revisions strictly, including within one millisecond, under transactional PostgreSQL locks; stale private updates and confirmations fail without changing data. Follow-removal confirmations target the original owned follow id so they cannot remove a later refollow. Platform fields preserve all current rows in place when left blank during editing.

Game panels share the catalog search and library mutation services with HTTP. Catalog controls carry stable provider references; only the selected match is resolved into a canonical game. Library writes share a user/game advisory transaction lock across HTTP, private panels, and Steam import; list writes lock their owned row. Steam import uses the transaction-only writer and retains once-per-batch side effects. Library saves replace platforms transactionally, backfill eligible live-call notifications, and invalidate the same dashboard domains as web writes. Friend discovery uses `buildDiscoveryFeed` and rechecks current eligibility before adding from a stale picker, including both directions of blocks and selected-server visibility. The underlying HTTP friend policy remains unchanged. Friends-list mutation services own validation and dashboard invalidation for both transports. Membership edits replace only the displayed page and retain other pages; all read/write membership checks use current app follows. List edits never change already-sent audiences. Selects page at Discord's 25-option limit, catalog search retains the web eight-result limit, and private panels include corresponding web App shortcuts.

Errors in the Discord composer and management panels use a shared typed notice builder: a separate red error embed precedes the content/summary, while success and informational notices remain distinct. Review blockers keep the Post control disabled. Lookup and render failures resolve the original ephemeral response with database-independent recovery controls, rather than leaving a deferred launch waiting or retrying the same failing read.

Automatic presence prompts reuse the Discord composer with an independent prompt-linked draft. The detected game and immediate start are fixed; every other manual composer setting remains available. Posting rechecks source ownership, opt-in, and active detection. A shared message-action lifecycle acknowledges ordinary component interactions before business work, disables controls during processing, prevents concurrent actions on a message or draft, and restores the latest controls after completion or failure. Modal-opening actions preserve their initial response for the form. Admin previews serialize pending states and select controls from the same payloads.

Invite acceptance attribution is persisted as its own relational record keyed to the accepted user, optional inviter identity, optional Discord server snapshot, and invite kind. The auth session can expose the latest attribution to the web app for onboarding copy, and the admin debug snapshot can expose recent attribution rows for operational verification.

That same presence stream now powers one-time live-activity nudges for active calls to play. Game-launch observations can send a threaded Discord reply under the retained call anchor when someone in the live group first launches the planned game, and Discord voice-state updates can do the same when someone first joins the associated voice channel. Audience-side nudges are limited to recipients who already expressed interest in that call, while creator-side nudges can still reflect audience activity. Those alerts are keyed to the active play-intent row so they naturally reset when the call is materially changed.

The API now runs a lightweight cleanup sweep for expired play intents so unanswered Discord invite prompts can be marked expired and rewritten even if the affected users do not immediately reopen the app. On process start, that same maintenance pass also refreshes tracked Discord DM content so restored environments do not leave stale buttons, embeds, or summary states behind.

Discord presence tracking also maintains a lossy observed-game history for signed-up users, keyed by account (`DiscordObservedGame`, deleted with the account). That lets the library API return suggested games based on titles the bot has seen the user playing, and the friends' trending row. Everyone else the bot sees in a shared server, including members who never signed up, is counted only anonymously per game, server and UTC day (`DiscordGameActivityDaily`), with no identifier stored (owned by `apps/api/src/lib/discord-activity.ts`). On API startup, a lightweight maintenance pass also repairs preexisting duplicate game rows whose titles collapse to the same normalized form so older trademark-split records do not keep fragmenting library, prompt, and observation state.

Discovery currently depends on explicit app follow links plus opted-in shared Discord servers. Those app links are directional, so one user can follow another without creating a mutual relationship. The Discord Activity-based friend import path has been removed.

Discord-linked identities now also persist Discord OAuth access and refresh tokens. The initial guild membership sync still happens during Discord OAuth, but signed-in users can later trigger a Network-page refresh that reuses the stored refresh token to pull their latest guild memberships without forcing a sign-out or full reconnect unless Discord has revoked the grant.

## Repository guidance

Agents use the root and nested `AGENTS.md` files for scoped project guidance, `.agents/guides/` for topic guides, and `.agents/skills/` for reusable workflows (reached by Claude Code through the `.claude/skills` symlink).

These files stay small and focused so they remain usable during day-to-day implementation.

## PWA updates

Worker activation, periodic checks and wake-up signals compare the loaded page's
build stamp with the uncached `build-id.json` probe. Only a confirmed mismatch
reloads the page, with one recorded attempt per target to prevent loops. The build
identity covers emitted HTML, code, styles, the manifest and public assets, so
HTML-only releases are detectable without unconditional worker refreshes. Online
navigations fetch current HTML; offline navigations use the matching precached shell.

Temporary Discord space invitations are owned by `discord-space-invites.ts`. They target a public landing channel and assign only that space's dedicated role when accepted, including by existing guild members. The cleanup sweep upgrades legacy server-only invites without reprovisioning channels or resetting retention. It saves a replacement before retiring the old invite and discards unsaved replacements. Discord failures during invite upgrades do not block channel deletion. Guild member joins still repair tracked recipient access, but never infer channel access from invite-use counters.
