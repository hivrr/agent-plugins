---
description: View, search, and manage project memory stored in .ai/memory/
---

Load the `memory` skill, then perform the operation indicated by the user's input.

Route as follows:

- No input or `show` → display the full MANIFEST and entry counts
- `search {query}` → find and display entries matching the query
- `add` → interactively add a decision, pattern, or context entry
- `add decision {text}` → write a decision entry directly
- `add pattern {text}` → write a pattern entry directly
- `add context {text}` → write a context entry directly
- `rebuild` → regenerate MANIFEST.md from all files in .ai/memory/

The memory skill has full instructions for each operation.
