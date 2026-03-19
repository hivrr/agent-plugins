---
name: work-pr
description: Address PR feedback end-to-end — fetch, implement fixes, test, push
license: MIT
compatibility: opencode
---

# Work PR Workflow

You are a workflow driver. Your job is to take a pull request from open feedback to pushed resolution without stopping unless you genuinely need the user's input. Work with momentum — keep moving through the phases, communicate progress clearly, and only pause at marked checkpoints.

This workflow is GitHub-only. For Linear issues, use the `work-issue` skill instead.

Before starting: read this entire skill, then create a focused todo list, then execute.

---

## Phase 1 — Load Core Philosophy

Load the `core` skill to internalize project values: quality gates, git safety, and task completion standards. These principles govern every decision you make throughout this workflow.

---

## Phase 2 — Parse the Input

The input will be one of these forms:
- A PR number: `456`
- A GitHub PR URL: `https://github.com/owner/repo/pull/456`
- Either of the above followed by `: some context` for inline hints
- An optional `--auto` flag to skip the user approval checkpoint

Extract:
- `pr_number` — the PR number to work on
- `inline_context` — any text after `:` in the input
- `auto_mode` — true if `--auto` is present

Display: `Input: PR #{pr_number} | auto: {auto_mode}`

---

## Phase 3 — Get Repo and PR Context

Do these together:

**Repo info:** Run `git remote get-url origin` and parse the owner and repo name. Store `repo_owner`, `repo_name`.

**PR details:** Fetch the PR using `gh pr view {pr_number} --json title,body,headRefName,state,reviews,comments`. Get the title, body, branch name (`headRefName`), current state, and any reviews or comments. If the PR is already merged or closed, warn the user and stop.

**PR feedback:** Fetch issue-style comments (the main conversation thread) using `gh api repos/{repo_owner}/{repo_name}/issues/{pr_number}/comments`. This is the correct endpoint for comments posted in the PR conversation — not `pulls/{pr_number}/comments`, which only returns inline diff comments and will miss most feedback.

Get the timestamp of the latest commit on the branch: `gh pr view {pr_number} --json commits --jq '.commits[-1].committedDate'`. Only consider comments whose `created_at` is after that timestamp — these are the comments posted since the last push.

Separate the filtered comments into:
- `blocking_feedback` — comments containing "must fix", "please change", "needs to be", "blocking", or any explicit change request
- `recommended_feedback` — suggestions, nits, optional improvements, questions

Also fetch formal review decisions: `gh api repos/{repo_owner}/{repo_name}/pulls/{pr_number}/reviews` to capture any "CHANGES_REQUESTED" reviews.

**CI status:** Check `gh pr checks {pr_number}` for any failing checks. Note them for the implement phase.

Store: `pr_title`, `branch_name` (from headRefName), `blocking_feedback`, `recommended_feedback`, `ci_failures`.

Display: `Fetched: PR #{pr_number} "{pr_title}" | blocking: {count} | recommended: {count} | CI: {pass|fail}`

---

## Phase 4 — Assess Complexity

Look at the volume and nature of feedback and classify the work:

- **Simple**: a few small comments, clear fixes, single-file scope, docs or typo changes
- **Medium**: several pieces of feedback, a few files, clear what to do
- **Complex**: many comments, architectural feedback, unclear how to address, ripple effects across multiple files

If `--auto` is set and you're unsure, default to `medium` and continue.
If `--auto` is not set and you're genuinely unsure, ask the user one focused question.

Display: `Complexity: {simple|medium|complex}`

---

## Phase 5 — Checkout PR Branch

Run:
```bash
if [[ -z "$CLAUDE_SKILL_DIR" ]]; then
  echo "ERROR: CLAUDE_SKILL_DIR is not set — cannot locate hivrr-pr-checkout.sh" >&2
  exit 1
fi
bash "${CLAUDE_SKILL_DIR}/scripts/hivrr-pr-checkout.sh" --branch {branch_name}
```
If the script exits non-zero, surface the error and stop.

Display: `Branch: {branch_name}`

---

## Phase 6 — Plan (medium and complex only)

For **simple** tasks: skip this phase, go straight to implementing.

For **medium and complex** tasks: before touching any code, write out your plan for addressing the feedback. Include:
- Which blocking feedback items you'll address and how
- Which recommended feedback you'll incorporate and why
- How you'll handle any CI failures
- Any risks or tradeoffs

For **complex** tasks: look at the existing code context before committing to an approach. Follow existing patterns.

Display: `Plan: ready`

---

## Phase 7 — Implement

Address the feedback in priority order:

1. **CI failures first** — fix any failing checks before tackling review feedback, since CI failures often reveal the root cause of reviewer concerns
2. **Blocking feedback** — address every change request and required change. Don't skip any.
3. **Recommended feedback** — incorporate where it makes the code better without introducing risk. Skip if it would break tests or add significant complexity.

Implementation principles:
- Follow existing patterns in the codebase
- Make targeted changes — don't refactor beyond the scope of the feedback
- If a reviewer's intent is unclear, implement the most reasonable interpretation and note it in your summary
- Fix tests alongside code, not after

When done, display: `Implement: complete | feedback addressed: {blocking_count} blocking, {recommended_count} recommended`

---

## Phase 8 — Verify

Run:
```bash
if [[ -z "$CLAUDE_PLUGIN_ROOT" ]]; then
  echo "ERROR: CLAUDE_PLUGIN_ROOT is not set — cannot locate hivrr-verify.sh" >&2
  exit 1
fi
bash "${CLAUDE_PLUGIN_ROOT}/scripts/hivrr-verify.sh"
```
Consume the printed summary line for the `Verify:` display. If the script exits non-zero, fix the failures and retry, up to 3 attempts.

**Review your own changes:**
- Does each piece of blocking feedback have a clear resolution?
- Did you introduce any new issues?
- Fix what you find.

Display: `Verify: tests {pass|fail|skipped} | lint {pass|fail|skipped}`

---

## Phase 9 — Review Checkpoint

**Skip this phase if `--auto` is set.**

Show the user a summary:
- Files changed (list them)
- Blocking feedback addressed (list each item)
- Recommended feedback incorporated (list each item)
- Test results
- Lint results

Ask: "Ready to commit and push?" with options:
- Commit and push
- Show full diff (`git diff --stat`)
- Abort (leave changes on branch for manual review)

Wait for their response before continuing.

---

## Phase 10 — Commit

Stage all changes: `git add -A`

Write a conventional commit message:
- Format: `{type}({scope}): {description}`
- Types: `fix`, `refactor`, `test`, `docs`, `chore`
- Body: briefly list what feedback was addressed

Commit with: `git commit -m "{message}"`

Display: `Commit: {message}`

---

## Phase 11 — Post PR Comment

Post a summary comment on the PR using `gh pr comment {pr_number} --body "{message}"`.

The comment should cover:
- What feedback was addressed
- What changes were made
- Test status
- Anything that was intentionally not addressed and why

Display: `Comment: posted`

If posting fails, log a warning and continue — don't let a comment failure block the push.

---

## Phase 12 — Push

Push the branch: `git push origin {branch_name}`

Display: `Push: {branch_name} → origin`

---

## Phase 13 — Done

Display:
```
WORKFLOW COMPLETE
PR: #{pr_number} updated
Branch: {branch_name}
Feedback addressed: {blocking_count} blocking, {recommended_count} recommended
```

Return control to the user.

---

## Error Handling

- If the PR is already merged or closed: warn and stop immediately
- If a feedback item cannot be resolved after 3 attempts: mark it unresolved, note it in the PR comment, and continue
- If tests fail after fixing: revert the last change and note it as unresolved
- Leave the branch intact on any failure so the user can inspect manually
