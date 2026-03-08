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

## Phase 1 — Load Core Philosophy and Memory

Load the `core` skill to internalize project values: quality gates, git safety, and task completion standards. These principles govern every decision you make throughout this workflow.

Load memory: if `.ai/memory/MANIFEST.md` exists, read it. Pick any entries relevant to this PR's domain and read those files. Hold this as `loaded_memory`. If no MANIFEST exists, skip silently.

---

## Phase 2 — Parse the Input

The input will be one of these forms:
- A PR number: `99`
- A GitHub PR URL: `https://github.com/owner/repo/pull/99`
- Either of the above with an optional `--auto` flag

Extract:
- `pr_number` — the PR number to merge
- `auto_mode` — true if `--auto` is present

Display: `Input: PR #{pr_number} | auto: {auto_mode}`

---

## Phase 3 — Get Repo and PR Details

**Repo info:** Run `git remote get-url origin` and parse the owner and repo name. Store `repo_owner`, `repo_name`.

**PR details:** Run `gh pr view {pr_number} --json title,body,headRefName,state,reviews`. Get the title, body, branch name, current state, and review status.

- If the PR is already merged: display "PR #{pr_number} is already merged" and jump to Phase 7 (cleanup).
- If the PR is closed but not merged: warn and stop.
- If the PR is still open with changes requested: warn the user that feedback is unaddressed, but let them decide whether to continue.

Store: `pr_title`, `branch_name` (from headRefName), `pr_body`.

Display: `PR #{pr_number}: "{pr_title}" | state: {state}`

---

## Phase 4 — Extract Linked Issues

Parse the PR body to find issues that will be closed by this merge. Look for these patterns (case-insensitive):
- `Closes #123`, `Fixes #123`, `Resolves #123`
- `Close #123`, `Fix #123`, `Resolve #123`

Deduplicate any repeated issue numbers. Skip malformed references (e.g. `#` not followed by digits).

Store: `linked_issues` — an array of issue numbers (may be empty).

Display: `Linked issues: {linked_issues.join(', ') || 'none'}`

---

## Phase 5 — Verify CI

Run `gh pr checks {pr_number}` to get the CI status.

- If all checks pass: continue.
- If any checks are failing: display which checks failed and stop. Don't merge a PR with failing CI. The user needs to fix the failures first (use `/work-pr` to address them).
- If there are no checks: note it but continue — not all repos have CI.

Display: `CI: {all passed | {N} failing — cannot merge}`

---

## Phase 6 — Confirm (unless --auto)

**Skip this phase if `--auto` is set.**

Display a merge summary:
- PR title and number
- CI status
- Merge method: squash
- Linked issues that will be closed: `{linked_issues.join(', ') || 'none'}`
- Branch that will be deleted: `{branch_name}` (local and remote)

Ask: "Ready to merge?" with options:
- Merge and clean up
- View PR diff (`gh pr diff {pr_number}`)
- Abort (leave PR open)

Wait for their response before continuing.

---

## Phase 7 — Merge

Merge the PR with squash: `gh pr merge {pr_number} --squash --delete-branch`

The `--delete-branch` flag handles the remote branch deletion. If it fails, note it and handle it manually in Phase 9.

Display: `Merged: PR #{pr_number} → main (squash)`

---

## Phase 8 — Close Linked Issues

If `linked_issues` is empty, display "Linked issues: none" and skip to Phase 9.

GitHub's auto-close (triggered by "Closes #N" in the PR body) usually fires on merge, but it's eventually consistent. Wait a few seconds, then check each linked issue:

For each issue in `linked_issues`:
1. Run `gh issue view {number} --repo {repo_owner}/{repo_name} --json state`
2. If it's already closed: display `Issue #{number}: already closed`
3. If it's still open: close it manually with `gh issue close {number} --repo {repo_owner}/{repo_name}` and display `Issue #{number}: closed`
4. If the command fails: warn and continue — don't let one failure block the others

Display: `Linked issues: {count} verified, {closed_count} manually closed`

---

## Phase 9 — Switch to Main and Pull

Checkout main: `git checkout main` (or `master` if that's the default branch).

Pull the latest: `git pull origin main`

Display: `Main: updated`

---

## Phase 10 — Clean Up Branches

**Delete local branch:** `git branch -d {branch_name}`

If it fails with "not fully merged", use `git branch -D {branch_name}` — the branch was already merged into main via the PR, so this is safe.

**Delete remote branch** (if `--delete-branch` in Phase 7 didn't handle it):
Check if remote branch still exists: `git ls-remote --heads origin {branch_name}`
If it exists: `git push origin --delete {branch_name}`

**Prune stale remote-tracking refs:** `git remote prune origin`

Display: `Cleanup: local branch deleted | remote branch deleted | refs pruned`

---

## Phase 11 — Capture Follow-up Work

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

## Phase 12 — Done

Display:
```
WORKFLOW COMPLETE
Merged: PR #{pr_number}
Issues closed: {linked_issues.join(', ') || 'none'}
Branch deleted: {branch_name}
Follow-up issues: {created_numbers.join(', ') || 'none'}
```

Return control to the user.

---

## Error Handling

- If CI is failing: stop at Phase 5, do not merge
- If the PR is already merged: skip to Phase 9 (cleanup still needed)
- If a linked issue close fails: warn and continue — don't block the workflow
- If branch deletion fails: warn and continue — stale branches are a minor annoyance, not a blocker
- If follow-up issue creation fails: warn and list the suggestions so the user can create them manually
