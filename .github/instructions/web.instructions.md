---
applyTo: "apps/web/**"
description: "Use when working in the Vite web app, Joy UI components, PWA shell, or client data loading."
---

# Web Instructions

- Preserve the existing visual direction: dark atmospheric shell, strong typography, and cards with clear information density.
- Keep UI state simple while the API is still stubbed. Prefer direct data loading over introducing a state library early.
- Use shared schemas to validate server responses where practical so the frontend fails loudly when contracts drift.
- Treat Android as a wrapper of the same interface, so avoid browser-only assumptions in core flows.
