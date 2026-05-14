---
name: "commit"
description: "Stage, review, and commit the current changes with mandatory documentation review, a proposed message, and push behavior that follows the prompt invocation."
argument-hint: "Optional message hint or summary of the change"
agent: "agent"
model: "GPT-5 (copilot)"
---

Commit the current changes to git.

Requirements:
- Review both staged and unstaged changes before deciding on the final commit scope.
- Stage all relevant tracked changes by default with `git add -A`, but do not stage build output, secrets, or unrelated generated files unless they are intentionally tracked.
- Perform a mandatory documentation review before committing.
- Draft the commit message before running `git commit`.
- Do not ask for confirmation before committing unless the user explicitly requested a confirmation step, a review-only pause, or message approval in the prompt invocation.
- If the prompt invocation explicitly requests `push`, treat that as approval to run `git push` after a successful commit.
- Otherwise, ask separately before any `git push`.

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
4. Run the relevant validation for the staged change set before `git commit`; prefer targeted checks first and use `npm run validate` when the scope is broad or cross-cutting.
5. Explicitly confirm when no documentation updates are needed.
6. Draft a commit message in imperative mood with a short subject line.
7. If the change is non-trivial, add a short body that explains why.
8. If the user explicitly asked to confirm or review before committing, show the proposed message and pause for confirmation or adjustment.
9. Otherwise, show the message you are using and run `git commit` without waiting for confirmation.
10. If the prompt invocation explicitly includes `push`, run `git push` after the commit succeeds.
11. Otherwise, if the user wants to push, ask again and only then run `git push`.

Notes:
- Validation is not enforced by a Git commit hook. Run the appropriate checks before committing and fix any failures first.
- If docs were updated as part of the same change, reflect that in the commit message when it improves clarity.
- Treat phrases such as `confirm first`, `ask before committing`, `show me the message first`, or `review before commit` in the invocation as explicit requests to pause before `git commit`.
- Treat an explicit `push` request in the prompt invocation as approval to push without a second confirmation step.