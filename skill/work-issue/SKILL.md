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

## Phase 0 — Check for Pending Resume

Before doing anything else, check if this is a resume from a previously blocked question:

1. Scan for `.ai/session/work-issue-*-answer.json`
2. If an answer file exists, jump directly to the **Resume Protocol** section below
3. If no answer file exists, check for `.ai/session/work-issue-*-question.json`
   - If a question file exists and is **stale** (posted_at > 24 hours ago), apply the **Stale Question Recovery** protocol
   - If a question file exists but is **not stale**, log `Question for issue #{N} is still pending ({age} old). Exiting to wait for answer.` and exit cleanly
4. If no question or answer file exists, continue to Phase 1

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

Check if the working tree is clean with `git status --porcelain`. If there are uncommitted changes, warn the user but continue.

**Single issue or sequential strategy:**
Create and switch to `issue/{number}`. If the branch already exists, switch to it instead.

**Unified wave strategy:**
Skip this phase — the `wave` skill creates and manages its own branch in Phase 8.

Display: `Branch: {branch_name}` (or `Branch: wave skill will create` for unified)

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
- **Verify before editing**: Never assume a file path. Use Glob or Grep to locate the actual file first. If you're unsure which file owns a behavior, search by function name or symbol. Confirm the file exists and contains what you expect before writing any edit.
- Follow existing patterns in the codebase — explore before writing
- Make the smallest change that satisfies the requirements
- Handle errors explicitly — don't let things fail silently
- If you're unsure about an architectural decision, follow the **When to Ask a Human** criteria below to decide whether to ask or resolve it autonomously
- Write or update tests alongside the code, not after

For sequential multi-issue, process each issue fully through Phase 12 (Create PR) before starting the next one.

When done, display: `Implement: complete | files changed: {count}`

---

## Phase 9 — Verify

**Run tests** (skip if only docs/config changed):
- Look for test runners: check `package.json` scripts, `Makefile`, `pyproject.toml`, `pytest.ini`, `jest.config.*`
- Run whatever you find. If nothing is found, say so and move on.
- If tests fail, fix the failures now. You get 3 attempts per failure before marking it unresolved.

**Run lint and type checks** (skip if only docs changed):
- Look for linting config: `eslint`, `ruff`, `flake8`, `.eslintrc.*`, `pyproject.toml [tool.ruff]`
- Run whatever you find. Fix any errors.

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

Display:
```
WORKFLOW COMPLETE
PR: {url}
Branch: {branch_name}
Issues: {issue_numbers}
```

Return control to the user.

---

## Error Handling

If any phase fails:
- Leave the branch intact so the user can inspect it manually
- Display what went wrong clearly
- Don't silently swallow errors
- Don't retry indefinitely — 3 attempts max on any single fix

---

## When to Ask a Human

The bar for posting a question is high. Most ambiguity should be resolved by reading more code or following existing patterns. Only post a question when you hit a genuine blocker that cannot be resolved autonomously.

### When to Ask

Post a question **only** when:
- Acceptance criteria directly contradict each other
- A required credential or external resource is missing and cannot be inferred
- A security-sensitive architectural decision has significant tradeoffs where neither option is clearly better
- The spec explicitly says "confirm with team before proceeding"

### When to Decide Autonomously

**Never ask** for:
- Code style choices — follow existing conventions
- Missing tests — write them
- Ambiguous variable names — pick the clearest option
- Whether to add a comment — use judgment
- Anything resolvable by reading more code or exploring the codebase

### Question Protocol

When a genuine blocker is reached during any phase:

1. **Write the question file** to `.ai/session/work-issue-{N}-question.json` (where `N` is the issue number being worked on; for a unified wave covering multiple issues, use the first issue number in the group):

```json
{
  "issue_number": 123,
  "question": "concise question text",
  "context": "relevant code snippet or spec excerpt",
  "options": ["A: description", "B: description"],
  "posted_at": "2026-03-14T10:30:00Z"
}
```

Fields:
- `issue_number` (required) — the issue being worked on
- `question` (required) — a concise, specific question
- `context` (required) — the relevant code snippet or spec excerpt that created the ambiguity
- `options` (optional) — concrete choices when the blocker has identifiable alternatives
- `posted_at` (required) — ISO 8601 timestamp; generate with `date -u +%Y-%m-%dT%H:%M:%SZ`

2. **Log the blocker:**

```
BLOCKED: [question text]. Posted question, waiting for human answer.
```

3. **Exit the current phase cleanly:**
   - Leave the branch intact
   - Do not commit partial work
   - Do not clean up the working directory
   - Return control to the caller

The worker process detects the question file and transitions the job to `paused_waiting_for_input`.

### Stale Question Recovery

A question is considered **stale** if no answer file has appeared after 24 hours (compare `posted_at` in the question file against the current time).

**Detection:** Phase 0 checks `posted_at` in the question file and routes here when the question is stale. On entry, log:

```
WARNING: Stale question for issue #{N} — posted {age} ago with no answer.
```

**Recovery options:**

1. **Abort** — Clean up and return the branch to a workable state:
   - Delete the question file: `.ai/session/work-issue-{N}-question.json`
   - Log: `Aborted stale question for issue #{N}. Branch {branch_name} left intact for manual review.`
   - Leave the branch and any uncommitted changes intact so the user can inspect them
   - Return control to the caller

2. **Resolve autonomously** — If the question can now be answered by re-reading the codebase or if the issue has been updated with clarifying information:
   - Log: `Resolving stale question autonomously: [resolution rationale]`
   - **Persist before cleanup:** Append the original question and the autonomous resolution to `.ai/session/work-issue-log.md` with a timestamp.
   - Delete the question file
   - Continue from the blocked phase with the resolution as context

3. **Re-post** — If the question is still valid and unanswerable:
   - Update `posted_at` to the current timestamp
   - Log: `Re-posted stale question for issue #{N}.`
   - Exit cleanly as in the original Question Protocol

When `--auto` is set, prefer option 2 (resolve autonomously) if possible, otherwise use option 1 (abort). Option 3 (re-post) is not available in `--auto` mode. When `--auto` is not set, present all three options to the user and let them choose.

#### Autonomous Resolution Examples

Use these examples to calibrate whether Option 2 (resolve autonomously) is appropriate:

**✅ Qualifies for Option 2 — answerable from the codebase:**
The question asked which file to put the new validation logic in; re-reading the codebase reveals only one candidate (`src/validators/input.ts`) — autonomous resolution is safe.

**✅ Qualifies for Option 2 — issue updated with missing info:**
The question asked for the API key format to validate against; the issue body was updated after the question was posted to include the format spec — the blocker no longer exists.

**❌ Does not qualify for Option 2 — product decision required:**
The question asked whether a setting should be a user-facing config flag or a hardcoded value — this is a product decision that cannot be answered from code alone. Use Option 3 (re-post) to keep the question visible, or Option 1 (abort) in `--auto` mode.

**❌ Does not qualify for Option 2 — external resource needed:**
The question asked for credentials or access to an external service (e.g., a third-party API key, a deploy role ARN) that the agent cannot obtain by reading the codebase. Use Option 3 (re-post) to keep the question visible, or Option 1 (abort) in `--auto` mode.

### Resume Protocol

When execution resumes after a human provides an answer (injected via `answer.json` alongside the question file):

1. Read `.ai/session/work-issue-{N}-question.json` and `.ai/session/work-issue-{N}-answer.json`
2. Log: `Resuming with answer: [answer text]`
3. **Persist the answer before cleanup:** Append the question and answer content to `.ai/session/work-issue-log.md` with a timestamp. This ensures the context survives if the skill crashes after file deletion but before completing the blocked phase.
4. Delete both the question and answer files
5. Continue from the blocked phase with the answer as context

### Examples

**Good question — contradictory acceptance criteria:**
```json
{
  "issue_number": 42,
  "question": "AC #2 says 'return 404 for missing users' but AC #5 says 'always return 200 with an empty body'. Which behavior is correct?",
  "context": "AC #2: Return 404 when user not found\nAC #5: All endpoints return 200 with empty body on no results",
  "options": ["A: 404 for missing users (REST convention)", "B: 200 with empty body (matches existing search endpoints)"],
  "posted_at": "2026-03-14T10:30:00Z"
}
```

**Good question — missing credential:**
```json
{
  "issue_number": 87,
  "question": "The deploy step requires an AWS_ROLE_ARN for cross-account access. No value is configured in .env.example or CI secrets. What ARN should be used?",
  "context": "deploy.sh line 14: aws sts assume-role --role-arn $AWS_ROLE_ARN",
  "posted_at": "2026-03-14T11:00:00Z"
}
```

**Not a question — decide autonomously:**
- "Should I use camelCase or snake_case?" → Follow existing convention.
- "Should I add unit tests for this helper?" → Yes, write them.
- "The issue doesn't mention error handling — should I add it?" → Yes, handle errors explicitly.
