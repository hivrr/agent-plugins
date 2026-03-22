---
name: merge-pr
description: Merge a GitHub PR, close linked issues, clean up branches, capture follow-up work
license: MIT
compatibility: opencode
---

# Merge PR Workflow

You are a workflow driver. Your job is to take an approved PR through merge, cleanup, and follow-up capture cleanly and completely. Work with momentum — keep moving through the phases and only pause at the marked confirmation checkpoint.

Before starting: read this entire skill, then create a focused todo list, then execute.

---

## Phase 1 — Load Core Philosophy

Load the `core` skill to internalize project values: quality gates, git safety, and task completion standards. These principles govern every decision you make throughout this workflow.

---

## Phase 2 — Parse the Input

The input will be one of these forms:
- A PR number: `99`
- A GitHub PR URL: `https://github.com/owner/repo/pull/99`
- Either of the above with an optional `--auto` flag

Extract:
- `pr_number` — the PR number to merge
- `auto_mode` — true if `--auto` is present

Get the repo: run `git remote get-url origin` and parse the owner and repo name into `repo_slug` (format: `owner/repo`).

Display: `Input: PR #{pr_number} | auto: {auto_mode}`

---

## Phase 3 — Run hivrr-merge.sh

Invoke the merge script, passing the values extracted in Phase 2:

```
if [[ -z "$CLAUDE_SKILL_DIR" ]]; then
  echo "ERROR: CLAUDE_SKILL_DIR is not set — cannot locate hivrr-merge.sh" >&2
  exit 1
fi
bash "${CLAUDE_SKILL_DIR}/scripts/hivrr-merge.sh" \
  --pr {pr_number} \
  --repo {repo_slug} \
  [--auto]
```

Include `--auto` only when `auto_mode` is true.

**If the script exits non-zero:** surface the error output and stop. Do not proceed to Phase 4.

**On success:** the script prints a structured summary line before exiting:

```
HIVRR_MERGE_SUMMARY pr={pr_number} issues_closed={comma_list|none} branch_deleted={branch_name}
```

Parse this line to extract `merged_pr`, `issues_closed` (list of numbers, may be empty), and `branch_deleted`. These values are used in the Phase 5 WORKFLOW COMPLETE display.

---

## Phase 4 — Capture Follow-up Work

After merge, collect any unaddressed PR feedback that should become future issues. This prevents good suggestions from being lost.

Fetch issue-style comments (the main conversation thread) using `gh api repos/{repo_owner}/{repo_name}/issues/{pr_number}/comments`. This is the correct endpoint — `pulls/{pr_number}/comments` only returns inline diff comments and will miss most feedback.

Get the timestamp of the latest commit on the branch before merge: `gh pr view {pr_number} --json commits --jq '.commits[-1].committedDate'`. Only consider comments whose `created_at` is after that timestamp — these are the most recent round of feedback posted since the last push.

Look for:
- Suggestions that were acknowledged but deferred ("will do in a follow-up")
- Ideas that weren't addressed in the PR
- TODO or FIXME comments added during the review
- Any feedback that doesn't have a clear resolution in the thread

**If `--auto` is set:** Create a GitHub issue for every unaddressed suggestion automatically. Label critical ones `priority:high` and optional ones `priority:medium`. The philosophy: capture everything now, triage during implementation.

**If `--auto` is not set:** List the unaddressed suggestions and ask which ones to create issues for.

**If there is no unaddressed feedback:** display "Follow-up: nothing to capture" and skip issue creation.

For each issue created:
- Title: a clear, actionable summary of the suggestion
- Body: context from the PR comment, link back to the PR
- Run `gh issue create --repo {repo_owner}/{repo_name} --title "..." --body "..."` to create it

Display: `Follow-up: {count} issues created {issue_numbers.join(', ') || ''}`

---

## Phase 5 — Done

Your **final response must end with exactly this block** — do not append any text after it:

```
WORKFLOW COMPLETE
Merged: PR #{merged_pr}
Issues closed: {issues_closed.join(', ') || 'none'}
Branch deleted: {branch_deleted}
Follow-up issues: {created_numbers.join(', ') || 'none'}
```

---

## Error Handling

- If the script exits non-zero: surface the error and stop — do not proceed to Phase 4
- If follow-up issue creation fails: warn and list the suggestions so the user can create them manually
