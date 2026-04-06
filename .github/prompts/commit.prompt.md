---
name: "Commit Changes"
description: "Stage, review, and commit the current changes with mandatory documentation review, a proposed message, and explicit push confirmation."
argument-hint: "Optional message hint or summary of the change"
agent: "agent"
model: "GPT-5 (copilot)"
---

Commit the current changes to git.

Requirements:
- Review both staged and unstaged changes before deciding on the final commit scope.
- Stage all relevant tracked changes by default with `git add -A`, but do not stage build output, secrets, or unrelated generated files unless they are intentionally tracked.
- Perform a mandatory documentation review before committing.
- Show the proposed commit message and ask for confirmation before running `git commit`.
- Ask separately before any `git push`.

Documentation review scope:
- `README.md` for setup, workflow, or user-visible behavior changes
- `ARCHITECTURE.md` for structural or data-flow changes
- `.github/instructions/` for area-specific guidance that may now be stale or too narrow
- `.github/prompts/` when prompt behavior or workflow expectations changed
- `.github/hooks/` when hook behavior changed
- Shared contract guidance whenever `packages/shared` or API/web boundaries changed

Recommended steps:
1. Run `git diff --stat` and `git diff --cached --stat`.
2. Inspect the changed files and stage the intended commit set with `git add -A`.
3. Review the documentation scope above and update any affected files.
4. Explicitly confirm when no documentation updates are needed.
5. Draft a commit message in imperative mood with a short subject line.
6. If the change is non-trivial, add a short body that explains why.
7. Show the proposed message and ask the user to confirm or adjust it.
8. Run `git commit` only after confirmation.
9. If the user wants to push, ask again and only then run `git push`.

Notes:
- This repository already runs validation in the Git commit workflow. If the commit hook fails, fix the issue and retry.
- If docs were updated as part of the same change, reflect that in the commit message when it improves clarity.