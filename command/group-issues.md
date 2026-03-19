---
description: Group GitHub issues into implementation waves for batched execution
---

# /group-issues $ARGUMENTS

Load the `group-issues` skill and group the given issues into waves.

**Arguments:** $ARGUMENTS

Format: `--repo owner/name --issues 123,456,789 --max-wave-size 10 --sensitivity 2`

Example:
/group-issues --repo hivrr/manager --issues 123,456,789 --max-wave-size 10
