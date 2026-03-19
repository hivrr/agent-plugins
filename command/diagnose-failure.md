---
description: Diagnose a failed worker job and recommend RETRY, SKIP, or HUMAN_REVIEW
---

# /diagnose-failure $ARGUMENTS

Load the `diagnose-failure` skill and diagnose the given failed job.

**Arguments:** $ARGUMENTS

Format: `--job-id abc123 --task-type work-issue`

Example:
/diagnose-failure --job-id abc123 --task-type work-issue
