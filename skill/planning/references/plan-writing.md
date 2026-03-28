# Plan Writing Reference

How to write implementation plan documents that an engineer with zero codebase context can execute without getting stuck.

---

## Core Principles

**DRY.** One canonical definition per concept. If two tasks need the same helper, define it once in Task 1 and reference that task in Task 2.

**YAGNI.** No helpers, abstractions, or utilities for hypothetical future requirements. The right amount of complexity is the minimum needed for the current task.

**TDD.** Every feature starts with a failing test. No step implements code before writing a test that proves the code is needed.

**Frequent commits.** One commit per task, at minimum. Smaller is better — engineers can always squash, but they can't unsquash.

---

## Plan Document Header

Every plan must start with this header:

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** Use the `work-issue` skill to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach — not implementation details]

**Tech Stack:** [Key technologies/libraries — e.g., "TypeScript, Express, Prisma, Jest"]

---
```

---

## File Structure Map

Before any tasks, map every file that will be created or modified:

```markdown
## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/auth/token.ts` | Token generation and validation |
| Modify | `src/auth/signup.ts` | Add verification step to signup handler |
| Modify | `src/db/schema.ts` | Add email_tokens table migration |
| Create | `tests/auth/token.test.ts` | Token generation tests |
```

**Rules:**
- One responsibility per file — never "handles auth and also manages state"
- Files that change together live together — split by ownership, not by technical layer
- If modifying an existing file, note the line range: `src/auth/signup.ts:45-80`
- Lock in these decisions before writing any tasks — the file structure governs everything that follows

---

## Bite-Sized Task Structure

Each task is one cohesive unit of work. Each step is 2-5 minutes.

```markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts:45-80`
- Test: `tests/exact/path/to/test.ts`

- [ ] **Step 1: Write the failing test**

  ```typescript
  // tests/auth/token.test.ts
  import { generateVerificationToken } from '../../src/auth/token'

  describe('generateVerificationToken', () => {
    it('returns a 64-character hex string', () => {
      const token = generateVerificationToken()
      expect(token).toMatch(/^[a-f0-9]{64}$/)
    })

    it('returns unique tokens on each call', () => {
      const a = generateVerificationToken()
      const b = generateVerificationToken()
      expect(a).not.toBe(b)
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `npm test tests/auth/token.test.ts`
  Expected: FAIL — `Cannot find module '../../src/auth/token'`

- [ ] **Step 3: Write minimal implementation**

  ```typescript
  // src/auth/token.ts
  import { randomBytes } from 'crypto'

  export function generateVerificationToken(): string {
    return randomBytes(32).toString('hex')
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `npm test tests/auth/token.test.ts`
  Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

  ```bash
  git add tests/auth/token.test.ts src/auth/token.ts
  git commit -m "feat: add email verification token generation"
  ```
```

---

## Commit Message Format

```
feat: {what it adds}
fix: {what it fixes}
refactor: {what it cleans up}
test: {what tests cover}
docs: {what docs add}
```

One commit per task. Stage only the files for that task. Never `git add .`.

---

## No-Placeholders Rules

These are plan failures. Never write them:

| Pattern | Why it fails |
|---------|-------------|
| "TBD", "TODO", "implement later" | Engineer has to make a decision you should have made |
| "Add appropriate error handling" | What errors? What handling? Specify exactly |
| "Add validation" | What validation? What happens on failure? Show the code |
| "Handle edge cases" | Which cases? Show the code |
| "Write tests for the above" | No test code = no test |
| "Similar to Task N" | Engineers may read tasks out of order. Repeat the code |
| Types or functions not defined anywhere in the plan | Bugs waiting to happen |
| Steps that describe what to do without showing how | Code blocks are required for code steps |

**Scan pass:** Before saving, search the plan for every pattern above. Fix every instance.

---

## Allowed APIs Contract

Every function, type, or import used in a code block must either:
1. Exist in the codebase (cite file:line in the plan's Phase 4 "Allowed APIs" list), or
2. Be defined in a prior task in this plan

Never invent an API. If you need something that doesn't exist, Task 1 creates it, Task 2 uses it.

---

## Type Consistency Check

Before finalizing, scan for:
- Function `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 — that's a bug
- Type `UserToken` in Task 2 but `VerificationToken` in Task 5 — pick one
- Import paths that change between tasks

Rename consistently across the entire plan before saving.

---

## Self-Review Checklist

After writing the complete plan:

1. **Spec coverage** — skim each requirement. Can you point to a task that implements it? List any gaps.
2. **Placeholder scan** — search for every red-flag pattern above. Fix them.
3. **Type consistency** — names, signatures, and imports match across all tasks.
4. **Allowed APIs** — every referenced function exists in the codebase or is defined in a prior task.
5. **Commit coverage** — every task ends with a commit step.

Fix inline. No need to re-review after fixing.
