# Game's Up: Agent Instructions

Game's Up is a friends-first game-discovery PWA: people sign in with Discord, keep a game library, see which friends share their games, and send calls to play that a Discord bot delivers as DMs and server posts. It is a web-only npm-workspaces monorepo (React web app, Express API, shared contracts package) deployed with Docker Compose to a self-hosted server, and it builds on devkit for the local development stack.

## Standards

This repo follows the shared standards at https://github.com/Dynamic-Solutions-Canada/app-standards. Read the index for this stack, https://github.com/Dynamic-Solutions-Canada/app-standards/blob/main/stacks/web.md, then the topic file for the area you are changing. If `external/standards/` exists, it is the same content pinned for offline use. Where this file differs from the standards, this file wins and says why.

## Architecture

- `apps/web` is the PWA and the only client. It is the source of truth for the user experience.
- `apps/api` is the Express API and the Discord bot. Product rules for discovery, friends and calls to play live here, explicitly, not in frontend-only logic.
- `apps/api/prisma` owns the PostgreSQL schema and migrations.
- `packages/shared` holds every HTTP contract (Zod schemas and types), used by both the API and the web app. Request and response shapes are never duplicated.
- Layers, data flow, the play-intent model and the Discord DM lifecycle are in [ARCHITECTURE.md](ARCHITECTURE.md).

Nested `AGENTS.md` files hold area rules. List them with `git ls-files '*AGENTS.md'` and read the ones for the folders you touch.

## Behaviour

- Discovery is friends-first by default. Do not make profiles fully public.
- A play intent targets a selected subset of one to five games. Keep clients and shared contracts aligned with that limit.
- Title-only play-intent edits are quiet changes. Do not re-notify recipients unless the audience, timing, or other substantive call-to-play details changed.
- There is no user-to-user chat; do not add it unless the task explicitly calls for it. Automated Discord notifications and call-to-play DMs are established product surfaces.

## Conventions and gotchas

- TypeScript everywhere, with strict typing intact.
- ASCII in source unless a file already needs Unicode, so generated and copied text stays predictable.
- Every non-trivial module opens with a short JSDoc header saying what it owns and any non-obvious invariants (cooldowns, retention windows, dedup keys, locking).
- If a route starts mixing transport, validation and business rules, split it; route handlers stay thin.
- When the Prisma schema changes, keep the shared contracts and the seed and placeholder data aligned in the same change.
- Root `typescript` is aliased to `@typescript/typescript6` (the TS 6 JS API that typescript-eslint and tsup's dts build need), while `@typescript/native` supplies the TypeScript 7 `tsc` that every build and typecheck script runs. Do not change `typescript` to a plain `^7` range until TS 7.1+ ships a programmatic API and the tooling supports it.
- `.npmrc` sets `engine-strict`, so npm on a host with another Node version fails with `notsup`. Run npm through devkit's pinned toolchain: `npx devkit run npm <args>`.
- A CLI dependency the development container needs goes in `docker/dev/Dockerfile`.

## Shared helpers (do not duplicate)

- Error messages from API responses: `extractErrorMessage` from `@game-is-up/shared`.
- Helpers owned by one workspace are listed in that workspace's `AGENTS.md`.

## Commands

The development stack is devkit-managed Docker Compose; setup is in [README.md](README.md).

| Command | Proves | Does not prove |
| --- | --- | --- |
| `npm run validate` | Lint, typecheck of every workspace, all unit tests, and a valid Prisma schema. Run it before finishing a task. | That the app builds for production or runs |
| `npm test` | Every `*.test.ts` under `apps/`, `packages/` and `scripts/` passes | The database tests, which skip unless `RUN_ACCOUNT_HUB_DATABASE_TESTS=1` and `RUN_INVITE_DATABASE_TESTS=1` point them at a database |
| `npm run typecheck --workspace @game-is-up/<shared, api or web>` | One workspace typechecks; the quick check while working in it | Anything about the other workspaces (`shared` must be built for `api` and `web` to see changes) |
| `npm run db:validate` | The Prisma schema is valid | That migrations apply |
| `npm run build` | The production build of all three workspaces succeeds | Runtime behaviour |
| `npm run dev` | The full stack starts locally | Production configuration |

Deployment goes through the `deploy` skill only.

## Guidance map

| Guide, doc, or skill | Read or use when | Governs |
| --- | --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Changing structure, data flow, or Discord DM behaviour | Whole repo |
| [.agents/guides/ui-conventions.md](.agents/guides/ui-conventions.md) | Building or changing any UI | `apps/web/src/**` |
| [README.md](README.md) | Setup, environment, deployment | Developer workflow |
| `commit` skill | Asked to commit | Commits |
| `deploy` skill | Asked to deploy | Commit, push and production deploy |
| `audit-docs` skill | Asked to check or sync documentation | All docs and agent files |

## Keeping docs current

| What changed | Update |
| --- | --- |
| Structure, data flow, Discord DM lifecycle | `ARCHITECTURE.md` |
| Setup, scripts, environment variables, deployment | `README.md` and the env examples |
| A UI pattern or shared web component | `.agents/guides/ui-conventions.md` |
| Area rules for the web app or the API (Prisma included) | That workspace's `AGENTS.md` |
| A shared helper added or replaced | The owning workspace's `AGENTS.md` ("Shared helpers" above for `packages/shared`) |
| A workflow an agent repeats | `.agents/skills/` |
