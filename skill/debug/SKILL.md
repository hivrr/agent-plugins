---
name: debug
description: Diagnose a bug, failure, or problem — produces a diagnostic report with root cause analysis and recommendations
license: MIT
compatibility: opencode
---

# Debug Workflow

You are a diagnostic investigator. Your job is to analyze a problem, understand what's actually going wrong at the code level, and produce a clear report with root cause analysis and actionable recommendations. This workflow is diagnosis only — you do not implement fixes.

Before starting: read this entire skill, then create a focused todo list, then execute.

---

## Phase 1 — Load Core Philosophy

Load the `core` skill to internalize project values. These principles guide how you investigate and what you consider worth flagging.

---

## Phase 2 — Parse the Input

The input will be one of these forms:
- A GitHub issue number: `456`
- A GitHub issue URL: `https://github.com/owner/repo/issues/456`
- A quoted problem description: `"tests failing intermittently in CI"`
- Any of the above followed by `: some context` for inline hints

Extract:
- `issue_ref` — issue number or URL if provided
- `problem_description` — the text description if provided, or the issue title once fetched
- `inline_context` — any text after `:` in the input

Display: `Debug: {problem_description || 'fetching issue...'}`

---

## Phase 3 — Fetch Issue Details (if applicable)

If the input was an issue number or URL:
- Get the repo from `git remote get-url origin`
- Fetch issue details: `gh issue view {number} --json title,body,labels,comments`
- Extract the full problem description, any error messages quoted in the issue body, and any relevant comments
- Note any labels (they often classify the problem type — `bug`, `flaky-test`, `performance`, etc.)

If the input was a quoted description, skip this phase and use the description directly.

Store: `problem_description`, `error_messages` (any stack traces or error text found), `issue_context`.

---

## Phase 4 — Classify the Problem

Look at the problem description and any error messages and classify what type of problem this is:

- **test** — failing or flaky tests, assertion errors, test setup issues
- **ci-cd** — CI pipeline failures, build errors, deployment issues, environment differences
- **performance** — slowness, timeouts, high memory/CPU, N+1 queries
- **security** — vulnerabilities, auth failures, unexpected access issues
- **database** — query errors, migration failures, data integrity issues, ORM issues
- **general** — runtime errors, unexpected behavior, logic bugs, crashes

Store: `classification`

Display: `Classification: {classification}`

---

## Phase 5 — Explore the Codebase

Before investigating, get oriented:
- Look at the directory structure to understand the project layout
- Identify the primary language, framework, and test setup
- Find files most likely related to the problem based on the description

Then dig in:
- Read the files most likely involved
- Follow the call chain from the failing point
- Find where the reported behavior originates

Use the classification to guide where you look:
- **test/ci-cd** → test files, CI config, test setup/fixtures, environment config
- **performance** → data access layer, loops, API handlers, database queries
- **security** → auth middleware, input handling, session management, config files
- **database** → ORM models, migration files, repository layer, query files
- **general** → the specific file/function mentioned in the error, then its callers

Collect: `relevant_files`, `code_paths`, `observations` as you go.

---

## Phase 6 — Form Hypotheses

Based on what you found in the codebase, form hypotheses about the root cause. For each hypothesis:

- State what you think is happening
- Point to the specific code location (`file:line`)
- Rate your confidence: high / medium / low
- Explain what evidence supports it
- Explain what would need to be true for it to be wrong

Order hypotheses by confidence (most confident first).

For **test/flaky test** problems specifically, also consider:
- Race conditions or timing dependencies
- Shared mutable state between tests
- External service dependencies (network, filesystem, time)
- Test isolation failures (one test affecting another)

For **ci-cd** problems, also consider:
- Environment differences (local vs CI — env vars, installed tools, file permissions)
- Caching issues (stale build artifacts)
- Dependency version mismatches

---

## Phase 7 — Generate Diagnostic Report

Produce a structured diagnostic report:

```
## Problem
{problem_description}

## Classification
{classification}

## Files Investigated
{list of relevant files with brief note on what each does}

## Root Cause Analysis

### Most Likely: {hypothesis title} (confidence: high)
{explanation}
**Location:** {file:line}
**Evidence:** {what supports this}

### Also Possible: {hypothesis title} (confidence: medium)
{explanation}
**Location:** {file:line}
**Evidence:** {what supports this}

## Recommendations

### To confirm the root cause
{specific steps to reproduce or verify the diagnosis — what to run, what to look for}

### To fix it
{concrete, specific recommendations — not vague, not "refactor this" — actual changes to make}

### To prevent recurrence
{any broader improvements that would prevent this class of problem}

## What This Is Not
{briefly note hypotheses you investigated and ruled out, so the next person doesn't re-investigate them}
```

---

## Phase 8 — Done

Display the report. Then offer:
- "Create a GitHub issue from this diagnosis" — runs `gh issue create` with the report as the body
- "Done" — stop here

If they choose to create an issue: use the problem description as the title, the full report as the body, label it with `bug` and the classification.

Display:
```
WORKFLOW COMPLETE
Problem: {problem_description}
Classification: {classification}
Issue created: {issue_number || 'none'}
```

Return control to the user.

---

## Constraints

- This is diagnosis only. Do not modify files, write code, or implement fixes.
- If you can't determine the root cause with reasonable confidence, say so clearly. A honest "I don't know, but here are the most likely candidates and how to narrow it down" is more useful than a confident wrong answer.
- If the problem requires runtime data (profiling output, logs, query execution plans) that you don't have access to, say what data would help and how to collect it.
