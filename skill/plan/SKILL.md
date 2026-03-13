---
name: plan
description: Triage a feature or problem into sized, actionable GitHub and Linear issues
license: MIT
compatibility: opencode
---

# Plan

Transform a feature request, problem description, or rough idea into a concrete set of sized, actionable issues ready for implementation. Creates issues in GitHub and Linear (if configured), informed by the project's existing memory and architecture.

Keep moving through phases. Only stop at the marked checkpoint.

---

## Phase 1 — Load Core Philosophy and Memory

Load the `core` skill to internalize quality standards and git safety rules.

Load memory: if `.ai/memory/MANIFEST.md` exists, read it. Pick entries relevant to the planning context — prior architectural decisions, established patterns, known constraints. Read those files. Hold this as `loaded_memory`. This context shapes what you propose and what you rule out.

---

## Phase 2 — Parse the Input

The input can be:
- A freeform description: "add email verification to signup"
- A problem statement: "users keep losing their session after 5 minutes"
- A reference to an existing GitHub issue: `#123`
- A vague concept: "improve the onboarding flow"
- No input — open triage session

Extract:
- `topic` — what this is about in plain terms
- `source` — freeform, issue ref, or empty
- `scope_hint` — any explicit size or priority signal in the input

If the input is an existing issue reference, fetch it: `gh issue view {number} --json title,body,labels`.

---

## Phase 3 — Research the Codebase

Before proposing anything, understand what already exists.

- Read the relevant areas of the codebase related to the topic
- Check for existing open issues that overlap: `gh issue list --state open --limit 50 --json number,title,labels`
- Look for existing patterns, conventions, and constraints in `loaded_memory`

You are not planning yet — you are building enough understanding to plan well.

---

## Phase 4 — Clarify

Ask the user 2–3 focused questions to resolve genuine ambiguity before proposing a breakdown. Do not ask for information you can infer from the codebase or memory. Do not ask more than 3 questions.

Good questions resolve: scope boundaries, priority ordering, acceptance criteria that aren't obvious, constraints you can't see in the code.

Wait for answers before continuing.

---

## Phase 5 — Draft the Breakdown

Propose a set of issues. For each issue:
- **Title**: concise, action-oriented ("Add email verification token generation")
- **Body**: why this is needed, what done looks like, acceptance criteria
- **Size**: XS (< 1 hour) / S (half day) / M (1 day) / L (2-3 days) / XL (needs splitting)
- **Labels**: bug / feature / refactor / docs / test / chore
- **Dependencies**: which issues must be completed first

Rules:
- No issue larger than L — split XL issues
- Prefer fewer, clearer issues over many small ones
- Each issue should be implementable independently where possible

---

## Phase 6 — Checkpoint: User Approval

**Stop here.** Present the proposed breakdown to the user:

```
PLAN DRAFT
──────────
Topic: {topic}

Issues:
  1. [{size}] {title}
     {one-line summary}
     depends on: none

  2. [{size}] {title}
     {one-line summary}
     depends on: #1
  ...

Ready to create {n} issues in GitHub{linear_note}.
Approve, adjust, or cancel?
```

Do not proceed until the user explicitly approves or provides changes. If they provide changes, revise the draft and show it again. Do not create any issues until approved.

---

## Phase 7 — Create GitHub Issues

For each approved issue, create it with `gh issue create`:

```bash
gh issue create \
  --title "{title}" \
  --body "{body with acceptance criteria}" \
  --label "{labels}"
```

Collect the created issue numbers and URLs.

Display each as it's created: `Created: #{number} — {title}`

---

## Phase 8 — Create Linear Issues (if configured)

Check for Linear configuration by looking for `LINEAR_API_KEY` in the environment or a `.linear.yaml` file in the project root.

If Linear is not configured, skip this phase silently.

If configured, read `.linear.yaml` for team ID and project defaults:

```yaml
teamId: ENG
projectId: proj_abc123
defaultLabels: [feature]
```

For each issue, create a matching Linear issue using the `linear` CLI or API:

```bash
linear issue create \
  --title "{title}" \
  --description "{body}" \
  --team "{teamId}" \
  --estimate {size_points}
```

Size → story points: XS=1, S=2, M=3, L=5

Link the GitHub issue number in the Linear issue description.

Display each: `Linear: {identifier} — {title}`

---

## Phase 9 — Save Memory and Done

Write a context entry to `.ai/memory/context/` capturing the plan rationale:

```markdown
---
ref: Context:plan-{topic-slug}
title: Plan — {topic}
date: {today}
issues: {github_issue_numbers}
---

## What was planned
{brief description of what was broken down and why}

## Key decisions
{any non-obvious choices made during triage}

## Issue breakdown
{list of created issue numbers and titles}
```

Update `MANIFEST.md`. Commit: `git add .ai/memory/ && git commit -m "chore: record plan for {topic}"`.

Display:

```
PLAN COMPLETE
──────────────
GitHub: {issue_numbers}
Linear: {linear_ids or 'not configured'}

Start with: /work-issue {first_issue_number}
```
