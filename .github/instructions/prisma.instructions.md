---
applyTo: "apps/api/prisma/**"
description: "Use when editing the Prisma schema, data model relationships, notification entities, play intents, or database constraints."
---

# Prisma Instructions

- Prefer explicit join tables when product semantics matter. Do not collapse many-to-many relationships into opaque arrays.
- Keep indexes aligned with the product loop: shared-interest lookup, friend filtering, active play-intent lookup, and notification inbox reads.
- When product behavior changes, update enum names and relation names to stay descriptive instead of preserving outdated terms.
