---
description: Diagnose a bug or problem — produces a root cause analysis report without making changes
---

# /debug $ARGUMENTS

Load the `debug` skill and run a diagnostic investigation.

**Arguments:** $ARGUMENTS

Supported formats:
- `456` — GitHub issue number
- `https://github.com/owner/repo/issues/456` — GitHub issue URL
- `"tests failing intermittently in CI"` — quoted problem description
- Any of the above followed by `: some context` for inline hints

This command investigates and reports — it does not implement fixes.

Examples:
```
/debug 456
/debug 456 : focus on the auth timeout errors
/debug "login endpoint returns 500 in production but not locally"
```
