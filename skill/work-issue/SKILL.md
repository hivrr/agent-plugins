---
name: work-issue
description: Full workflow for implementing a GitHub or Linear issue end-to-end
license: MIT
compatibility: opencode
---

# Work Issue Workflow

You are a workflow driver. Your job is to take an issue from input to merged PR without stopping unless you genuinely need the user's input. Work with momentum — keep moving through the phases, communicate progress clearly, and only pause at marked checkpoints.

Before starting: read this entire skill, then create a focused todo list, then execute.

---

## Phase 1 — Load Core Philosophy

Load the `core` skill to internalize project values: quality gates, git safety, and task completion standards. These principles govern every decision you make throughout this workflow.

---

## Phase 2 — Parse the Input

The input will be one of these forms:
- A single issue number: `123`
- Multiple numbers or a range: `123, 456` or `123-126`
- A GitHub URL
- A Linear identifier: `PROJ-123`
- Any of the above followed by `: some context` for inline hints
- An optional `--auto` flag to skip the user approval checkpoint

Extract:
- `issue_numbers` — the list of issue numbers/identifiers to work on
- `inline_context` — any text after `:` in the input
- `auto_mode` — true if `--auto` is present

Display: `Input: {issue_numbers} | auto: {auto_mode}`

---

## Phase 3 — Route Multiple Issues

**Skip this phase if there is only one issue.**

For multiple issues, decide how to execute them before doing anything else.

**Group by relationship:** Scan each issue's title and body for mentioned file paths and labels. Issues that share mentioned files, share labels, or reference the same origin PR belong in the same group and will share a branch. Issues with no relationship to the others form their own single-issue group.

**Order within each group:** Sort the issues in this sequence:
1. Structural or rename changes first
2. Type definitions
3. New features
4. Bug fixes
5. Documentation last

**Choose a strategy:**
- **Unified** — one shared wave branch per group: use when all issues in a group are simple or medium complexity and the group has 5 or fewer issues. The `wave` skill handles execution.
- **Sequential** — a separate `issue/{N}` branch per issue, processed one at a time: use when any issue is complex, groups are completely unrelated, or the provider is Linear (Linear does not support wave branching).

Store: `wave_strategy` ("unified" or "sequential"), `wave_groups` (the ordered groups of issue numbers).

Display: `Route: {count} issues | strategy: {wave_strategy} | groups: {group_count}`

---

## Phase 4 — Get Repo and Issue Context

Do these together:

**Repo info:** Run `git remote get-url origin` and parse the owner and repo name. Check the current branch with `git branch --show-current`. Store `repo_owner`, `repo_name`, `current_branch`.

**Issue details:** Fetch each issue using the GitHub MCP tool (or Linear MCP if the provider is Linear). Get the title, body, labels, and any linked issues. If fetching fails, continue with whatever you have — don't stop.

Store everything you learn about the issues as `issue_data`.

Display: `Fetched: {count} issue(s) from {repo_owner}/{repo_name}`

---

## Phase 5 — Assess Complexity

Look at what you know about the issue(s) and classify:

- **Simple**: small scope, clear requirements, likely a single file or doc change, labels like `docs`, `chore`, `typo`, body under 500 characters, no linked issues
- **Medium**: clear requirements, a few files, well-understood problem
- **Complex**: unclear requirements, many files, architectural decisions needed, multiple linked issues

For multiple issues, assess each one and use the highest classification to drive planning decisions.

If `--auto` is set and you're unsure, default to `medium` and continue.
If `--auto` is not set and you're genuinely unsure, ask the user one focused question.

Display: `Complexity: {simple|medium|complex}`

---

## Phase 6 — Create a Working Branch

**Unified wave strategy:**
Skip this phase — the `wave` skill creates and manages its own branch in Phase 8.

Display: `Branch: wave skill will create`

**Single issue or sequential strategy:**
Run:
```bash
if [[ -z "$CLAUDE_SKILL_DIR" ]]; then
  echo "ERROR: CLAUDE_SKILL_DIR is not set — cannot locate hivrr-branch-setup.sh" >&2
  exit 1
fi
bash "${CLAUDE_SKILL_DIR}/scripts/hivrr-branch-setup.sh" --issue {number}
```
If the script exits non-zero, surface the error and stop.

Display: `Branch: issue/{number}`

---

## Phase 7 — Plan (medium and complex only)

For **simple** tasks: skip this phase, go straight to implementing.

For **medium and complex** tasks: before touching any code, write out your implementation plan. Include:
- What you're going to change and why
- The approach you'll take
- Any risks or tradeoffs worth noting
- How you'll verify it works

For **complex** tasks: look at the existing architecture before committing to an approach. Follow existing patterns — one consistent pattern well-applied beats a new pattern.

Display: `Plan: ready`

---

## Phase 8 — Implement

**Unified wave strategy (multiple related issues):**
Load the `wave` skill. Pass it the ordered issue list, the fetched issue data, and `auto_mode`. The wave skill creates the shared branch, implements each issue in sequence, handles resume if the branch already exists, and returns a per-issue summary. When it returns, continue to Phase 9 with the combined results.

**Single issue or sequential strategy:**
Write the code directly. Follow these principles:
- **Verify before editing**: See [File Verification in the core skill](../core/SKILL.md#file-verification).
- Follow existing patterns in the codebase — explore before writing
- Make the smallest change that satisfies the requirements
- Handle errors explicitly — don't let things fail silently
- Write or update tests alongside the code, not after

If you hit a blocker that cannot be resolved by reading the codebase:
- Style, naming, missing tests → decide autonomously using existing conventions
- Contradictory acceptance criteria or missing external credentials → surface the blocker clearly and stop; leave the branch intact

For sequential multi-issue, process each issue fully through Phase 12 (Create PR) before starting the next one.

When done, display: `Implement: complete | files changed: {count}`

---

## Phase 9 — Verify

Run:
```bash
if [[ -z "$CLAUDE_PLUGIN_ROOT" ]]; then
  echo "ERROR: CLAUDE_PLUGIN_ROOT is not set — cannot locate hivrr-verify.sh" >&2
  exit 1
fi
bash "${CLAUDE_PLUGIN_ROOT}/scripts/hivrr-verify.sh"
```
Consume the printed summary line for the `Verify:` display. If the script exits non-zero, the verify step failed — fix the failures and retry, up to 3 attempts.

**Review your own changes:**
- Do the changes actually satisfy the acceptance criteria from the issue(s)?
- Is there anything obviously wrong, missing, or broken?
- Fix what you find.

Display: `Verify: tests {pass|fail|skipped} | lint {pass|fail|skipped}`

---

## Phase 10 — Review Checkpoint

**Skip this phase if `--auto` is set.**

Show the user a summary:
- Files changed (list them)
- Test results
- Lint results
- Any unresolved issues

Ask: "Ready to commit and create a PR?" with options:
- Commit and create PR
- Show full diff (`git diff --stat`)
- Abort (leave changes on branch for manual review)

Wait for their response before continuing.

---

## Phase 11 — Commit

Stage all changes: `git add -A`

Write a conventional commit message:
- Format: `{type}({scope}): {description}`
- Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
- Include issue references in the body: `Closes #{number}` for each issue (GitHub) or the Linear identifier

Commit with: `git commit -m "{message}"`

Display: `Commit: {message}`

---

## Phase 12 — Create PR

Push the branch: `git push -u origin {branch_name}`

Create the PR using `gh pr create` with:
- Title: the issue title for a single issue, or a clear group summary for wave
- Body: what was done, why, how to test it, and a `Closes #N` line for every issue in the group
- Link it to all relevant issues

Display: `PR: {url}`

---

## Phase 13 — Done

Your **final response must end with exactly this block** — do not append any text after it:

```
WORKFLOW COMPLETE
PR: {url}
Branch: {branch_name}
Issues: {issue_numbers}
```

---

## Error Handling

If any phase fails:
- Leave the branch intact so the user can inspect it manually
- Display what went wrong clearly
- Don't silently swallow errors
- Don't retry indefinitely — 3 attempts max on any single fix
