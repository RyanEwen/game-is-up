# Game's Up Workspace Instructions

Area-specific guidance lives in nested `AGENTS.md` files. Codex loads the instruction chain from the repository root to the session's starting directory. When a root-started task touches `apps/web`, `apps/api`, or `apps/api/prisma`, read the applicable nested file before editing. Keep guidance in the narrowest directory it governs.

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

- Use the Devkit-managed Compose stack for local development.
- If a broadly useful CLI dependency is missing from the development process container, add it to `docker/dev/Dockerfile`.
- Before finishing a task, run `npm run validate` from the repository root.
- If Prisma schema changes, keep the shared contracts and placeholder/mock data aligned.
- The root `typescript` dependency is intentionally aliased to `@typescript/typescript6` (TS 6 JS API for typescript-eslint and tsup dts), while `@typescript/native` supplies the TypeScript 7 native `tsc` used by all build and typecheck scripts. Do not revert `typescript` to a plain `^7` range until TS 7.1+ ships a programmatic API and the tooling supports it.

## Product Conventions

- Discovery is friends-first by default; do not accidentally make profiles fully public in early slices.
- A play intent targets a selected subset of one to five games. Keep clients and shared contracts aligned with that limit.
- Title-only play-intent edits are quiet changes. Do not re-notify recipients unless the audience, timing, or other substantive call-to-play details changed.
- Do not add user-to-user chat unless the task explicitly calls for it. Automated Discord notification and call-to-play DM flows are established product surfaces.
