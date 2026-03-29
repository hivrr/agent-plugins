# hivrr-agent-plugin

Claude Code skills and slash commands for the hivrr workflow. Distributed as a Claude plugin and loaded into agent sessions to give them first-class access to hivrr's automation capabilities.

## Overview

The agent plugin ships two artifact types:

- **Skills** — reusable prompts loaded by name (e.g., `work-issue`, `review-pr`). Used by Claude to execute well-defined tasks with consistent behavior.
- **Commands** — slash commands exposed in the Claude Code UI (e.g., `/work-issue 123`, `/audit security`).

The plugin is split into three focused packages:

| Plugin | Purpose |
|--------|---------|
| `hivrr` | Full development toolkit — implementation, brainstorming, planning, and code review |
| `manager` | Manager utility skills for automated work allocation — scoring, grouping, and failure diagnosis |
| `data-platform` | Full data platform skills — covers the complete stack from ingestion and pipelines to ML, LLMs, dashboards, and database administration |

## Skills

### `hivrr`

| Skill | Description |
|-------|-------------|
| `work-issue` | Implement a GitHub issue end-to-end and open a PR |
| `work-pr` | Address PR review feedback end-to-end |
| `review-pr` | Review a PR and post a structured comment |
| `merge-pr` | Merge a PR, close linked issues, clean up branches |
| `wave` | Execute multiple related issues on a shared branch |
| `brainstorm` | Collaborative thinking session on a technical problem |
| `planning` | Triage a feature into sized GitHub issues |
| `debug` | Diagnose a bug without making changes |
| `audit` | Scan codebase for all issue types (see sub-skills below) |
| `audit-security` | Scan codebase for security vulnerabilities |
| `audit-accessibility` | Scan codebase for accessibility issues |
| `audit-performance` | Scan codebase for performance issues |
| `audit-tech-debt` | Scan codebase for tech debt |
| `core` | Hivrr core coding philosophy — quality gates, git safety, and task completion standards |

### `manager`

| Skill | Description |
|-------|-------------|
| `group-issues` | Group GitHub issues into implementation waves |
| `score-issues` | Score issues by urgency, complexity, and risk |
| `diagnose-failure` | Diagnose a failed worker job and recommend action |

### `data-platform`

| Skill | Description |
|-------|-------------|
| `senior-data-scientist` | Senior data scientist persona for analysis and modelling advice |
| `senior-data-engineer` | Senior data engineer persona for pipeline and infrastructure advice |
| `senior-data-analyst` | Senior data analyst persona for reporting and SQL advice |
| `senior-ai-engineer` | Senior AI engineer persona for code review and advice |
| `snowflake` | Snowflake administration and query skills |
| `postgres` | PostgreSQL administration skills |
| `postgres-query` | Safe PostgreSQL query execution and analysis |

## Commands

Commands are thin wrappers that load a skill and pass `$ARGUMENTS`.

```
/work-issue 123
/work-pr 456
/review-pr 789
/merge-pr 99 --auto
/wave 123,456,789
/write-plan "add SSE to insight"
/audit security --mode deep
/debug 456
/brainstorm "how should we handle retries?"
/planning "add SSE to insight"
/group-issues --repo hivrr/manager --issues 123,456
/score-issues --repo hivrr/manager --issues 123,456
/diagnose-failure --job-id abc123 --task-type work-issue
```

## Setup

Each plugin is distributed separately via the hivrr GitHub Packages registry. Add whichever you need to your Claude Code settings:

```json
{
  "plugins": [
    "hivrr/agent-plugin",
    "hivrr/manager-plugin",
    "hivrr/data-platform-plugin"
  ]
}
```

Or reference the local path during development:

```json
{
  "plugins": [
    "/path/to/agent-plugin"
  ]
}
```

## Verification

```bash
./scripts/hivrr-verify.sh
```

## License

MIT
