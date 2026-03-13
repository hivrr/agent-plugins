---
description: Scan the codebase for issues across security, accessibility, tech-debt, and performance
---

# /audit $ARGUMENTS

Load the `audit` skill and run a codebase audit.

**Arguments:** $ARGUMENTS

Supported formats:
- *(no arguments)* — quick scan across all domains
- `security` — security vulnerabilities only
- `accessibility` — WCAG accessibility issues only
- `tech-debt` — code quality and maintainability only
- `performance` — performance bottlenecks only
- `all` — same as no arguments
- Append `--mode deep` for a comprehensive scan (default is quick)

Examples:
```
/audit
/audit security
/audit security --mode deep
/audit all --mode deep
```
