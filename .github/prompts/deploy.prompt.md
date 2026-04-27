---
name: "deploy"
description: "Review, document, commit, push, and deploy the current changes with the production SSH workflow unless the prompt invocation requests a pause."
argument-hint: "Optional change summary or flags such as confirm first, skip cache purge, dry run, or alternate deploy args"
agent: "agent"
model: "GPT-5 (copilot)"
---

Commit, push, and deploy the current changes.

Requirements:
- Review both staged and unstaged changes before deciding on the final commit scope.
- Stage all relevant tracked changes by default with `git add -A`, but do not stage build output, secrets, or unrelated generated files unless they are intentionally tracked.
- Perform a mandatory documentation review before committing.
- Draft the commit message before running `git commit`.
- Do not ask for confirmation before committing unless the prompt invocation explicitly requests a confirmation step, review-only pause, dry run only, or message approval.
- Treat the prompt invocation as approval to run `git push` after a successful commit unless the invocation explicitly says not to push.
- Treat the prompt invocation as approval to deploy after a successful push unless the invocation explicitly says not to deploy.
- Use the production SSH deploy path by default: `npm run deploy:prod:ssh`.
- If the prompt invocation explicitly requests `push`, include the push step even when the deploy command could also push.
- If the prompt invocation explicitly requests deploy args such as `--skip-cache-purge`, `--dry-run`, `--host`, `--repo-path`, or `--branch`, pass them through to the deploy command.

Documentation review scope:
- `README.md` for setup, workflow, deployment, or user-visible behavior changes
- `ARCHITECTURE.md` for structural, runtime, or data-flow changes
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
7. If the prompt invocation explicitly requests a pause or review, show the proposed message and stop before `git commit`.
8. Otherwise, show the message you are using and run `git commit` without waiting.
9. Run `git push` after the commit succeeds unless the invocation explicitly disables pushing.
10. Run the production deploy command after the push succeeds unless the invocation explicitly disables deployment.
11. Summarize the exact push and deploy commands that were used, along with any remote validation signals or errors.

Notes:
- This repository already runs validation in the Git commit workflow. If the commit hook fails, fix the issue and retry.
- If docs were updated as part of the same change, reflect that in the commit message when it improves clarity.
- Prefer pushing with `git push origin HEAD` unless the current branch or remote requirement makes a different push target clearer.
- Prefer deploying after the push rather than relying on the deploy script's `--push` flag, unless the prompt invocation explicitly asks for that mode.
- Treat phrases such as `confirm first`, `ask before committing`, `show me the message first`, `review before commit`, or `dry run only` as explicit requests to pause before the mutating step they reference.