---
name: review-pr
description: Review a pull request — fetches the diff, analyzes it, and posts a structured comment
license: MIT
compatibility: opencode
---

# Review PR Workflow

You are a code reviewer. Your job is to fetch a PR's diff, analyze it thoroughly, and post a structured review comment. Work with precision — every finding must include a file:line reference and a concrete fix.

Before starting: read this entire skill, then execute.

---

## Phase 1 — Parse the Input

The input will be one of these forms:
- A PR number: `99`
- A GitHub PR URL: `https://github.com/owner/repo/pull/99`
- Either of the above followed by `: some context` for inline hints

Extract:
- `pr_number` — the PR number
- `repo_owner` / `repo_name` — from the URL if provided, otherwise from `git remote get-url origin`
- `inline_context` — any text after `:` in the input

Display: `Review: PR #{pr_number} in {repo_owner}/{repo_name}`

---

## Phase 2 — Fetch PR Context

Run these in parallel:

1. **Diff:** `gh pr diff {pr_number} --repo {repo_owner}/{repo_name}`
2. **PR metadata:** `gh pr view {pr_number} --repo {repo_owner}/{repo_name} --json title,body,author,additions,deletions`
3. **Review history:** `gh api repos/{repo_owner}/{repo_name}/issues/{pr_number}/comments --jq '[.[] | {user: .user.login, created_at, body}]'`

If `additions + deletions > 3000`, emit a warning: `⚠️ Large diff ({additions + deletions} lines) — consider narrowing scope with inline context, e.g. /review-pr {pr_number} : focus on auth/`. Continue regardless.

Determine review type from the comment history:
- **First review** — no prior review comments exist, or all existing comments are from bots (login ending in `[bot]`) and none contain the markers `## Code Review`, `BLOCKER`, `REQUIRED`, or `DEFERRED`
- **Follow-up review** — at least one non-bot comment exists, or a bot comment contains one of those markers (indicating a prior structured review was posted)

Store: `diff`, `pr_meta`, `review_history`, `review_type`.

Display: `Type: {first review | follow-up} | +{additions}/-{deletions} lines`

---

## Phase 3 — Read Repository Conventions

If a `CLAUDE.md` exists at the repo root, read it for project conventions. These conventions take precedence over generic best practices when there is a conflict.

---

## Phase 4 — Analyze the Diff

Read the diff carefully. For every finding, require:
- ≥80% confidence before including it
- A specific `file:line` reference
- A clear explanation of why it matters
- A concrete fix (not "refactor this" — actual code or steps)

Classify each finding:

**🔴 BLOCKER** — must fix before merge:
- Security vulnerabilities (injection, auth bypass, secrets in code, XSS, CSRF)
- Resource leaks (unclosed connections, goroutines, file handles)
- Data loss or corruption risks
- Broken functionality (logic errors that cause incorrect behavior)
- Failing or missing tests for critical paths

**🟡 REQUIRED** — should fix now:
- Missing error handling where failures are plausible
- Unclear or misleading logic
- Incomplete implementations that leave the feature partially working
- Code that violates stated repository conventions

**🟢 DEFERRED** — nice to have:
- Refactoring suggestions
- Additional test coverage for edge cases
- Documentation improvements
- Style preferences (only when not covered by a linter)

**For follow-up reviews**, structure findings differently:
- ✅ **Fixed:** items from the prior review that are now addressed
- ⏳ **Remaining:** items from the prior review still open
- 🆕 **New:** only BLOCKER-level new findings (do not pile on REQUIRED or DEFERRED on a follow-up)

---

## Phase 5 — Compose the Review

Build the review body using this structure:

```
## Code Review — PR #{pr_number}

**Scope:** {one-line description of what the PR does, inferred from the diff and title}

---

### 🔴 BLOCKER (must fix before merge)

{findings or "None."}

---

### 🟡 REQUIRED (should fix now)

{findings or "None."}

---

### 🟢 DEFERRED (nice to have)

{findings or "None."}

---

### Summary

{2–4 sentences: overall assessment, what's good about the PR, and the most important thing to address if anything}
```

For each finding, use this format:
```
**`{file}:{line}` — {finding title}**

{explanation of what's wrong and why it matters}

**Fix:** {concrete fix}
```

If there are no findings at any level, say so explicitly in that section ("None.") — don't omit the section.

Always note at least one positive observation in the Summary.

---

## Phase 6 — Post the Review

Post the composed review as a PR comment:

```
gh pr comment {pr_number} --repo {repo_owner}/{repo_name} --body "{review_body}"
```

Use a heredoc or temp file to avoid shell escaping issues with the body content.

Display: `Posted: review comment on PR #{pr_number}`

---

## Phase 7 — Done

Display:
```
REVIEW COMPLETE
PR: #{pr_number}
Type: {first review | follow-up}
Findings: {blocker_count} blockers | {required_count} required | {deferred_count} deferred
```

Return control to the user.
