---
name: audit-tech-debt
description: Scan codebase for maintainability issues and code quality problems
license: MIT
compatibility: opencode
---

# Tech Debt Audit

Scan the codebase for maintainability issues, code smells, and quality problems that slow development or introduce risk.

---

## What to Scan

**Quick mode** — prioritize these files:
1. Core business logic modules
2. Entry points and public APIs
3. Utility and helper modules

**Deep mode** — scan all source files: `.ts`, `.js`, `.py`, `.go`, `.java`, `.rb`, `.php`, `.rs`, `.c`, `.cpp`, plus config files (`package.json`, `requirements.txt`, `go.mod`, `Gemfile`, `Cargo.toml`) and test files.

If no file index was provided, use Glob to discover source files.

---

## What to Look For

### Complexity
- **Deep nesting**: Functions with more than 4 levels of nesting (if/for/while/try)
- **Long functions**: Functions exceeding ~50–100 lines (language-dependent)
- **Too many branches**: Functions with many conditional paths that are hard to reason about
- **Long parameter lists**: Functions with more than 5 parameters — consider grouping into an options object
- **Callback hell**: Deeply nested callbacks or promise chains that could use async/await
- **God objects**: Classes or modules that do too many unrelated things
- **Large files**: Files over ~500 lines that likely need splitting

### Duplication
- **Copy-paste code**: Similar or identical blocks across multiple files
- **Same logic, different implementations**: The same computation done slightly differently in multiple places
- **Missing abstractions**: Patterns that repeat enough to deserve a shared utility
- **Duplicate type definitions**: The same interface or type defined in more than one place

### Dependencies
- **Significantly outdated major versions**: Dependencies several major versions behind latest
- **Deprecated or abandoned packages**: Packages marked deprecated or with no recent activity
- **Unused dependencies**: Packages declared in the manifest but never imported
- **Duplicate-purpose packages**: Multiple packages solving the same problem (e.g., `moment` and `dayjs` both present)
- **Missing lockfile**: No lockfile for reproducible installs

### Testing Gaps
- **Untested critical paths**: Core business logic with no corresponding tests
- **Happy-path-only tests**: Tests that don't cover error cases or edge conditions
- **Untested error handling**: `catch` blocks or error paths with no test coverage
- **Source files with no test file**: Files that should have a companion test file but don't

### Dead Code
- **Exported functions or classes never imported**: Visible dead exports
- **Unreachable code**: Code after `return`, `throw`, or `break`
- **Large blocks of commented-out code**: Should be deleted, not preserved in comments
- **Unused variables or imports**: Declared but never referenced

### Inconsistency
- **Mixed async patterns**: Some code uses callbacks, some uses promises, some uses async/await in the same codebase
- **Inconsistent error handling**: Different approaches to error handling in similar contexts
- **Naming convention violations**: Deviations from the conventions used in the rest of the codebase
- **Architectural violations**: Files or patterns that don't follow the established project structure

---

## Severity Guide

| Severity | When to use |
|----------|-------------|
| critical | Actively blocking development or causing bugs right now (e.g., a god object that makes changes impossible) |
| high | Significant maintenance burden that affects team velocity |
| medium | Moderate impact — should be addressed in normal flow |
| low | Minor issues — address opportunistically |

| Effort | When to use |
|--------|-------------|
| trivial | Delete code, rename, single-line fix |
| small | Extract a function, add tests, under an hour |
| medium | Refactor a module, touch multiple files |
| large | Architectural change, multi-day effort |

---

## Output Format

Report findings as a list. For each finding include:
- **File and line number**
- **Title** — a short, specific description of the issue
- **Severity** and **effort**
- **What's wrong** — describe the specific problem
- **How to fix** — a concrete recommendation

Group by severity (critical first). At the end, report files scanned and issues found.

If no issues are found, say so. If a file can't be read, skip and note it in the summary.
