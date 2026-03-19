# Hivrr Claude Plugin

Skills and commands for implementation, brainstorming, planning, and code review workflows in Claude Code.

## Plugins

### `hivrr-skills`
Implementation and code workflow tools. Install this for day-to-day engineering work.

**Skills:** `audit`, `audit-accessibility`, `audit-performance`, `audit-security`, `audit-tech-debt`, `core`, `debug`, `merge-pr`, `wave`, `work-issue`, `work-pr`

**Commands:** `audit`, `debug`, `merge-pr`, `work-issue`, `work-pr`

---

### `hivrr-brainstorm`
Interactive brainstorming for product ideation and refinement.

**Skills:** `brainstorm`

**Commands:** `brainstorm`

---

### `hivrr-planning`
Project planning and task decomposition.

**Skills:** `planning`

**Commands:** `planning`

---

### `hivrr-review`
Pull request code review — fetches diff, analyzes it, and posts a structured BLOCKER/REQUIRED/DEFERRED comment.

**Skills:** `review-pr`

**Commands:** `review-pr`

---

### `hivrr-score-issues`
Score GitHub issues by urgency for work allocation prioritization.

**Skills:** `score-issues`

**Commands:** `score-issues`

---

## Bundles

Bundles let a plugin manager install the right combination of plugins for a given task type.

| Bundle | Plugins included |
|--------|-----------------|
| `dev-in-a-box` | `hivrr-brainstorm`, `hivrr-planning`, `hivrr-review`, `hivrr-skills` |
| `implementation-only` | `hivrr-review`, `hivrr-skills` |
| `planning-suite` | `hivrr-brainstorm`, `hivrr-planning` |

- A container running implementation work installs `implementation-only` — no brainstorm or planning tools in context, faster startup.
- A user who wants everything installs `dev-in-a-box`.
