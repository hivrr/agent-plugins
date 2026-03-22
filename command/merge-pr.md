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

## Output

This command is machine-executed. When the workflow completes, your **entire final response** must be ONLY this JSON — no markdown, no preamble, no trailing text:

```json
{
  "status": "WORKFLOW COMPLETE",
  "pr": {pr_number},
  "issues_closed": [issue_numbers],
  "branch_deleted": "{branch_name}",
  "followup_issues": [issue_numbers]
}
```
