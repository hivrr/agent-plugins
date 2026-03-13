---
name: wave
description: Execute multiple related issues in order on a single shared branch
license: MIT
compatibility: opencode
---

# Wave Execution

You implement a group of related issues in sequence on one shared branch. The caller (work-issue) handles verification, review, commit, and PR after you finish.

You receive:
- The ordered list of issue numbers to implement
- The fetched data for each issue (title, body, labels)
- `auto_mode` — whether to skip confirmation prompts

---

## Step 1 — Determine the Branch Name

Name the branch using the smallest and largest issue numbers in the group, plus the count:

```
wave/{min_issue}-{max_issue}-{count}
```

Examples:
- Issues 123, 124, 125 → `wave/123-125-3`
- Issues 123, 127, 131 → `wave/123-131-3`
- Issues 123 only → `wave/123-123-1`

---

## Step 2 — Create or Resume the Branch

Check whether this branch already exists:

```
git ls-remote --heads origin wave/{min}-{max}-{count}
```

**If the branch does not exist:** Create and switch to it:
```
git checkout -b wave/{min}-{max}-{count}
```

**If the branch already exists** (resume case): Switch to it:
```
git checkout wave/{min}-{max}-{count}
git pull origin wave/{min}-{max}-{count}
```

Then check which issues were already implemented by scanning the git log:
```
git log origin/main..HEAD --format="%s %b"
```

Look for issue references (`#123`, `Closes #123`, etc.) in the commit messages. Any issue numbers from your group that appear in the log are already done — mark them as complete and skip them in Step 3.

Display: `Branch: {branch_name} | resuming: {skipped_count} issues already done`

---

## Step 3 — Implement Issues in Order

For each issue in the ordered list (skipping any already completed from Step 2):

**Display:** `Implementing #{number}: {title}`

**Read the requirements:** Look at the issue body. Extract:
- What needs to change
- Acceptance criteria (checkbox items if present)
- Any specific files mentioned

**Implement the changes:**
- Follow existing patterns in the codebase — explore before writing
- Make the smallest change that satisfies this issue's requirements
- Handle errors explicitly

**After implementing:** Run `git diff --name-only` and note the files changed for this issue. Store them in your running implementation record.

**On success:** Proceed to the next issue.

**On failure:** If the failure is critical (git errors, missing data, merge conflict you can't resolve) — stop here and report partial results. If the failure is recoverable (a single file edit failed, a nice-to-have enhancement couldn't apply) — note the warning and continue to the next issue.

---

## Step 4 — Return Results to Caller

When all issues are processed, report back:

```
Wave complete: {completed_count}/{total_count} issues implemented
Branch: {branch_name}
Issues done: {list of completed issue numbers}
Files changed: {total count}

Per-issue summary:
  #{number}: {title} — {files_changed_count} files — {complete|partial|skipped}
  ...
```

If any issues failed or were partial, note them clearly so the caller can decide whether to proceed or abort.

---

## What This Skill Does NOT Do

- Does not run tests
- Does not run lint or type checks
- Does not commit
- Does not create a PR

The work-issue skill handles all of that once, for the entire group together.

---

## Error Handling

- **Git branch errors**: report and stop — don't attempt to implement on a broken branch state
- **Issue data missing**: skip that issue, note it as unimplemented, continue with the rest
- **Merge conflict**: if auto-resolvable, resolve it; if not, stop and report which issue caused it
- **Partial group**: if some issues complete before a critical failure, return what completed — the caller decides whether to commit partial work or discard
