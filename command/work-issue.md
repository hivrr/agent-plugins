---
description: Work an issue end-to-end — fetch, implement, test, commit, PR
---

# /work-issue $ARGUMENTS

Load the `work-issue` skill and drive the full issue implementation workflow.

**Arguments:** $ARGUMENTS

Supported formats:
- `123` — single GitHub issue
- `123, 456` — multiple issues
- `123-126` — range of issues
- `https://github.com/owner/repo/issues/123` — GitHub URL
- `PROJ-123` — Linear identifier
- Any of the above followed by `: some context` for inline hints
- Append `--auto` to skip the user approval checkpoint before committing

Examples:
```
/work-issue 123
/work-issue 123 --auto
/work-issue 123, 456 : fix the login flow
/work-issue PROJ-123
```
