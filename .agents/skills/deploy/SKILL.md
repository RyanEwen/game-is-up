---
name: deploy
description: Review, document, commit, push, and deploy this repository when the user explicitly asks Codex to deploy changes.
---

# Deploy Game's Up

The deploy request authorizes the commit, push, and production deployment unless the user explicitly excludes or pauses one of those steps. Stop on any failed validation, commit, push, or deploy step.

## Workflow

1. Review staged and unstaged changes and exclude secrets, build output, and unrelated generated files.
2. Review affected documentation, including `README.md`, `ARCHITECTURE.md`, root and nested `AGENTS.md` files, `.agents/skills/`, `.codex/`, and shared contract guidance.
3. Run validation proportional to the change. Use `npm run validate` for broad or cross-cutting changes. The deploy script also validates unless passed `--skip-validate`.
4. Stage explicit intended paths and create one coherent commit. Use `git add -A` only when every worktree change is in scope. Use an imperative subject. Do not add AI attribution or co-author trailers.
5. Push with `git push origin HEAD` unless the branch or remote requires a different explicit target.
6. Deploy with `npm run deploy:prod:ssh`.
7. Pass through deploy arguments the user supplied, including `--dry-run`, `--host`, `--repo-path`, or `--branch`.
8. Report the exact push and deploy commands and any remote validation signal or error.

If the user asks for a review, confirmation, dry run, or pause, stop before the named mutating step. Do not push or deploy when explicitly disabled.
