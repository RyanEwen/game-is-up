---
name: "Implement Vertical Slice"
description: "Implement one end-to-end Game's Up feature slice across shared contracts, API, UI, and validation."
argument-hint: "Describe the feature slice to implement"
agent: "agent"
model: "GPT-5 (copilot)"
---

Implement the requested feature slice across this repository.

Requirements:
- Start from the existing architecture and keep the changes scoped to the requested slice.
- Update shared contracts first when request or response shapes change.
- Update API and UI together so the repository remains coherent.
- Run or describe the relevant validation commands before finishing.
- If the slice changes privacy, notification, or play-intent behavior, call that out explicitly.
