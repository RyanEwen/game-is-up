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
