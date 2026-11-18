---
name: commit
description: Review, validate, stage, and commit repository changes when the user asks for a Git commit.
---

# Commit repository changes

Create one coherent, verified commit from the changes the user placed in scope.

## Workflow

1. Review staged and unstaged changes. Do not include secrets, build output, or unrelated generated files.
2. Review relevant documentation before committing:
   - `README.md` for headline features, and `docs/` (development, deployment, behaviour) for setup, workflow, or user-visible behavior
   - `ARCHITECTURE.md` for structural or data-flow changes
   - Root and nested `AGENTS.md` files for guidance affected by the change
   - `.agents/skills/` and `.agents/guides/` when their workflows or conventions changed
   - Shared contract guidance when API/web boundaries changed
3. Run validation proportional to the change. Prefer targeted checks, and use `npm run validate` for broad or cross-cutting changes.
4. Stage explicit intended paths. Use `git add -A` only after confirming every worktree change belongs in the commit.
5. Use an imperative commit subject. Add a short body only when it explains a non-obvious reason.
6. Commit without an extra confirmation unless the user asked to review or approve the message first.
7. Push only when the user explicitly requested it.
