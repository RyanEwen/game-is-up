# Game's Up Workspace Instructions

## Architecture

- Treat the app as web-first. The PWA in `apps/web` is the source of truth and the only client surface in this workspace.
- Keep HTTP contracts in `packages/shared` and use them from both the API and the web app. Do not duplicate request or response shapes.
- Keep discovery, friends, and play-intent behavior explicit in the API. Avoid hiding product rules in frontend-only logic.

## Code Style

- Prefer TypeScript everywhere and keep strict typing intact.
- Keep modules focused and small. If a route starts mixing transport, validation, and business rules, split it.
- Use ASCII unless a file already needs Unicode.

## Documentation

- Non-trivial modules (anything more than a few lines or anything that owns product behavior) should carry a short JSDoc header at the top of the file describing what the module owns and any non-obvious invariants. Keep it factual.
- Exported symbols whose behavior is not obvious from the name and signature deserve a brief JSDoc. Internal helpers can stay uncommented unless the implementation is surprising.
- It is fine (and encouraged) to add or improve docstrings on existing modules you touch, even when the user request did not specifically ask for documentation.

## Shared Helpers (do not duplicate)

- Auth on Express routes: `requireSignedInUserId` and `getUserAdminStatus` from `apps/api/src/lib/route-auth.ts`. Do not re-derive session lookups in routes.
- Media proxy endpoints: build with `createMediaHandler` from `apps/api/src/lib/media-handler.ts` rather than open-coding cache + token + content-type wiring.
- Browser-side API URL construction: `buildApiUrl` and `buildAbsoluteApiUrl` from `apps/web/src/lib/apiUrl.ts`. Browser env access goes through `apps/web/src/lib/browserEnv.ts`.
- Error message extraction from API responses: `extractErrorMessage` from `@game-is-up/shared`.
- Auto-dismissing notice/banner state in dashboard hooks: `useTimedNotice` from `apps/web/src/hooks/useTimedNotice.ts`.

## Build And Validation

- Use the devcontainer for local development when possible.
- If a broadly useful CLI dependency is missing from the devcontainer during normal repo work, add it to `.devcontainer/Dockerfile` instead of repeatedly working around it.
- Before finishing a task, run `npm run validate` from the repository root.
- If Prisma schema changes, keep the shared contracts and placeholder/mock data aligned.

## Product Conventions

- Discovery is friends-first by default; do not accidentally make profiles fully public in early slices.
- Play intent is not restricted to one game. Model both “any game in my library” and “selected subset” flows.
- Title-only play-intent edits are quiet changes. Do not re-notify recipients unless the audience, timing, or other substantive call-to-play details changed.
- Keep direct messaging out of MVP unless the task explicitly adds it.
