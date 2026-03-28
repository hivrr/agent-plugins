# Blueprint Reference

How to decompose large, multi-PR work into a self-contained construction plan that any agent can execute cold.

---

## When to Classify as Complex

Use blueprint mode when **any** of these are true:

| Signal | Example |
|--------|---------|
| Requires >3 days of work | "Rebuild the auth system" |
| Spans >1 PR to keep them reviewable | "Migrate database, update API, update frontend" |
| Involves multiple independent subsystems | Auth + billing + notifications all affected |
| Cross-team or cross-repo dependencies | Backend service + frontend app + mobile app |
| Needs careful ordering to avoid breaking production | Schema migration before code deploy |
| User explicitly says "this is big" or "this is a major project" | |

Do NOT use blueprint mode for:
- Work completable in a single PR
- Tasks that take <3 days
- The user saying "just do it"

---

## Step Count

- Fewer than 3 steps is a signal to reconsider the Complex classification — it may be Medium
- Maximum: 12 steps (otherwise split into sub-projects)
- Sweet spot: 4-8 steps

If you have >12 steps, the objective should be split into separate planning sessions — one per subsystem.

---

## Step Brief Structure

Each step must be executable by a fresh agent with no prior context. Include everything they need:

```markdown
### Step N: [Name] — branch: `{feat/step-name}`

**Context brief:** [2-4 sentences. What exists, what this step adds, what constraints apply.
Include the relevant file paths, architectural decisions, and any gotchas.
A fresh agent reading only this step should know exactly where to start.]

**Dependencies:** Step {N-1} must be merged before starting this step.

**Tasks:**
- [ ] [Specific action with file path]
- [ ] [Specific action with file path]

**Verification:**

Run: `{exact command}`
Expected: `{expected output or behavior}`

**Exit criteria:** [How you know this step is completely done and safe to merge]

**Rollback:** [What to do if this step needs to be reverted — e.g., "revert migration M_20240301, redeploy previous API version"]

**PR title suggestion:** `{feat/fix/refactor}: {what this PR does}`
```

---

## Dependency Graph Format

Use ASCII arrows. Left-to-right means "must complete before":

```
Step 1 ──> Step 2 ──> Step 5
            └──> Step 3 ──> Step 4 ──┘
                  [PARALLEL with Step 2]
```

**Parallel detection:** Steps are parallel when they have:
- No shared output files
- No shared output dependencies (Step A doesn't produce what Step B needs)
- No shared migration or schema changes

Mark parallel steps with `[PARALLEL]`. Parallel steps can be executed simultaneously by different engineers or agents.

**Summary line format:**
```
Steps: 5 | Serial: Steps 1, 2, 5 | Parallel: Steps 3 and 4 (after Step 2)
```

---

## Anti-Patterns

Catch these before saving the blueprint:

| Anti-pattern | Problem | Fix |
|--------------|---------|-----|
| XL steps | Step takes >1 week; can't be reviewed | Split into 2-3 steps |
| Missing verification | No way to confirm the step succeeded | Add exact run command + expected output |
| Vague exit criteria | "When it works" | Specify: tests pass, endpoint returns 200, migration applied |
| Circular dependencies | Step 3 requires Step 4, Step 4 requires Step 3 | Restructure — extract shared setup into Step 0 |
| Missing rollback | What if deploy fails mid-way? | Define revert strategy per step |
| Context-dependent briefs | "As established in Step 1..." | Each brief is self-contained — repeat the context |
| Merged-in tasks | Step that has 20 sub-tasks | Split into multiple steps |

---

## Sprint Capacity (Optional)

If the user provides team size and sprint length, include a capacity block after the dependency graph:

```markdown
## Sprint Capacity

**Input:** {team_size} engineers, {sprint_days}-day sprint
**Calculation:** {team_size} × {sprint_days} days × 6 hrs/day × 0.7 focus factor = {total} hours available

| Step | Story Points | Hours Est. | Sprint |
|------|-------------|------------|--------|
| Step 1 | 3 (M) | ~8h | Sprint 1 |
| Step 2 | 5 (L) | ~16h | Sprint 1 |
| Step 3 | 3 (M) | ~8h | Sprint 1 (parallel) |
| Step 4 | 2 (S) | ~4h | Sprint 2 |
| Step 5 | 3 (M) | ~8h | Sprint 2 |

Story points: XS=1, S=2, M=3, L=5
```

---

## Plan Mutation Protocol

When a step needs to change mid-execution, use this protocol and log it in the plan file:

```markdown
## Change Log

### [Date] — Split Step 3
**Reason:** Discovered that the migration needs a backfill job that adds ~2 days of work.
**Change:** Split Step 3 into Step 3a (migration) and Step 3b (backfill).
**Impact:** Step 4 now depends on 3b instead of 3.
```

Allowed mutations:
- **Split**: one step → two steps (when a step turns out larger than expected)
- **Insert**: add a new step (when a dependency was missed)
- **Skip**: mark a step as N/A with reason (when the need disappeared)
- **Reorder**: change dependency edges (when the correct order becomes clear)
- **Abandon**: mark the blueprint done early (when the remaining steps become unnecessary)

---

## git/gh Degraded Mode

If `gh` is not available, generate direct-mode plans:

- No branch/PR per step — use direct commits to the feature branch instead
- Replace "PR title suggestion" with "Commit message"
- Replace "Exit criteria: merged PR" with "Exit criteria: all commits pushed to {branch}"

Check availability: `gh auth status 2>/dev/null && echo "GH_AVAILABLE" || echo "GH_NOT_AVAILABLE"`
