---
applyTo: "apps/api/**"
description: "Use when working in the Express API, route modules, service logic, auth, discovery, notifications, or server configuration."
---

# API Instructions

- Validate external input at the boundary using shared Zod schemas or local Zod schemas when the contract is not shared yet.
- Keep route handlers thin. Put reusable logic in modules under `src/lib` or future domain folders.
- Favor additive API changes that preserve existing placeholder clients while the product model is still being established.
- When a feature depends on privacy or moderation, add the data shape first even if the workflow is still stubbed.
- For Discord DM flows, treat edit-vs-replace as a product behavior choice: replace the message when the user should get a fresh Discord notification about a meaningful live update, and edit in place only for quiet state changes such as expiry, archival, or fallback recovery when resend fails.
- When changing any Discord DM content, components, embeds, or branching states, update the live runtime payload builders, the debug template library, the debug snapshot/emulator payload builders, any shared preview serialization/schema, and the web DM preview renderer together so the admin emulator stays aligned with real bot output.
- When adding a new DM flow or a materially new DM state, add or update a DM template entry and make sure the DM emulator can surface that message path from real debug snapshot data, not just from hard-coded template samples.
- Keep cleanup-specific or archived DM/embed builders close to the cleanup modules that own them. Pulling those builders back into play-intent response modules can create avoidable runtime dependency cycles.
