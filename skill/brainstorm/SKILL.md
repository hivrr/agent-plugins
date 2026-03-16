---
name: brainstorm
description: Collaborative thinking session to work through a technical problem or idea
license: MIT
compatibility: opencode
---

# Brainstorm

A thinking session — not an implementation session. The goal is to reach clarity on a problem, explore alternatives, and challenge assumptions before committing to an approach. Nothing is built here. At the end, the user decides whether to write a summary, move to `/plan`, or simply stop.

Keep the conversation moving. Ask pointed questions. Do not drift into implementation detail unless the user pulls you there. Depth over breadth — explore one thread fully before branching.

---

## Phase 1 — Initialize Session

### Load Core Philosophy

Load the `core` skill for quality standards and architectural principles.

### Generate Session UUID

Generate a session UUID to identify this brainstorm session. If a `SESSION_UUID` is provided via environment variable or task spec, use that instead.

```bash
SESSION_UUID="${SESSION_UUID:-$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' || python3 -c 'import uuid; print(uuid.uuid4())')}"
```

Store: `session_uuid`

Display: `Session: {session_uuid}`

### Write Initial Memory

Write the session's initial state to memory. Use the memory MCP tool if available; if memory is unavailable, fall back to local files.

**Memory write (primary):**
```
session/{session_uuid}/phase = "initializing"
```

**Local file fallback:**
If the memory write fails or the memory MCP tool is not available, write to local files instead:
```
.ai/session/{session_uuid}/phase.md → "initializing"
```

Log a warning if falling back: `WARNING: Memory unavailable, using local file fallback at .ai/session/{session_uuid}/`

> **Note:** `.ai/` is intended as ephemeral scratch space. Add `.ai/` to your project's `.gitignore` to prevent session artifacts from accumulating in version control.

If `project_uuid` is provided (via environment variable or task spec), link the session to the project:

**Memory write:**
```
project/{project_uuid}/sessions = [...existing, session_uuid]
```

**Local file fallback:**
```
.ai/project/{project_uuid}/sessions.md → append session_uuid (one UUID per line)
```

---

## Phase 2 — Parse the Topic

The input can be:
- A specific technical problem: "our auth middleware is leaking sessions"
- An open question: "should we split this service?"
- A vague feeling: "something feels wrong with how we handle errors"
- No input — open thinking session, ask what they want to work through

Extract:
- `topic` — what the user wants to think through
- `framing` — is this a problem to solve, a decision to make, or an idea to explore?

### Write Intent to Memory

Once the topic is parsed, persist the intent:

**Memory write:**
```
session/{session_uuid}/intent = {
  "goal": "{topic}",
  "framing": "{framing}",
  "constraints": [],
  "non_goals": [],
  "open_questions": []
}
```

**Local file fallback:**
```
.ai/session/{session_uuid}/intent.md →
  goal: {topic}
  framing: {framing}
  constraints: (none yet)
  non_goals: (none yet)
  open_questions: (none yet)
```

Update phase:
```
session/{session_uuid}/phase = "researching"
```

---

## Phase 3 — Research Before Responding

Before saying anything, look at what's actually there.

Read the relevant code, open issues, and recent commits related to the topic. You want to understand the current state well enough to ask good questions — not to jump to answers.

This phase is silent. Do not show your research process unless asked.

Update phase when complete:
```
session/{session_uuid}/phase = "discussing"
```

---

## Phase 4 — Open the Conversation

Present what you understand about the topic in 2–4 sentences, then ask the single most important question that would unlock the most clarity.

Do not present multiple questions at once. Do not present solutions yet. Do not validate the user's framing without examining it first — if the framing seems off, say so.

Good first questions:
- "What's making this feel wrong right now — a specific symptom or a general sense?"
- "Has this approach worked elsewhere in the codebase, or is this the first time?"
- "What would a good outcome look like in concrete terms?"
- "What have you already ruled out and why?"

### Interactivity Model

**Live terminal mode (default when running in Claude Code):**
Present the question directly to the user and wait for their response in the conversation.

**Container mode (when running headlessly or in a container):**
Write each question to the question channel and wait for an answer to be injected:

1. Write the question:
```json
// .ai/session/{session_uuid}/question.json
{
  "session_uuid": "{session_uuid}",
  "turn": 1,
  "question": "concise question text",
  "context": "what you understand so far",
  "posted_at": "{ISO 8601 timestamp}"
}
```

2. Poll for the answer at `.ai/session/{session_uuid}/answer.json`. Check every 2 seconds. If no answer arrives within 5 minutes, write an error and exit gracefully:

```json
// .ai/session/{session_uuid}/error.json
{
  "session_uuid": "{session_uuid}",
  "turn": "{turn}",
  "error": "timeout",
  "message": "No answer received within 5 minutes",
  "timestamp": "{ISO 8601 timestamp}"
}
```

Then stop the session.

3. When the answer arrives:
   - Read the answer
   - Delete both question and answer files
   - Continue the conversation with the answer as context

Detect container mode by checking: no TTY attached, or `BRAINSTORM_CONTAINER_MODE=true` environment variable is set.

---

## Phase 5 — Iterate

Keep the conversation going until the user has reached clarity or run out of useful threads to pull.

Each response should:
- Reflect back what you just heard to confirm understanding
- Introduce one new angle, constraint, or alternative worth considering
- End with a question or a concrete observation that moves the thinking forward

Challenge assumptions when you spot them: "You said X — what if the opposite were true?" Surface tradeoffs that the user might not have considered.

Do not agree with everything. If a proposed direction contradicts an established pattern or a prior decision, say so directly and explain why.

Stay in thinking mode. If the user starts heading toward implementation details, redirect: "We can get into that — but first, are we confident this is the right approach?"

### Incremental Memory Updates

As the conversation progresses, update the intent in memory to reflect what has been learned:

- Add constraints as they emerge
- Add non-goals as things are ruled out
- Update open questions as they are answered or new ones arise

**Memory write (after each turn):**
```
session/{session_uuid}/intent = { updated intent object }
```

**Local file fallback:**
Overwrite `.ai/session/{session_uuid}/intent.md` with the updated state.

In container mode, use the question channel pattern from Phase 4 for each turn of the conversation. Increment the `turn` counter with each question.

---

## Phase 6 — Wrap Up

When the conversation has run its natural course, or when the user signals they're ready to move on:

Update phase:
```
session/{session_uuid}/phase = "complete"
```

Persist a final summary to memory:

**Memory write:**
```
session/{session_uuid}/summary = {
  "topic": "{topic}",
  "key_insights": ["..."],
  "decisions_made": ["..."],
  "open_questions": ["..."],
  "recommended_next": "plan"
}
// recommended_next is an enum: "plan" = hand off to /plan; "done" = stop here
```

**Local file fallback:**
Write `.ai/session/{session_uuid}/summary.md` with the same content.

### Next Steps

Offer:

1. **Create issues** — hand off to `/plan` to break this into actionable GitHub/Linear issues
2. **Done** — stop here, no artifacts

If they choose to create issues, run `/plan` with the topic as input.

Display:
```
SESSION COMPLETE
Session: {session_uuid}
Topic: {topic}
Phase: complete
```

Output the session UUID for handoff to downstream workflows (e.g., planning).
