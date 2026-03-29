# hivrr-agent-plugin

Claude Code skills and slash commands for the hivrr workflow. Distributed as a Claude plugin and loaded into agent sessions to give them first-class access to hivrr's automation capabilities.

## Overview

The agent plugin ships two artifact types:

- **Skills** — reusable prompts loaded by name (e.g., `work-issue`, `review-pr`). Used by Claude to execute well-defined tasks with consistent behavior.
- **Commands** — slash commands exposed in the Claude Code UI (e.g., `/work-issue 123`, `/audit security`).

## Skills

| Skill | Description |
|-------|-------------|
| `work-issue` | Implement a GitHub issue end-to-end and open a PR |
| `work-pr` | Address PR review feedback end-to-end |
| `review-pr` | Review a PR and post a structured comment |
| `merge-pr` | Merge a PR, close linked issues, clean up branches |
| `brainstorm` | Collaborative thinking session on a technical problem |
| `planning` | Triage a feature into sized GitHub issues |
| `debug` | Diagnose a bug without making changes |
| `audit` | Scan codebase for security, tech-debt, and performance issues |
| `group-issues` | Group GitHub issues into implementation waves |
| `score-issues` | Score issues by urgency, complexity, and risk |
| `diagnose-failure` | Diagnose a failed worker job and recommend action |
| `wave` | Execute multiple related issues on a shared branch |
| `senior-ai-engineer` | Senior AI engineer persona for code review and advice |

## Commands

Commands are thin wrappers that load a skill and pass `$ARGUMENTS`.

```
/work-issue 123
/work-pr 456
/review-pr 789
/merge-pr 99 --auto
/audit security --mode deep
/debug 456
/brainstorm "how should we handle retries?"
/planning "add SSE to insight"
/group-issues --repo hivrr/manager --issues 123,456
/score-issues --repo hivrr/manager --issues 123,456
/diagnose-failure --job-id abc123 --task-type work-issue
```

## Setup

This plugin is distributed via the hivrr GitHub Packages registry. Add it to your Claude Code settings:

```json
{
  "plugins": [
    "hivrr/agent-plugin"
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
