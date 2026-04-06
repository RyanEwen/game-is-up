---
name: "Add Provider Adapter"
description: "Add or update an external game-catalog provider adapter such as Steam or Xbox."
argument-hint: "Describe the provider or adapter change"
agent: "agent"
model: "GPT-5 (copilot)"
---

Implement the requested provider-adapter change.

Requirements:
- Keep provider-specific logic isolated from the product-facing game model.
- Preserve manual-entry fallback behavior.
- Document configuration needs and validation gaps if live credentials are not available.
