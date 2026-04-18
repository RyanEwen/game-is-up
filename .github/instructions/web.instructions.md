---
applyTo: "apps/web/**"
description: "Use when working in the Vite web app, Joy UI components, PWA shell, or client data loading."
---

# Web Instructions

- Preserve the existing visual direction: dark atmospheric shell, strong typography, and cards with clear information density.
- Keep UI state simple while the API is still stubbed. Prefer direct data loading over introducing a state library early.
- Use shared schemas to validate server responses where practical so the frontend fails loudly when contracts drift.
- Prefer browser-first flows and platform standards over custom client-specific behavior.
- Only show the PWA install CTA when the browser can actually install the app: wait for `beforeinstallprompt` on Chromium, use the manual fallback only on iOS Safari, and avoid generic install buttons in unsupported or already-installed browsers.
