# Plan Review Reference

How to dispatch a plan review subagent and interpret its output.

---

## When to Run

Always run after writing the plan document (Phase 9), before the user approval checkpoint. The reviewer catches what the author misses — especially missing requirements, vague steps, and type inconsistencies.

---

## Subagent Dispatch

Dispatch a general-purpose subagent with this prompt (fill in the bracketed values):

```
You are a plan document reviewer. Verify this plan is complete and ready for implementation.

**Plan to review:** [PLAN_FILE_PATH]
**Spec for reference:** [ORIGINAL_ISSUE_NUMBERS_OR_SPEC_DESCRIPTION]

## What to Check

| Category | What to Look For |
|----------|------------------|
| Completeness | Does every requirement/issue have a corresponding task? List any gaps. |
| Spec alignment | Does the plan match the spec without scope creep? Flag both over-scoping and under-scoping. |
| Task decomposition | Are tasks actionable with clear done criteria? Are any steps so vague an engineer would get stuck? |
| Buildability | Could a skilled engineer follow this plan cold, without additional context? |
| No-placeholders | Flag: "TBD", "TODO", "add appropriate error handling", "similar to Task N", steps without code blocks |
| Type consistency | Do function names, type names, and import paths match across all tasks? |

## Calibration

Only flag issues that would cause real problems during implementation.

An implementer building the wrong thing, getting stuck, or encountering a runtime error because of a plan inconsistency is a real problem. Flag it.

Minor wording preferences, stylistic suggestions, and "nice to have" additions are not issues.

Approve unless there are serious gaps: missing requirements, contradictory steps, placeholder content, tasks so vague they cannot be acted on, or type/name inconsistencies across tasks.

## Output Format

## Plan Review

**Status:** Approved | Issues Found

**Issues (if any):**
- [Task X, Step Y]: [specific issue] — [why it matters for implementation]
- [Task X, Step Y]: [specific issue] — [why it matters for implementation]

**Recommendations (advisory — do not block approval):**
- [improvement suggestion]
```

---

## Interpreting the Output

**Status: Approved**
Proceed to Phase 10 (User Approval). No changes needed.
Display: `Plan Review: Approved | 0 issues`

**Status: Issues Found**
Fix every listed issue in the plan document before proceeding. Re-save the plan.
Display: `Plan Review: Issues Found | {n} issues fixed`

Do not argue with the reviewer. If an issue is listed, fix it. If the fix is non-obvious, apply the most conservative interpretation (add more detail, more specificity, more actual code).

---

## What Gets Fixed vs. What Gets Noted

**Fix in the plan doc:**
- Missing requirements — add the missing task
- Placeholder content — replace with actual code and commands
- Contradictory steps — pick one approach and apply it consistently
- Missing done criteria — add explicit test commands or verification steps
- Type inconsistencies — rename to match across the plan

**Note as advisory (do not block):**
- Suggestions for alternative implementations
- Style preferences
- "Nice to have" additions beyond the spec

---

## Common Fixes

**Missing requirement:**
Add a new task covering the gap. The task must follow the full TDD structure (test → run → implement → verify → commit).

**Vague step:**
Replace "implement the validation" with actual code:
```typescript
if (!email.includes('@')) {
  return { error: 'Invalid email format' }
}
```

**"Similar to Task N":**
Copy the full code from Task N into this task. Engineers may be reading out of order.

**Type inconsistency:**
Pick one name. Do a find-replace across the entire plan before saving.

**Missing commit:**
Add Step N: Commit at the end of every task that modifies files.
