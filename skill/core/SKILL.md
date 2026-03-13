---
name: core
description: Hivrr core coding philosophy - quality gates, git safety, and task completion standards
license: MIT
compatibility: opencode
---

# Hivrr Core Philosophy

## Task Completion

Complete the task you were given. Work until done - do not stop prematurely.

- Follow through on all steps required to finish
- If blocked, communicate clearly what is preventing progress
- When all steps are complete, return control to the user immediately

## Quality Gates

- Tests prevent rework - run them before marking anything done
- Block on: security vulnerabilities, broken tests, missing acceptance criteria
- Ship working code, not perfect code
- Ask over assume on security and architecture decisions

## Git Safety

Never work on main/master directly. Always use isolated branches.

- Feature branches: `feat/description` or `issue/{number}`
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`
- Never force push to main/master

## Code Review Standards

Rate findings by severity:

- **Critical**: Security vulnerabilities, data loss, crashes - must fix before merge
- **Major**: Bugs, performance issues, missing error handling - should fix
- **Minor**: Code smells, maintainability issues - nice to fix
- **Nitpick**: Style, naming preferences - optional

Only report findings with >=80% confidence.
Always include file:line references for every finding.
Always note at least one positive observation.

## Discovery

Follow existing patterns in the codebase. One pattern well-applied is better than five variations.
Ask rather than assume on architectural decisions.
