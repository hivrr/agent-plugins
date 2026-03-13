---
description: Address PR feedback end-to-end — fetch, implement, test, push
---

# /work-pr $ARGUMENTS

Load the `work-pr` skill and drive the full PR feedback resolution workflow.

**Arguments:** $ARGUMENTS

Supported formats:
- `456` — PR number
- `https://github.com/owner/repo/pull/456` — GitHub PR URL
- Either of the above followed by `: some context` for inline hints
- Append `--auto` to skip the user approval checkpoint before committing

Examples:
```
/work-pr 456
/work-pr 456 --auto
/work-pr 456 : focus on the test coverage comments
/work-pr https://github.com/owner/repo/pull/456
```
