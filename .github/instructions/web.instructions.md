---
applyTo: "apps/web/**"
description: "Use when working in the Vite web app, Joy UI components, PWA shell, or client data loading."
---

# Web Instructions

- Preserve the existing visual direction: dark atmospheric shell, strong typography, and cards with clear information density.
- Keep UI state simple while the API is still stubbed. Prefer direct data loading over introducing a state library early.
- Use shared schemas to validate server responses where practical so the frontend fails loudly when contracts drift.
- Prefer browser-first flows and platform standards over custom client-specific behavior.
- For directional UI actions, use rounded MUI arrow icons consistently: `WestRoundedIcon` for back/return navigation and `EastRoundedIcon` for forward/detail actions. Prefer icon decorators over inline Unicode arrow characters in button labels.
- For branded SVG assets in `apps/web/public`, keep the SVG as the source of truth. If a PNG export is needed for Discord or similar platforms, render it from the browser by capturing the SVG element itself rather than the full page or a generic CLI SVG rasterizer, then normalize the file to the requested square output size.
- When changing the Game's Up PWA icon assets or icon references, keep `apps/web/vite.config.ts` and `apps/web/index.html` aligned and bump the shared icon version query string so installed clients are forced to fetch the updated icon URLs.
- Keep the admin DM preview surfaces aligned with live Discord output. If the API adds or changes DM copy, embeds, buttons, or preview fields, update the web debug surfaces in the same change so the read-only previews continue to render supported message states correctly.
- Only show the PWA install CTA when the browser can actually install the app: wait for `beforeinstallprompt` on Chromium, use the manual fallback only on iOS Safari, and avoid generic install buttons in unsupported or already-installed browsers.

## Shared Helpers

- Build API URLs through `buildApiUrl` and `buildAbsoluteApiUrl` in `apps/web/src/lib/apiUrl.ts`. Do not concatenate base URLs inline.
- Read browser env (Vite `import.meta.env`) through `apps/web/src/lib/browserEnv.ts` so server-render contexts and tests can stub it.
- Extract API error messages with `extractErrorMessage` from `@game-is-up/shared` instead of repeating ad-hoc shape checks.
- Auto-dismissing notice/banner state in dashboard hooks goes through `useTimedNotice` in `apps/web/src/hooks/useTimedNotice.ts`.
- Dashboard data flow is composed in `useDashboardApp.tsx` from the play / library / invites sub-hooks; new dashboard surfaces should attach there rather than instantiating their own duplicate fetchers.
