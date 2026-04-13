# Game's Up Workspace Instructions

## Architecture

- Treat the app as web-first. The PWA in `apps/web` is the source of truth and the only client surface in this workspace.
- Keep HTTP contracts in `packages/shared` and use them from both the API and the web app. Do not duplicate request or response shapes.
- Keep discovery, friends, and play-intent behavior explicit in the API. Avoid hiding product rules in frontend-only logic.

## Code Style

- Prefer TypeScript everywhere and keep strict typing intact.
- Keep modules focused and small. If a route starts mixing transport, validation, and business rules, split it.
- Use ASCII unless a file already needs Unicode.

## Build And Validation

- Use the devcontainer for local development when possible.
- If a broadly useful CLI dependency is missing from the devcontainer during normal repo work, add it to `.devcontainer/Dockerfile` instead of repeatedly working around it.
- Before finishing a task, run `npm run validate` from the repository root.
- If Prisma schema changes, keep the shared contracts and placeholder/mock data aligned.

## Product Conventions

- Discovery is friends-first by default; do not accidentally make profiles fully public in early slices.
- Play intent is not restricted to one game. Model both “any game in my library” and “selected subset” flows.
- Keep direct messaging out of MVP unless the task explicitly adds it.
