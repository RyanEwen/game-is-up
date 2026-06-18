---
description: "Audit repository documentation and Claude customization files so they match the current codebase and workflow."
argument-hint: "Optional scope or recent change summary"
---

Audit the repository documentation and bring it back in sync with the current codebase.

Invocation arguments (may be empty): $ARGUMENTS

Requirements:
- Focus on accuracy, not churn.
- Update only the docs and customization files that are stale, incomplete, or misleading.
- Prefer verifying behavior from source files before editing documentation.
- Keep the `CLAUDE.md` files, `.claude/commands/`, and the `.claude/settings.json` hooks (with `.claude/hooks/`) coherent with the actual repository workflow.

Audit scope:
- `README.md`
- `ARCHITECTURE.md`
- `CLAUDE.md` files (root and the nested `apps/web`, `apps/api`, `apps/api/prisma` files)
- `.claude/commands/`
- `.claude/settings.json` hooks and `.claude/hooks/`
- Shared contract guidance implied by `packages/shared`, `apps/api`, and `apps/web`

Recommended steps:
1. Review the active change scope with `git status --short`, `git diff --stat`, and `git diff --cached --stat`.
2. Read the affected source files before editing docs.
3. Update high-level docs when setup, architecture, contracts, or workflow changed.
4. Update the `CLAUDE.md` instruction files when file coverage, conventions, or maintenance guidance drifted.
5. Update command files when the expected workflow or repository commands changed.
6. Update hook scripts when the automation behavior, command routing, or reminder logic changed.
7. If new files fall outside a nested `CLAUDE.md`'s directory coverage, move or add guidance so the right scope owns it.
8. Summarize what changed, what stayed correct, and any remaining documentation gaps.

Notes:
- Do not rewrite accurate sections just for style consistency.
- When the code and docs disagree, verify the code before choosing the final wording.
