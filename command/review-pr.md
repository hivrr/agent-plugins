---
description: Review a pull request — fetches the diff, analyzes it, and posts a structured comment
---

# /review-pr $ARGUMENTS

Load the `review-pr` skill and run a full PR review.

**Arguments:** $ARGUMENTS

Supported formats:
- `99` — PR number (uses current repo)
- `https://github.com/owner/repo/pull/99` — full PR URL
- Either of the above followed by `: some context` for inline hints

Fetches the diff, detects whether this is a first review or follow-up, and posts a structured BLOCKER / REQUIRED / DEFERRED comment directly on the PR. Optionally append `: some context` to focus the review on a specific area.

Examples:
```
/review-pr 99
/review-pr 99 : focus on the auth changes
/review-pr https://github.com/acme/api/pull/99
```

## Output

This command is machine-executed. When the workflow completes, your **entire final response** must be ONLY this JSON — no markdown, no preamble, no trailing text:

```json
{
  "status": "WORKFLOW COMPLETE",
  "pr": {pr_number},
  "review_type": "first|followup",
  "findings": { "blockers": {n}, "required": {n}, "deferred": {n} }
}
```
