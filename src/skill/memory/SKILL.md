---
name: memory
description: Project memory — decisions, patterns, and context stored in .ai/memory/
license: MIT
compatibility: opencode
---

# Memory

Project memory lives in `.ai/memory/` at the repository root. It stores architectural decisions, reusable patterns, and project context across sessions and across teammates. Memory files are committed to the repo — they are shared knowledge, versioned with the code.

---

## Directory Structure

```
.ai/
└── memory/
    ├── MANIFEST.md           ← auto-maintained index (always read this first)
    ├── decisions/
    │   └── NNN-slug.md       ← architectural decision records
    ├── patterns/
    │   └── name.md           ← reusable code patterns
    └── context/
        └── name.md           ← project context (architecture, setup, dependencies)
```

---

## MANIFEST.md Format

The MANIFEST is the single entry point for all memory. Every stored entry gets one line here — a reference ID, a title, and a one-sentence summary. Read the MANIFEST first, pick what's relevant, then read only those files.

```markdown
# Memory Manifest
Last updated: 2026-01-15

## Decisions
- [Decision-001] Use PostgreSQL — chose over MongoDB for ACID compliance (2026-01-10)
- [Decision-002] Feature flags via env vars — avoid DB-backed flags for simplicity (2026-01-12)

## Patterns
- [Pattern:error-handling] API error shape — {error, code, details} across all endpoints (2026-01-08)
- [Pattern:auth-middleware] JWT verification — wraps all protected routes (2026-01-10)

## Context
- [Context:architecture] System overview — microservices with shared auth service (2026-01-05)
- [Context:setup] Local development — requires Docker, Node 20, .env.local (2026-01-05)
```

---

## Reading Memory

At the start of any workflow:

1. Check if `.ai/memory/MANIFEST.md` exists. If not, skip — no memory yet.
2. Read the MANIFEST.
3. Based on what you're working on (issue title, keywords, labels, file areas), pick the 3–7 most relevant entries.
4. Read only those files.
5. Hold the contents as `loaded_memory` for reference during the workflow.

Claude does the relevance matching natively — no scripts or indices needed.

---

## Writing Memory

After implementing something significant, capture what was learned. Write sparingly — only things that would genuinely help the next session or a teammate. Not every decision needs recording, only those with non-obvious rationale or lasting impact.

### Decision file — `decisions/NNN-slug.md`

Number sequentially. Find the highest existing number in the MANIFEST, use the next one.

```markdown
---
ref: Decision-003
title: Use feature flags for gradual rollout
date: 2026-01-15
issue: 456
---

## Context
We needed to deploy risky features without exposing them to all users at once.

## Decision
Use environment variable-based feature flags rather than a database-backed system.

## Rationale
Simpler to reason about. No runtime DB reads per request. Deployments control exposure.

## Consequences
Requires a redeploy to toggle a flag. Not suitable for per-user targeting.
```

### Pattern file — `patterns/name.md`

Name is a short descriptive slug: `error-handling`, `auth-middleware`, `pagination`.

```markdown
---
ref: Pattern:error-handling
title: API error response shape
date: 2026-01-08
tags: [api, errors]
---

All API error responses follow this shape: `{error: string, code: string, details?: object}`.

```typescript
return res.status(400).json({
  error: "Validation failed",
  code: "VALIDATION_ERROR",
  details: { field: "email", reason: "invalid format" }
})
```
```

### Context file — `context/name.md`

For architectural facts, setup instructions, or project background that isn't a decision per se.

```markdown
---
ref: Context:architecture
title: System architecture overview
date: 2026-01-05
---

## Summary
Microservices: auth-service, api-gateway, and worker. Shared Postgres DB. Redis for sessions.

## Details
- Auth service handles all JWT issuance and validation
- API gateway proxies to services and enforces auth middleware
- Worker processes background jobs from a Redis queue
```

---

## Updating the MANIFEST

After writing any new file:

1. Read `MANIFEST.md`.
2. Add one line under the correct section: `- [ref] title — one-line summary (date)`
3. Update the `Last updated:` date at the top.
4. Write the file back.

Keep entries in chronological order within each section. Never delete entries — if something is superseded, note it in the original file, but keep the MANIFEST line.

---

## Committing Memory Changes

Memory files should travel with the code that generated them.

- In workflows that produce a commit (work-issue, work-pr): write memory files before `git add -A` so they're staged automatically.
- In workflows without a code commit (audit, debug, merge-pr): after writing memory, run `git add .ai/memory/ && git commit -m "chore: update memory"` as a standalone commit.

If nothing was written, skip silently.

---

## /memory Command Routing

When invoked directly as `/memory`, route based on the user's input:

**No input** or **`show`**
Read `.ai/memory/MANIFEST.md` and display it. Show total entry counts by section. If no MANIFEST exists, say "No memory yet — one will be created when you complete your first workflow."

**`search {query}`**
Read the MANIFEST. Find all entries whose title or summary contains the query terms. Read and display those files in full.

**`add`**
Ask the user: decision, pattern, or context? Then ask for the content. Write the appropriate file, update the MANIFEST, and confirm what was written.

**`add decision {description}`** / **`add pattern {description}`** / **`add context {description}`**
Write the entry directly using the description provided. Fill in a reasonable title and date. Update the MANIFEST.

**`rebuild`**
Scan all files in `.ai/memory/decisions/`, `.ai/memory/patterns/`, `.ai/memory/context/`. Read each file's frontmatter (`ref`, `title`, `date`) and first non-heading paragraph as the summary. Regenerate `MANIFEST.md` from scratch. Display entry count found.

For all write operations: confirm what was written and remind the user to commit `.ai/memory/` if it's not part of an active workflow commit.
