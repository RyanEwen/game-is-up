---
name: deploy
description: Review, document, commit, push, and deploy this repository when the user asks to deploy changes.
---

# Deploy Game's Up

Invoking this skill is the request for its own commit, push, and production deploy, end to end, with no second confirmation. It authorizes nothing else: work that is not part of this deploy is not committed with it, so if the tree holds unrelated uncommitted changes, stop and ask which are in scope. Stop on any failed validation, commit, push, or deploy step.

## Workflow

1. Review staged and unstaged changes and exclude secrets, build output, and unrelated generated files.
2. Review affected documentation, including `README.md`, `docs/`, `ARCHITECTURE.md`, root and nested `AGENTS.md` files, `.agents/skills/`, `.agents/guides/`, and shared contract guidance.
3. Run validation proportional to the change. Use `npm run validate` for broad or cross-cutting changes. The deploy script also validates unless passed `--skip-validate`.
4. Stage explicit intended paths and create one coherent commit. Use `git add -A` only when every worktree change is in scope. Use an imperative subject.
5. Push with `git push origin HEAD:main`; production deploys only what is on `main`.
6. Deploy with `npm run deploy:prod`. It refuses a dirty tree or a HEAD that is not `origin/main`, so push first.
7. Pass through deploy options the user supplied: `--dry-run`, `--skip-validate`, `--skip-backup` or `--no-prune`. The target comes from `.env` (`DEPLOY_SSH_HOST`, `DEPLOY_REPO_PATH`); if either is missing, ask for it.
8. Report the exact push and deploy commands and any remote validation signal or error.

If the user asks for a review, confirmation, dry run, or pause, stop before the named mutating step. Do not push or deploy when explicitly disabled.
