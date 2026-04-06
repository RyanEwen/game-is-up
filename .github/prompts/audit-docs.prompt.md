---
name: "Audit Docs"
description: "Audit repository documentation and Copilot customization files so they match the current codebase and workflow."
argument-hint: "Optional scope or recent change summary"
agent: "agent"
model: "GPT-5 (copilot)"
---

Audit the repository documentation and bring it back in sync with the current codebase.

Requirements:
- Focus on accuracy, not churn.
- Update only the docs and customization files that are stale, incomplete, or misleading.
- Prefer verifying behavior from source files before editing documentation.
- Keep `.github/instructions/`, `.github/prompts/`, and `.github/hooks/` coherent with the actual repository workflow.

Audit scope:
- `README.md`
- `ARCHITECTURE.md`
- `.github/instructions/`
- `.github/prompts/`
- `.github/hooks/`
- Shared contract guidance implied by `packages/shared`, `apps/api`, and `apps/web`

Recommended steps:
1. Review the active change scope with `git status --short`, `git diff --stat`, and `git diff --cached --stat`.
2. Read the affected source files before editing docs.
3. Update high-level docs when setup, architecture, contracts, or workflow changed.
4. Update instruction files when file coverage, conventions, or maintenance guidance drifted.
5. Update prompt files when the expected workflow or repository commands changed.
6. Update hook files when the automation behavior, command routing, or reminder logic changed.
7. If new files fall outside an instruction file's `applyTo` coverage, widen the glob.
8. Summarize what changed, what stayed correct, and any remaining documentation gaps.

Notes:
- Do not rewrite accurate sections just for style consistency.
- When the code and docs disagree, verify the code before choosing the final wording.