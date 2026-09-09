# API Workspace Instructions

Scope: applies when working in the Express API, route modules, service logic, auth, discovery, notifications, or server configuration (`apps/api/**`). Prisma-specific guidance is layered from `prisma/AGENTS.md` when working in that directory.

- Validate external input at the boundary using shared Zod schemas or local Zod schemas when the contract is not shared yet.
- Keep route handlers thin. Put reusable logic in modules under `src/lib` or future domain folders.
- Favor backward-compatible, additive API changes unless the task explicitly includes a coordinated contract break across shared schemas and clients.
- When a feature depends on privacy or moderation, add the data shape first even if the workflow is still stubbed.
- For Discord DM flows, treat edit-vs-replace as a product behavior choice: replace the message when the user should get a fresh Discord notification about a meaningful live update, and edit in place only for quiet state changes such as expiry, archival, or fallback recovery when resend fails.
- SYSTEM status updates on an active call to play (interest, pass, running late, voice join, game launch) share one per-recipient updates-log DM owned by `apps/api/src/lib/play-intent-updates-log.ts`. Do not send per-event system DMs; create/update the notification rows and call the log module's sync (new event) or refresh (quiet correction) helpers.
- A pass on a call to play notifies the creator and every other non-passed recipient, on every audience scope. `resolveRecipientResponseTransition` in `apps/api/src/lib/play-intent-recipient-response-transition.ts` owns that decision: a real change of answer notifies, a repeat of the same answer stays silent, and audience scope is deliberately not a factor. Do not reintroduce a scope gate to trim pass pings.
- User-facing copy for a pass says "Can't make it" / "unable to make it", never "Pass"/"Passed". The stored enum stays `DECLINE` and internal identifiers stay `pass*`; only display strings changed.
- Interested/pass DM decorations must stay visually distinct: `✅` for interested and `❌` for a pass. Do not use `❎`, which reads as a green checkmark at push-notification size.
- Freshly sent (or delete-and-resent) DM messages must be push-safe: plain display names (never `<@id>` mentions) and no markdown that Discord's mobile push renders raw, such as `-#` subtext. Android push notifications show the raw message content. Mentions and markup are allowed only on the original invite/summary content and on in-place edits that never trigger a notification.
- When changing any Discord DM content, components, embeds, or branching states, update the live runtime payload builders, any serialized debug preview builders, the shared preview serialization/schema, and the web DM preview renderer together so read-only debug previews stay aligned with real bot output.
- When adding a new DM flow or a materially new DM state, make sure the debug snapshot still exposes the relevant preview payloads from real runtime data where the admin web surfaces depend on them.
- Keep cleanup-specific or archived DM/embed builders close to the cleanup modules that own them. Pulling those builders back into play-intent response modules can create avoidable runtime dependency cycles.
- Interactive Discord components route by customId prefix through the presence bot's InteractionCreate dispatcher. The call-to-play composer (channel button, /post-ctp, /setup-ctp-post) owns the `guild-ctp:` prefix in `apps/api/src/lib/discord-ctp-composer.ts`; new interactive surfaces should claim their own prefix and register there rather than adding ad-hoc listeners.

## Shared Helpers

- Authentication on Express routes goes through `requireSignedInUserId` and `getUserAdminStatus` in `apps/api/src/lib/route-auth.ts`. Routes should not re-derive session lookups inline.
- Media proxy endpoints (game covers, avatars, anything cached and token-wrapped) should use the `createMediaHandler` factory in `apps/api/src/lib/media-handler.ts` rather than open-coding cache, token decoding, or content-type wiring.
- Each route file should carry a short JSDoc module header describing what it owns. Service modules in `src/lib` should do the same plus document any non-obvious invariants (cooldowns, retention windows, dedup keys, locking).
