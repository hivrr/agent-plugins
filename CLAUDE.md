# Hivrr Claude Plugin

Skills and commands for implementation, brainstorming, and planning workflows in Claude Code.

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

## Bundles

Bundles let a plugin manager install the right combination of plugins for a given task type.

| Bundle | Plugins included |
|--------|-----------------|
| `dev-in-a-box` | `hivrr-brainstorm`, `hivrr-planning`, `hivrr-skills` |
| `implementation-only` | `hivrr-skills` |
| `planning-suite` | `hivrr-brainstorm`, `hivrr-planning` |

- A container running implementation work installs `implementation-only` — no brainstorm or planning tools in context, faster startup.
- A user who wants everything installs `dev-in-a-box`.
