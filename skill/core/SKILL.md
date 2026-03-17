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

## File Verification

Never assume a file path. Before editing any file:

- Use Glob or Grep to locate the actual file — do not guess based on naming conventions
- If you're unsure which file owns a behavior, search by function name, symbol, or export before touching anything
- Confirm the file exists and contains what you expect before writing an edit

Guessing a path and being wrong wastes a round trip and can silently edit the wrong file. Verify first, edit second.

## Edit Safety

Before applying any edit, verify the target content is exactly what you read. Files can change between your read and your edit — a stale reference produces a wrong or failed edit.

**Single edit:**
- Re-read the specific lines you intend to change immediately before editing
- Confirm the content matches what you expect — if it doesn't, re-read the full file and replan the edit

**Multiple edits to the same file:**
- Validate all target locations before applying any of them — catch mismatches before mutating anything
- Apply edits bottom-up (highest line numbers first) so earlier splices don't invalidate later line references
- If any edit fails, stop and re-read the file before attempting the remaining edits

**If an edit fails:**
- Never retry the same edit unchanged — the content has drifted
- Re-read the file, find the new location of the target content, and replan
