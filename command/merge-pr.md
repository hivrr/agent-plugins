---
description: Merge a GitHub PR, close linked issues, clean up branches
---

# /merge-pr $ARGUMENTS

Load the `merge-pr` skill and drive the full merge, cleanup, and follow-up capture workflow.

**Arguments:** $ARGUMENTS

Supported formats:
- `99` — PR number
- `https://github.com/owner/repo/pull/99` — GitHub PR URL
- Append `--auto` to skip the confirmation checkpoint and auto-create follow-up issues

Examples:
```
/merge-pr 99
/merge-pr 99 --auto
/merge-pr https://github.com/owner/repo/pull/99
```
