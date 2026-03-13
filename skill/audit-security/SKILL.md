---
name: audit-security
description: Scan codebase for security vulnerabilities using OWASP Top 10
license: MIT
compatibility: opencode
---

# Security Audit

Scan the codebase for security vulnerabilities using OWASP Top 10 2021 as the reference framework.

---

## What to Scan

**Quick mode** — prioritize these files:
1. Auth and login modules
2. API route handlers
3. Database query files
4. Config files that reference secrets or credentials
5. Input validation utilities

**Deep mode** — scan all source files: `.ts`, `.js`, `.py`, `.go`, `.java`, `.rb`, `.php` plus config files (`.env*`, `*.yaml`, `*.yml`, `*.json`, `*.toml`) and package manifests.

If no file index was provided, use Glob to discover files yourself.

---

## What to Look For

### Injection (OWASP A03)
- **SQL injection**: User input concatenated or interpolated directly into SQL queries
- **Command injection**: User input passed to `exec()`, `spawn()`, `system()`, or shell commands
- **XSS**: Unsanitized user input rendered in HTML via `innerHTML`, `dangerouslySetInnerHTML`, or similar
- **Path traversal**: User input used in file paths without validation (watch for `../` patterns)

### Broken Access Control (OWASP A01)
- Sensitive endpoints without authentication middleware
- Direct object references with no ownership check (user can access another user's data by changing an ID)
- Admin or privileged functions reachable without a role check

### Authentication Failures (OWASP A07)
- Hardcoded API keys, passwords, or tokens in source code
- Weak or missing password complexity requirements
- Session tokens that are predictable, never expire, or aren't regenerated after login
- Auth endpoints with no rate limiting or brute-force protection

### Cryptographic Failures (OWASP A02)
- Passwords, tokens, or PII written to logs or error messages
- Sensitive data stored in plaintext
- MD5 or SHA1 used for password hashing (use bcrypt/argon2)
- `.env` files or secrets committed to the repository

### Security Misconfiguration (OWASP A05)
- Debug mode or verbose error output enabled in production config
- CORS set to `*` on endpoints that use credentials
- Missing security headers (CSP, X-Frame-Options, etc.)
- Default credentials left unchanged in config

### Vulnerable Dependencies (OWASP A06) — deep mode only
- Package manifest dependencies that are significantly outdated or known to be vulnerable

---

## Severity Guide

| Severity | When to use |
|----------|-------------|
| critical | Remote code execution, unauthenticated data breach, no preconditions needed |
| high | Auth bypass, significant data exposure, hardcoded secrets |
| medium | Requires conditions to exploit (stored XSS, weak crypto) |
| low | Best practice violations, defense-in-depth improvements |

| Effort | When to use |
|--------|-------------|
| trivial | Config change or single-line fix |
| small | Localized fix, under an hour |
| medium | Multiple files, needs testing |
| large | Architectural change |

---

## Output Format

Report findings as a list. For each finding include:
- **File and line number**
- **Title** — a short, specific description of the issue
- **Severity** and **effort**
- **What's wrong** — what the code is doing and why it's a problem
- **How to fix** — a concrete recommendation
- **OWASP/CWE reference** where applicable

Group findings by severity (critical first). At the end, report how many files were scanned and how many issues were found.

If no issues are found, say so clearly — a clean result is useful information.

If a file can't be read, skip it and note it in the summary. Don't stop the scan.
