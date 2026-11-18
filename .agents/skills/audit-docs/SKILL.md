---
name: audit-docs
description: Audit and update this repository's documentation and agent files when the user asks to check documentation accuracy or sync docs with the codebase.
---

# Audit repository documentation

Bring repository documentation back in sync with verified source behavior. Prefer accuracy over churn, and do not rewrite correct sections solely for stylistic consistency.

## Scope

Review the parts relevant to the change:

- `README.md` for setup, workflows, and user-visible behavior
- `ARCHITECTURE.md` for structure, runtime behavior, contracts, and data flow
- Root and nested `AGENTS.md` files for repository and area-specific guidance
- `.agents/skills/` when reusable workflows changed
- `.agents/guides/` when a convention or guided area changed
- Shared contract guidance when `packages/shared`, the API, or the web boundary changed

## Workflow

1. Inspect staged and unstaged changes and read the affected source before editing documentation.
2. Verify disputed behavior from source, tests, or configuration.
3. Update only stale, incomplete, misleading, or incorrectly scoped guidance.
4. Keep nested `AGENTS.md` guidance in the narrowest directory it governs.
5. Keep skills and guides coherent with the actual repository workflow.
6. Report what changed, what remained accurate, and any unresolved documentation gaps.

Treat any additional user-supplied scope as context, not as permission for unrelated changes.
