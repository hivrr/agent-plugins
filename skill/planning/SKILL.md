---
name: planning
description: Triage a feature or problem into sized, actionable GitHub and Linear issues
license: MIT
compatibility: opencode
---

# Planning

Transform a feature request, problem description, or rough idea into a concrete set of sized, actionable issues ready for implementation. Creates issues in GitHub and Linear (if configured), informed by the project's existing memory and architecture.

Keep moving through phases. Only stop at the marked checkpoint.

---

## Phase 1 — Load Core Philosophy

Load the `core` skill to internalize quality standards and git safety rules.

---

## Phase 2 — Initialize Session

### Accept or Generate Session UUID

If a `SESSION_UUID` is provided (via environment variable, task spec, or inline argument from brainstorm output), use it. Otherwise generate one:

```bash
SESSION_UUID="${SESSION_UUID:-$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' || python3 -c 'import uuid; print(uuid.uuid4())')}"
```

Store: `session_uuid`

Display: `Session: {session_uuid}`

### Read Brainstorm Context from Memory

If a session UUID was provided, attempt to read the brainstorm intent from memory:

**Memory read (primary):**
```
session/{session_uuid}/intent
```

**Local file fallback:**
```
.ai/session/{session_uuid}/intent.md
```

If intent is found, use it as starting context — the topic, framing, constraints, non-goals, and open questions from the brainstorm session inform the planning process. Skip or shorten Phase 4 (Clarify) if the intent already resolves ambiguity.

If no intent is found, continue normally — the planning skill works standalone.

### Write Initial Phase

**Memory write:**
```
session/{session_uuid}/phase = "planning"
```

**Local file fallback:**
```
.ai/session/{session_uuid}/phase.md → "planning"
```

Log a warning if falling back: `WARNING: Memory unavailable, using local file fallback at .ai/session/{session_uuid}/`

---

## Phase 3 — Parse the Input

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

## Phase 4 — Research the Codebase

Before proposing anything, understand what already exists.

- Read the relevant areas of the codebase related to the topic
- Check for existing open issues that overlap: `gh issue list --state open --limit 50 --json number,title,labels`
- Look for existing patterns and conventions in the codebase

You are not planning yet — you are building enough understanding to plan well.

---

## Phase 5 — Clarify

### Interactivity Model

**Live terminal mode (default when running in Claude Code):**
Ask the user directly and wait for their response in the conversation.

**Container mode (when running headlessly or in a container):**
Write each question to the question channel and wait for an answer to be injected:

1. Write the question:
```json
// .ai/session/{session_uuid}/question.json
{
  "session_uuid": "{session_uuid}",
  "phase": "clarify",
  "question": "concise question text",
  "context": "what you understand so far",
  "options": ["A: description", "B: description"],
  "posted_at": "{ISO 8601 timestamp}"
}
```

2. Poll for the answer at `.ai/session/{session_uuid}/answer.json`. Check every 2 seconds. If no answer arrives within 5 minutes, write an error and exit gracefully.

3. When the answer arrives:
   - Read the answer
   - Delete both question and answer files
   - Continue with the answer as context

Detect container mode by checking: no TTY attached, or `PLANNING_CONTAINER_MODE=true` environment variable is set.

### Questions

Ask the user 2-3 focused questions to resolve genuine ambiguity before proposing a breakdown. Do not ask for information you can infer from the codebase or memory. Do not ask more than 3 questions.

Good questions resolve: scope boundaries, priority ordering, acceptance criteria that aren't obvious, constraints you can't see in the code.

If brainstorm intent was loaded in Phase 2 and already resolves these questions, skip this phase.

Wait for answers before continuing.

---

## Phase 6 — Draft the Breakdown

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

## Phase 7 — Checkpoint: User Approval

### Live terminal mode

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

### Container mode

Write the plan draft to the question channel for approval:

```json
// .ai/session/{session_uuid}/question.json
{
  "session_uuid": "{session_uuid}",
  "phase": "approval",
  "question": "Approve this plan?",
  "context": "{ full plan draft }",
  "options": ["approve", "adjust", "cancel"],
  "posted_at": "{ISO 8601 timestamp}"
}
```

Wait for the answer before proceeding. If "adjust", revise and re-post. If "cancel", exit gracefully.

---

## Phase 8 — Create GitHub Issues

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

## Phase 9 — Create Linear Issues (if configured)

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

## Phase 10 — Write to Memory

After issue creation, persist the planning output to memory before exiting.

**Memory write:**
```
session/{session_uuid}/prd         = full PRD text
session/{session_uuid}/plan        = [{ task_id, title, repo, model_config,
                                        dependencies, acceptance_criteria,
                                        github_issue_url }]
session/{session_uuid}/decisions   = architectural choices made during decomposition
session/{session_uuid}/constraints = discovered constraints and non-goals
session/{session_uuid}/phase       = "executing"
```

**Local file fallback:**
If memory is unavailable, write to `.ai/session/{session_uuid}/plan.md` containing the full plan and PRD content. Log a warning: `WARNING: Memory unavailable, plan written to .ai/session/{session_uuid}/plan.md`

Do not fail if memory write fails — log the warning and continue.

---

## Phase 11 — Done

Display:

```
PLAN COMPLETE
──────────────
Session: {session_uuid}
GitHub: {issue_numbers}
Linear: {linear_ids or 'not configured'}

Start with: /work-issue {first_issue_number}
```
