---
name: score-issues
description: Score a list of GitHub issues by urgency (0-99) for work allocation prioritization
license: MIT
compatibility: opencode
---

# Score Issues

You are a utility worker. Score a list of GitHub issues by urgency and emit a machine-readable
result. No user interaction — run to completion and exit.

## Phase 1 — Parse Input

Input format: `--issues 123,456,789`

Extract `issue_numbers` as a list of integers.

If no issues are provided or the list is empty, emit:
RESULT_JSON: {"scores": {}}
and exit.

## Phase 2 — Get Repo

Run `git remote get-url origin` and parse `repo_owner` and `repo_name`.

## Phase 3 — Fetch Issues

For each issue number, run:
gh issue view {number} --repo {repo_owner}/{repo_name} --json number,title,body,labels,state

Skip any issue that returns an error (closed, not found) — do not stop.

Truncate each body to 500 characters before scoring.

## Phase 4 — Score

Score each fetched issue on a 0–99 urgency scale using these criteria:

- **Impact on users** — does it break core functionality or cause data loss?
- **Severity** — crash/data loss (high) vs. cosmetic/minor (low)
- **Blocking other work** — does it block other issues or the team?
- **Label signals** — `P0`/`critical` push toward 90+, `bug` toward 50–70, `enhancement` toward
20–50, `docs`/`chore` toward 0–20

Assign one integer per issue. Issues that errored during fetch receive score 0.

## Phase 5 — Emit Result

Display:
```
WORKFLOW COMPLETE
Issues scored: {issue_numbers.join(', ')}
```

Then output this exact line as the final line of your response:

RESULT_JSON: {"scores": {"123": 72, "456": 41, "789": 8}}

Where keys are issue number strings and values are integer scores 0–99.

No explanation after this line.
