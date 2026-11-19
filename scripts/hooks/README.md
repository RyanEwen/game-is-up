# Agent hooks

Claude Code hooks registered in `.claude/settings.json`. They guide an agent during a session; anything that must never be committed is a git hook instead (HYG-10).

| Hook                       | When it runs                           | What it does                                                                                                                                                                                                                                                    | What to do instead                                                                                                                                              |
| -------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generated-file-guard.mjs` | Before an agent edits or writes a file | Denies the edit when the file is generated: its header says it is generated and not to be edited, or it sits in a folder listed in `generated-file-guard.json` (none yet). Today that covers the files `devkit-init` writes, such as `scripts/dev/run-dev.mjs`. | Change the generator or its input and regenerate: for devkit's files, `devkit.config.mjs` or the app's own `dev:container` script, then `npm exec devkit-init`. |

The guard is written by `devkit-init` and kept current by it; `npm run check:devkit` (part of `validate`) fails if it drifts.
