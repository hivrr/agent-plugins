// @bun
// src/plugin/hv-plugin.ts
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

// src/command/work-issue.md
var work_issue_default = `---
description: Work an issue end-to-end \u2014 fetch, implement, test, commit, PR
---

# /work-issue $ARGUMENTS

Load the \`work-issue\` skill and drive the full issue implementation workflow.

**Arguments:** $ARGUMENTS

Supported formats:
- \`123\` \u2014 single GitHub issue
- \`123, 456\` \u2014 multiple issues
- \`123-126\` \u2014 range of issues
- \`https://github.com/owner/repo/issues/123\` \u2014 GitHub URL
- \`PROJ-123\` \u2014 Linear identifier
- Any of the above followed by \`: some context\` for inline hints
- Append \`--auto\` to skip the user approval checkpoint before committing

Examples:
\`\`\`
/work-issue 123
/work-issue 123 --auto
/work-issue 123, 456 : fix the login flow
/work-issue PROJ-123
\`\`\`
`;

// src/command/work-pr.md
var work_pr_default = `---
description: Address PR feedback end-to-end \u2014 fetch, implement, test, push
---

# /work-pr $ARGUMENTS

Load the \`work-pr\` skill and drive the full PR feedback resolution workflow.

**Arguments:** $ARGUMENTS

Supported formats:
- \`456\` \u2014 PR number
- \`https://github.com/owner/repo/pull/456\` \u2014 GitHub PR URL
- Either of the above followed by \`: some context\` for inline hints
- Append \`--auto\` to skip the user approval checkpoint before committing

Examples:
\`\`\`
/work-pr 456
/work-pr 456 --auto
/work-pr 456 : focus on the test coverage comments
/work-pr https://github.com/owner/repo/pull/456
\`\`\`
`;

// src/command/merge-pr.md
var merge_pr_default = `---
description: Merge a GitHub PR, close linked issues, clean up branches
---

# /merge-pr $ARGUMENTS

Load the \`merge-pr\` skill and drive the full merge, cleanup, and follow-up capture workflow.

**Arguments:** $ARGUMENTS

Supported formats:
- \`99\` \u2014 PR number
- \`https://github.com/owner/repo/pull/99\` \u2014 GitHub PR URL
- Append \`--auto\` to skip the confirmation checkpoint and auto-create follow-up issues

Examples:
\`\`\`
/merge-pr 99
/merge-pr 99 --auto
/merge-pr https://github.com/owner/repo/pull/99
\`\`\`
`;

// src/command/audit.md
var audit_default = `---
description: Scan the codebase for issues across security, accessibility, tech-debt, and performance
---

# /audit $ARGUMENTS

Load the \`audit\` skill and run a codebase audit.

**Arguments:** $ARGUMENTS

Supported formats:
- *(no arguments)* \u2014 quick scan across all domains
- \`security\` \u2014 security vulnerabilities only
- \`accessibility\` \u2014 WCAG accessibility issues only
- \`tech-debt\` \u2014 code quality and maintainability only
- \`performance\` \u2014 performance bottlenecks only
- \`all\` \u2014 same as no arguments
- Append \`--mode deep\` for a comprehensive scan (default is quick)

Examples:
\`\`\`
/audit
/audit security
/audit security --mode deep
/audit all --mode deep
\`\`\`
`;

// src/command/debug.md
var debug_default = `---
description: Diagnose a bug or problem \u2014 produces a root cause analysis report without making changes
---

# /debug $ARGUMENTS

Load the \`debug\` skill and run a diagnostic investigation.

**Arguments:** $ARGUMENTS

Supported formats:
- \`456\` \u2014 GitHub issue number
- \`https://github.com/owner/repo/issues/456\` \u2014 GitHub issue URL
- \`"tests failing intermittently in CI"\` \u2014 quoted problem description
- Any of the above followed by \`: some context\` for inline hints

This command investigates and reports \u2014 it does not implement fixes.

Examples:
\`\`\`
/debug 456
/debug 456 : focus on the auth timeout errors
/debug "login endpoint returns 500 in production but not locally"
\`\`\`
`;

// src/command/memory.md
var memory_default = `---
description: View, search, and manage project memory stored in .ai/memory/
---

Load the \`memory\` skill, then perform the operation indicated by the user's input.

Route as follows:

- No input or \`show\` \u2192 display the full MANIFEST and entry counts
- \`search {query}\` \u2192 find and display entries matching the query
- \`add\` \u2192 interactively add a decision, pattern, or context entry
- \`add decision {text}\` \u2192 write a decision entry directly
- \`add pattern {text}\` \u2192 write a pattern entry directly
- \`add context {text}\` \u2192 write a context entry directly
- \`rebuild\` \u2192 regenerate MANIFEST.md from all files in .ai/memory/

The memory skill has full instructions for each operation.
`;

// src/skill/core/SKILL.md
var SKILL_default = `---
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

- Feature branches: \`feat/description\` or \`issue/{number}\`
- Conventional commits: \`feat:\`, \`fix:\`, \`refactor:\`, \`docs:\`, \`test:\`
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
`;

// src/skill/work-issue/SKILL.md
var SKILL_default2 = `---
name: work-issue
description: Full workflow for implementing a GitHub or Linear issue end-to-end
license: MIT
compatibility: opencode
---

# Work Issue Workflow

You are a workflow driver. Your job is to take an issue from input to merged PR without stopping unless you genuinely need the user's input. Work with momentum \u2014 keep moving through the phases, communicate progress clearly, and only pause at marked checkpoints.

Before starting: read this entire skill, then create a focused todo list, then execute.

---

## Phase 1 \u2014 Load Core Philosophy and Memory

Load the \`core\` skill to internalize project values: quality gates, git safety, and task completion standards. These principles govern every decision you make throughout this workflow.

Load memory: if \`.ai/memory/MANIFEST.md\` exists, read it. Based on the current context \u2014 issue keywords, labels, affected areas \u2014 pick the 3\u20137 most relevant entries and read those files. Hold this as \`loaded_memory\`. If no MANIFEST exists, skip silently \u2014 memory will be created when this workflow completes.

---

## Phase 2 \u2014 Parse the Input

The input will be one of these forms:
- A single issue number: \`123\`
- Multiple numbers or a range: \`123, 456\` or \`123-126\`
- A GitHub URL
- A Linear identifier: \`PROJ-123\`
- Any of the above followed by \`: some context\` for inline hints
- An optional \`--auto\` flag to skip the user approval checkpoint

Extract:
- \`issue_numbers\` \u2014 the list of issue numbers/identifiers to work on
- \`inline_context\` \u2014 any text after \`:\` in the input
- \`auto_mode\` \u2014 true if \`--auto\` is present

**Check for an interrupted session:** for the first issue number, look for \`.ai/session/work-issue-{number}.md\`. If it exists, load it as \`resume_context\` and set \`resume_mode = true\`. The session file contains the branch, plan, and progress from a previous run that was interrupted (crash, context limit, or manual stop). You will use it in later phases to skip completed work and resume from the exact stopping point.

Display: \`Input: {issue_numbers} | auto: {auto_mode}\` \u2014 append \`| RESUMING\` if \`resume_mode = true\`

---

## Phase 3 \u2014 Route Multiple Issues

**Skip this phase if there is only one issue.**

For multiple issues, decide how to execute them before doing anything else.

**Group by relationship:** Scan each issue's title and body for mentioned file paths and labels. Issues that share mentioned files, share labels, or reference the same origin PR belong in the same group and will share a branch. Issues with no relationship to the others form their own single-issue group.

**Order within each group:** Sort the issues in this sequence:
1. Structural or rename changes first
2. Type definitions
3. New features
4. Bug fixes
5. Documentation last

**Choose a strategy:**
- **Unified** \u2014 one shared wave branch per group: use when all issues in a group are simple or medium complexity and the group has 5 or fewer issues. The \`wave\` skill handles execution.
- **Sequential** \u2014 a separate \`issue/{N}\` branch per issue, processed one at a time: use when any issue is complex, groups are completely unrelated, or the provider is Linear (Linear does not support wave branching).

Store: \`wave_strategy\` ("unified" or "sequential"), \`wave_groups\` (the ordered groups of issue numbers).

Display: \`Route: {count} issues | strategy: {wave_strategy} | groups: {group_count}\`

---

## Phase 4 \u2014 Get Repo and Issue Context

Do these together:

**Repo info:** Run \`git remote get-url origin\` and parse the owner and repo name. Check the current branch with \`git branch --show-current\`. Store \`repo_owner\`, \`repo_name\`, \`current_branch\`.

**Issue details:** Fetch each issue using the GitHub MCP tool (or Linear MCP if the provider is Linear). Get the title, body, labels, and any linked issues. If fetching fails, continue with whatever you have \u2014 don't stop.

Store everything you learn about the issues as \`issue_data\`.

Display: \`Fetched: {count} issue(s) from {repo_owner}/{repo_name}\`

---

## Phase 5 \u2014 Assess Complexity

Look at what you know about the issue(s) and classify:

- **Simple**: small scope, clear requirements, likely a single file or doc change, labels like \`docs\`, \`chore\`, \`typo\`, body under 500 characters, no linked issues
- **Medium**: clear requirements, a few files, well-understood problem
- **Complex**: unclear requirements, many files, architectural decisions needed, multiple linked issues

For multiple issues, assess each one and use the highest classification to drive planning decisions.

If \`--auto\` is set and you're unsure, default to \`medium\` and continue.
If \`--auto\` is not set and you're genuinely unsure, ask the user one focused question.

Display: \`Complexity: {simple|medium|complex}\`

---

## Phase 6 \u2014 Create a Working Branch

Check if the working tree is clean with \`git status --porcelain\`. If there are uncommitted changes, warn the user but continue.

**Single issue or sequential strategy:**
Create and switch to \`issue/{number}\`. If the branch already exists, switch to it instead.

**Unified wave strategy:**
Skip this phase \u2014 the \`wave\` skill creates and manages its own branch in Phase 8.

Display: \`Branch: {branch_name}\` (or \`Branch: wave skill will create\` for unified)

---

## Phase 7 \u2014 Plan (medium and complex only)

For **simple** tasks: skip this phase, go straight to implementing.

For **medium and complex** tasks: before touching any code, write out your implementation plan. Include:
- What you're going to change and why
- The approach you'll take
- Any risks or tradeoffs worth noting
- How you'll verify it works

For **complex** tasks: look at the existing architecture before committing to an approach. Follow existing patterns \u2014 one consistent pattern well-applied beats a new pattern.

**If \`resume_mode = true\`:** the plan already exists in \`resume_context\`. Load it, review what's already checked \`[x]\`, and skip this planning step \u2014 go straight to Phase 8 using the existing plan.

**Write the session checkpoint:** once the plan is ready, write \`.ai/session/work-issue-{issue_number}.md\` using the format defined in the memory skill. This file is your crash-recovery checkpoint \u2014 the plugin's compaction hook will inject it automatically if the context compacts mid-run. Update individual \`[ ]\` \u2192 \`[x]\` checkboxes in this file as each plan item is completed during Phase 8.

Display: \`Plan: ready\`

---

## Phase 8 \u2014 Implement

**Unified wave strategy (multiple related issues):**
Load the \`wave\` skill. Pass it the ordered issue list, the fetched issue data, and \`auto_mode\`. The wave skill creates the shared branch, implements each issue in sequence, handles resume if the branch already exists, and returns a per-issue summary. When it returns, continue to Phase 9 with the combined results.

**Single issue or sequential strategy:**
Write the code directly. Follow these principles:
- Follow existing patterns in the codebase \u2014 explore before writing
- Make the smallest change that satisfies the requirements
- Handle errors explicitly \u2014 don't let things fail silently
- If you're unsure about an architectural decision, ask rather than assume
- Write or update tests alongside the code, not after

For sequential multi-issue, process each issue fully through Phase 12 (Create PR) before starting the next one.

When done, display: \`Implement: complete | files changed: {count}\`

---

## Phase 9 \u2014 Verify

**Run tests** (skip if only docs/config changed):
- Look for test runners: check \`package.json\` scripts, \`Makefile\`, \`pyproject.toml\`, \`pytest.ini\`, \`jest.config.*\`
- Run whatever you find. If nothing is found, say so and move on.
- If tests fail, fix the failures now. You get 3 attempts per failure before marking it unresolved.

**Run lint and type checks** (skip if only docs changed):
- Look for linting config: \`eslint\`, \`ruff\`, \`flake8\`, \`.eslintrc.*\`, \`pyproject.toml [tool.ruff]\`
- Run whatever you find. Fix any errors.

**Review your own changes:**
- Do the changes actually satisfy the acceptance criteria from the issue(s)?
- Is there anything obviously wrong, missing, or broken?
- Fix what you find.

Display: \`Verify: tests {pass|fail|skipped} | lint {pass|fail|skipped}\`

---

## Phase 10 \u2014 Review Checkpoint

**Skip this phase if \`--auto\` is set.**

Show the user a summary:
- Files changed (list them)
- Test results
- Lint results
- Any unresolved issues

Ask: "Ready to commit and create a PR?" with options:
- Commit and create PR
- Show full diff (\`git diff --stat\`)
- Abort (leave changes on branch for manual review)

Wait for their response before continuing.

---

## Phase 11 \u2014 Commit

Save memory: review what was built. If any architectural decisions were made, new patterns established, or non-obvious context discovered, write them to \`.ai/memory/\` using the memory skill conventions and update \`MANIFEST.md\`. If nothing significant was discovered, skip.

Stage all changes: \`git add -A\` \u2014 this picks up any memory files written above.

Write a conventional commit message:
- Format: \`{type}({scope}): {description}\`
- Types: \`feat\`, \`fix\`, \`refactor\`, \`docs\`, \`test\`, \`chore\`
- Include issue references in the body: \`Closes #{number}\` for each issue (GitHub) or the Linear identifier

Commit with: \`git commit -m "{message}"\`

Display: \`Commit: {message}\`

---

## Phase 12 \u2014 Create PR

Push the branch: \`git push -u origin {branch_name}\`

Create the PR using \`gh pr create\` with:
- Title: the issue title for a single issue, or a clear group summary for wave
- Body: what was done, why, how to test it, and a \`Closes #N\` line for every issue in the group
- Link it to all relevant issues

Display: \`PR: {url}\`

---

## Phase 13 \u2014 Done

Delete \`.ai/session/work-issue-{issue_number}.md\` \u2014 the workflow completed successfully, the checkpoint is no longer needed.

Display:
\`\`\`
WORKFLOW COMPLETE
PR: {url}
Branch: {branch_name}
Issues: {issue_numbers}
\`\`\`

Return control to the user.

---

## Error Handling

If any phase fails:
- Leave the branch intact so the user can inspect it manually
- Display what went wrong clearly
- Don't silently swallow errors
- Don't retry indefinitely \u2014 3 attempts max on any single fix
`;

// src/skill/work-pr/SKILL.md
var SKILL_default3 = `---
name: work-pr
description: Address PR feedback end-to-end \u2014 fetch, implement fixes, test, push
license: MIT
compatibility: opencode
---

# Work PR Workflow

You are a workflow driver. Your job is to take a pull request from open feedback to pushed resolution without stopping unless you genuinely need the user's input. Work with momentum \u2014 keep moving through the phases, communicate progress clearly, and only pause at marked checkpoints.

This workflow is GitHub-only. For Linear issues, use the \`work-issue\` skill instead.

Before starting: read this entire skill, then create a focused todo list, then execute.

---

## Phase 1 \u2014 Load Core Philosophy and Memory

Load the \`core\` skill to internalize project values: quality gates, git safety, and task completion standards. These principles govern every decision you make throughout this workflow.

Load memory: if \`.ai/memory/MANIFEST.md\` exists, read it. Based on the PR's focus area and feedback topics, pick the 3\u20137 most relevant entries and read those files. Hold this as \`loaded_memory\`. If no MANIFEST exists, skip silently.

---

## Phase 2 \u2014 Parse the Input

The input will be one of these forms:
- A PR number: \`456\`
- A GitHub PR URL: \`https://github.com/owner/repo/pull/456\`
- Either of the above followed by \`: some context\` for inline hints
- An optional \`--auto\` flag to skip the user approval checkpoint

Extract:
- \`pr_number\` \u2014 the PR number to work on
- \`inline_context\` \u2014 any text after \`:\` in the input
- \`auto_mode\` \u2014 true if \`--auto\` is present

Display: \`Input: PR #{pr_number} | auto: {auto_mode}\`

---

## Phase 3 \u2014 Get Repo and PR Context

**Check for an interrupted session first:** look for \`.ai/session/work-pr-{pr_number}.md\`. If it exists, load it as \`resume_context\` and set \`resume_mode = true\`. The session file contains the branch, feedback checklist, and progress from a previous run. You will use it to skip completed feedback items and resume from the stopping point.

Do these together:

**Repo info:** Run \`git remote get-url origin\` and parse the owner and repo name. Store \`repo_owner\`, \`repo_name\`.

**PR details:** Fetch the PR using \`gh pr view {pr_number} --json title,body,headRefName,state,reviews,comments\`. Get the title, body, branch name (\`headRefName\`), current state, and any reviews or comments. If the PR is already merged or closed, warn the user and stop.

**PR feedback:** Fetch issue-style comments (the main conversation thread) using \`gh api repos/{repo_owner}/{repo_name}/issues/{pr_number}/comments\`. This is the correct endpoint for comments posted in the PR conversation \u2014 not \`pulls/{pr_number}/comments\`, which only returns inline diff comments and will miss most feedback.

Get the timestamp of the latest commit on the branch: \`gh pr view {pr_number} --json commits --jq '.commits[-1].committedDate'\`. Only consider comments whose \`created_at\` is after that timestamp \u2014 these are the comments posted since the last push.

Separate the filtered comments into:
- \`blocking_feedback\` \u2014 comments containing "must fix", "please change", "needs to be", "blocking", or any explicit change request
- \`recommended_feedback\` \u2014 suggestions, nits, optional improvements, questions

Also fetch formal review decisions: \`gh api repos/{repo_owner}/{repo_name}/pulls/{pr_number}/reviews\` to capture any "CHANGES_REQUESTED" reviews.

**CI status:** Check \`gh pr checks {pr_number}\` for any failing checks. Note them for the implement phase.

Store: \`pr_title\`, \`branch_name\` (from headRefName), \`blocking_feedback\`, \`recommended_feedback\`, \`ci_failures\`.

Display: \`Fetched: PR #{pr_number} "{pr_title}" | blocking: {count} | recommended: {count} | CI: {pass|fail}\`

---

## Phase 4 \u2014 Assess Complexity

Look at the volume and nature of feedback and classify the work:

- **Simple**: a few small comments, clear fixes, single-file scope, docs or typo changes
- **Medium**: several pieces of feedback, a few files, clear what to do
- **Complex**: many comments, architectural feedback, unclear how to address, ripple effects across multiple files

If \`--auto\` is set and you're unsure, default to \`medium\` and continue.
If \`--auto\` is not set and you're genuinely unsure, ask the user one focused question.

Display: \`Complexity: {simple|medium|complex}\`

---

## Phase 5 \u2014 Checkout PR Branch

Check if the working tree is clean with \`git status --porcelain\`. If there are uncommitted changes on the current branch, warn the user.

Switch to the PR branch: \`git checkout {branch_name}\` (or \`git switch {branch_name}\`). Pull the latest: \`git pull origin {branch_name}\`.

Display: \`Branch: {branch_name}\`

---

## Phase 6 \u2014 Plan (medium and complex only)

For **simple** tasks: skip this phase, go straight to implementing.

For **medium and complex** tasks: before touching any code, write out your plan for addressing the feedback. Include:
- Which blocking feedback items you'll address and how
- Which recommended feedback you'll incorporate and why
- How you'll handle any CI failures
- Any risks or tradeoffs

For **complex** tasks: look at the existing code context before committing to an approach. Follow existing patterns.

**If \`resume_mode = true\`:** the feedback plan already exists in \`resume_context\`. Load it, review which items are already checked \`[x]\`, and skip to Phase 7 addressing only the remaining \`[ ]\` items.

**Write the session checkpoint:** once the plan is ready, write \`.ai/session/work-pr-{pr_number}.md\` using the format defined in the memory skill. Update individual \`[ ]\` \u2192 \`[x]\` checkboxes in this file as each feedback item is addressed during Phase 7.

Display: \`Plan: ready\`

---

## Phase 7 \u2014 Implement

Address the feedback in priority order:

1. **CI failures first** \u2014 fix any failing checks before tackling review feedback, since CI failures often reveal the root cause of reviewer concerns
2. **Blocking feedback** \u2014 address every change request and required change. Don't skip any.
3. **Recommended feedback** \u2014 incorporate where it makes the code better without introducing risk. Skip if it would break tests or add significant complexity.

Implementation principles:
- Follow existing patterns in the codebase
- Make targeted changes \u2014 don't refactor beyond the scope of the feedback
- If a reviewer's intent is unclear, implement the most reasonable interpretation and note it in your summary
- Fix tests alongside code, not after

When done, display: \`Implement: complete | feedback addressed: {blocking_count} blocking, {recommended_count} recommended\`

---

## Phase 8 \u2014 Verify

**Run tests** (skip if only docs/config changed):
- Look for test runners: check \`package.json\` scripts, \`Makefile\`, \`pyproject.toml\`, \`pytest.ini\`, \`jest.config.*\`
- Run whatever you find. Fix failures \u2014 3 attempts max per failure.

**Run lint and type checks** (skip if only docs changed):
- Look for linting config: \`eslint\`, \`ruff\`, \`flake8\`, \`.eslintrc.*\`, \`pyproject.toml [tool.ruff]\`
- Fix any errors.

**Review your own changes:**
- Does each piece of blocking feedback have a clear resolution?
- Did you introduce any new issues?
- Fix what you find.

Display: \`Verify: tests {pass|fail|skipped} | lint {pass|fail|skipped}\`

---

## Phase 9 \u2014 Review Checkpoint

**Skip this phase if \`--auto\` is set.**

Show the user a summary:
- Files changed (list them)
- Blocking feedback addressed (list each item)
- Recommended feedback incorporated (list each item)
- Test results
- Lint results

Ask: "Ready to commit and push?" with options:
- Commit and push
- Show full diff (\`git diff --stat\`)
- Abort (leave changes on branch for manual review)

Wait for their response before continuing.

---

## Phase 10 \u2014 Commit

Save memory: review what was changed. If addressing this feedback revealed a decision, established a pattern, or surfaced context worth preserving, write it to \`.ai/memory/\` using the memory skill conventions and update \`MANIFEST.md\`. If nothing significant emerged, skip.

Stage all changes: \`git add -A\` \u2014 this picks up any memory files written above.

Write a conventional commit message:
- Format: \`{type}({scope}): {description}\`
- Types: \`fix\`, \`refactor\`, \`test\`, \`docs\`, \`chore\`
- Body: briefly list what feedback was addressed

Commit with: \`git commit -m "{message}"\`

Display: \`Commit: {message}\`

---

## Phase 11 \u2014 Post PR Comment

Post a summary comment on the PR using \`gh pr comment {pr_number} --body "{message}"\`.

The comment should cover:
- What feedback was addressed
- What changes were made
- Test status
- Anything that was intentionally not addressed and why

Display: \`Comment: posted\`

If posting fails, log a warning and continue \u2014 don't let a comment failure block the push.

---

## Phase 12 \u2014 Push

Push the branch: \`git push origin {branch_name}\`

Display: \`Push: {branch_name} \u2192 origin\`

---

## Phase 13 \u2014 Done

Delete \`.ai/session/work-pr-{pr_number}.md\` \u2014 the workflow completed successfully, the checkpoint is no longer needed.

Display:
\`\`\`
WORKFLOW COMPLETE
PR: #{pr_number} updated
Branch: {branch_name}
Feedback addressed: {blocking_count} blocking, {recommended_count} recommended
\`\`\`

Return control to the user.

---

## Error Handling

- If the PR is already merged or closed: warn and stop immediately
- If a feedback item cannot be resolved after 3 attempts: mark it unresolved, note it in the PR comment, and continue
- If tests fail after fixing: revert the last change and note it as unresolved
- Leave the branch intact on any failure so the user can inspect manually
`;

// src/skill/merge-pr/SKILL.md
var SKILL_default4 = `---
name: merge-pr
description: Merge a GitHub PR, close linked issues, clean up branches, capture follow-up work
license: MIT
compatibility: opencode
---

# Merge PR Workflow

You are a workflow driver. Your job is to take an approved PR through merge, cleanup, and follow-up capture cleanly and completely. Work with momentum \u2014 keep moving through the phases and only pause at the marked confirmation checkpoint.

Before starting: read this entire skill, then create a focused todo list, then execute.

---

## Phase 1 \u2014 Load Core Philosophy and Memory

Load the \`core\` skill to internalize project values: quality gates, git safety, and task completion standards. These principles govern every decision you make throughout this workflow.

Load memory: if \`.ai/memory/MANIFEST.md\` exists, read it. Pick any entries relevant to this PR's domain and read those files. Hold this as \`loaded_memory\`. If no MANIFEST exists, skip silently.

---

## Phase 2 \u2014 Parse the Input

The input will be one of these forms:
- A PR number: \`99\`
- A GitHub PR URL: \`https://github.com/owner/repo/pull/99\`
- Either of the above with an optional \`--auto\` flag

Extract:
- \`pr_number\` \u2014 the PR number to merge
- \`auto_mode\` \u2014 true if \`--auto\` is present

Display: \`Input: PR #{pr_number} | auto: {auto_mode}\`

---

## Phase 3 \u2014 Get Repo and PR Details

**Repo info:** Run \`git remote get-url origin\` and parse the owner and repo name. Store \`repo_owner\`, \`repo_name\`.

**PR details:** Run \`gh pr view {pr_number} --json title,body,headRefName,state,reviews\`. Get the title, body, branch name, current state, and review status.

- If the PR is already merged: display "PR #{pr_number} is already merged" and jump to Phase 7 (cleanup).
- If the PR is closed but not merged: warn and stop.
- If the PR is still open with changes requested: warn the user that feedback is unaddressed, but let them decide whether to continue.

Store: \`pr_title\`, \`branch_name\` (from headRefName), \`pr_body\`.

Display: \`PR #{pr_number}: "{pr_title}" | state: {state}\`

---

## Phase 4 \u2014 Extract Linked Issues

Parse the PR body to find issues that will be closed by this merge. Look for these patterns (case-insensitive):
- \`Closes #123\`, \`Fixes #123\`, \`Resolves #123\`
- \`Close #123\`, \`Fix #123\`, \`Resolve #123\`

Deduplicate any repeated issue numbers. Skip malformed references (e.g. \`#\` not followed by digits).

Store: \`linked_issues\` \u2014 an array of issue numbers (may be empty).

Display: \`Linked issues: {linked_issues.join(', ') || 'none'}\`

---

## Phase 5 \u2014 Verify CI

Run \`gh pr checks {pr_number}\` to get the CI status.

- If all checks pass: continue.
- If any checks are failing: display which checks failed and stop. Don't merge a PR with failing CI. The user needs to fix the failures first (use \`/work-pr\` to address them).
- If there are no checks: note it but continue \u2014 not all repos have CI.

Display: \`CI: {all passed | {N} failing \u2014 cannot merge}\`

---

## Phase 6 \u2014 Confirm (unless --auto)

**Skip this phase if \`--auto\` is set.**

Display a merge summary:
- PR title and number
- CI status
- Merge method: squash
- Linked issues that will be closed: \`{linked_issues.join(', ') || 'none'}\`
- Branch that will be deleted: \`{branch_name}\` (local and remote)

Ask: "Ready to merge?" with options:
- Merge and clean up
- View PR diff (\`gh pr diff {pr_number}\`)
- Abort (leave PR open)

Wait for their response before continuing.

---

## Phase 7 \u2014 Merge

Merge the PR with squash: \`gh pr merge {pr_number} --squash --delete-branch\`

The \`--delete-branch\` flag handles the remote branch deletion. If it fails, note it and handle it manually in Phase 9.

Display: \`Merged: PR #{pr_number} \u2192 main (squash)\`

---

## Phase 8 \u2014 Close Linked Issues

If \`linked_issues\` is empty, display "Linked issues: none" and skip to Phase 9.

GitHub's auto-close (triggered by "Closes #N" in the PR body) usually fires on merge, but it's eventually consistent. Wait a few seconds, then check each linked issue:

For each issue in \`linked_issues\`:
1. Run \`gh issue view {number} --repo {repo_owner}/{repo_name} --json state\`
2. If it's already closed: display \`Issue #{number}: already closed\`
3. If it's still open: close it manually with \`gh issue close {number} --repo {repo_owner}/{repo_name}\` and display \`Issue #{number}: closed\`
4. If the command fails: warn and continue \u2014 don't let one failure block the others

Display: \`Linked issues: {count} verified, {closed_count} manually closed\`

---

## Phase 9 \u2014 Switch to Main and Pull

Checkout main: \`git checkout main\` (or \`master\` if that's the default branch).

Pull the latest: \`git pull origin main\`

Display: \`Main: updated\`

---

## Phase 10 \u2014 Clean Up Branches

**Delete local branch:** \`git branch -d {branch_name}\`

If it fails with "not fully merged", use \`git branch -D {branch_name}\` \u2014 the branch was already merged into main via the PR, so this is safe.

**Delete remote branch** (if \`--delete-branch\` in Phase 7 didn't handle it):
Check if remote branch still exists: \`git ls-remote --heads origin {branch_name}\`
If it exists: \`git push origin --delete {branch_name}\`

**Prune stale remote-tracking refs:** \`git remote prune origin\`

Display: \`Cleanup: local branch deleted | remote branch deleted | refs pruned\`

---

## Phase 11 \u2014 Capture Follow-up Work

After merge, collect any unaddressed PR feedback that should become future issues. This prevents good suggestions from being lost.

Fetch issue-style comments (the main conversation thread) using \`gh api repos/{repo_owner}/{repo_name}/issues/{pr_number}/comments\`. This is the correct endpoint \u2014 \`pulls/{pr_number}/comments\` only returns inline diff comments and will miss most feedback.

Get the timestamp of the latest commit on the branch before merge: \`gh pr view {pr_number} --json commits --jq '.commits[-1].committedDate'\`. Only consider comments whose \`created_at\` is after that timestamp \u2014 these are the most recent round of feedback posted since the last push.

Look for:
- Suggestions that were acknowledged but deferred ("will do in a follow-up")
- Ideas that weren't addressed in the PR
- TODO or FIXME comments added during the review
- Any feedback that doesn't have a clear resolution in the thread

**If \`--auto\` is set:** Create a GitHub issue for every unaddressed suggestion automatically. Label critical ones \`priority:high\` and optional ones \`priority:medium\`. The philosophy: capture everything now, triage during implementation.

**If \`--auto\` is not set:** List the unaddressed suggestions and ask which ones to create issues for.

**If there is no unaddressed feedback:** display "Follow-up: nothing to capture" and skip issue creation.

For each issue created:
- Title: a clear, actionable summary of the suggestion
- Body: context from the PR comment, link back to the PR
- Run \`gh issue create --repo {repo_owner}/{repo_name} --title "..." --body "..."\` to create it

Display: \`Follow-up: {count} issues created {issue_numbers.join(', ') || ''}\`

---

## Phase 12 \u2014 Done

Display:
\`\`\`
WORKFLOW COMPLETE
Merged: PR #{pr_number}
Issues closed: {linked_issues.join(', ') || 'none'}
Branch deleted: {branch_name}
Follow-up issues: {created_numbers.join(', ') || 'none'}
\`\`\`

Return control to the user.

---

## Error Handling

- If CI is failing: stop at Phase 5, do not merge
- If the PR is already merged: skip to Phase 9 (cleanup still needed)
- If a linked issue close fails: warn and continue \u2014 don't block the workflow
- If branch deletion fails: warn and continue \u2014 stale branches are a minor annoyance, not a blocker
- If follow-up issue creation fails: warn and list the suggestions so the user can create them manually
`;

// src/skill/audit/SKILL.md
var SKILL_default5 = `---
name: audit
description: Run code audits across domains \u2014 security, accessibility, tech-debt, performance
license: MIT
compatibility: opencode
---

# Audit Workflow

You are an audit orchestrator. Your job is to scan the codebase across one or more domains, collect findings, present a prioritized report, and optionally create GitHub issues for the findings.

Before starting: read this entire skill, then create a focused todo list, then execute.

---

## Phase 1 \u2014 Load Core Philosophy and Memory

Load the \`core\` skill to internalize project values. These principles guide how you assess severity and prioritize findings.

Load memory: if \`.ai/memory/MANIFEST.md\` exists, read it. Pick any entries relevant to the domain(s) being audited \u2014 prior decisions about security posture, known architectural patterns, past audit findings. Read those files. Hold this as \`loaded_memory\`. If no MANIFEST exists, skip silently.

---

## Phase 2 \u2014 Parse the Input

The input will be one of these forms:
- No arguments \u2192 audit all domains in quick mode
- A domain name: \`security\`, \`accessibility\`, \`tech-debt\`, or \`performance\`
- \`all\` \u2192 same as no arguments
- \`--mode deep\` \u2192 run a comprehensive scan instead of a targeted one
- A domain and a mode: \`security --mode deep\`

Extract:
- \`domains\` \u2014 list of domains to audit (default: all four)
- \`mode\` \u2014 \`quick\` (default) or \`deep\`

Display: \`Audit: {domains.join(', ')} | mode: {mode}\`

---

## Phase 3 \u2014 Explore the Codebase

Before scanning, get oriented:
- Run \`git remote get-url origin\` to get repo owner and name
- List the top-level directory structure to understand the project layout
- Note the primary language(s), framework(s), and any obvious architectural patterns
- Note file counts in key directories \u2014 this tells you which domain skills are most relevant

If the project has no frontend files at all (no \`.jsx\`, \`.tsx\`, \`.html\`, \`.vue\`, \`.svelte\`), remove \`accessibility\` from the domain list and note it.

Display: \`Codebase: {language/framework} | {file_count} source files\`

---

## Phase 4 \u2014 Run Domain Scans

For each domain in your list, load the corresponding skill and run the scan:

- \`security\` \u2192 load \`audit-security\` skill
- \`accessibility\` \u2192 load \`audit-accessibility\` skill
- \`tech-debt\` \u2192 load \`audit-tech-debt\` skill
- \`performance\` \u2192 load \`audit-performance\` skill

Pass the mode (\`quick\` or \`deep\`) and your understanding of the codebase structure to each scan.

If you are scanning multiple domains, run them all \u2014 the findings from each are independent and can proceed without waiting for each other.

If a domain scan fails or produces an error, note it and continue with the others. A partial audit is better than no audit.

---

## Phase 5 \u2014 Aggregate and Prioritize

Collect all findings from all domain scans. Then:

1. **Deduplicate**: if two domain scans flagged the same file/line for overlapping reasons, merge them into one finding with combined context
2. **Sort by severity**: critical \u2192 high \u2192 medium \u2192 low
3. **Count totals**: findings by domain and by severity

Display a summary table:

\`\`\`
Domain          | Critical | High | Medium | Low | Total
security        |    2     |  3   |   1    |  1  |   7
accessibility   |    0     |  2   |   4    |  3  |   9
tech-debt       |    1     |  4   |   6    |  2  |  13
performance     |    0     |  1   |   2    |  1  |   4
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
Total           |    3     | 10   |  13    |  7  |  33
\`\`\`

---

## Phase 6 \u2014 Present Findings

Display all findings grouped by severity (critical first), then by domain. For each finding show:
- File and line
- Title
- Domain and severity
- What's wrong and how to fix it

If there are no findings at all: display a clean bill of health and stop.

---

## Phase 7 \u2014 Offer GitHub Issue Creation

Ask the user what they'd like to do with the findings:
- **Create GitHub issues now** \u2014 create one issue per finding
- **Show me the list first** \u2014 display all findings in detail, then ask again
- **Skip issue creation** \u2014 stop here, findings are displayed above

If the user skips: display the findings summary and stop.

---

## Phase 8 \u2014 Create GitHub Issues

For each finding, create a GitHub issue using \`gh issue create\`:

**Title**: the finding title

**Body**:
\`\`\`
## Finding

**File:** \`{file}:{line}\`
**Domain:** {domain}
**Severity:** {severity}
**Effort:** {effort}

## What's Wrong

{description}

## How to Fix

{recommendation}

## Acceptance Criteria

- [ ] Issue is resolved
- [ ] Tests verify the fix (where applicable)
- [ ] No regression introduced

---
*Generated by audit*
\`\`\`

**Labels** (create them if they don't exist):
- Always: \`audit\`, \`audit:{domain}\`
- Severity mapping: \`critical\` \u2192 \`priority:p0\`, \`high\` \u2192 \`priority:p1\`, \`medium\` \u2192 \`priority:p2\`, \`low\` \u2192 \`priority:p3\`
- Effort: \`effort:trivial\` (also add \`good-first-issue\`), \`effort:small\`, \`effort:medium\`, \`effort:large\`

Create issues one at a time. If one fails, log the error and continue \u2014 don't stop the whole batch.

After each successful creation, note the issue number so you can display the full list at the end.

---

## Phase 9 \u2014 Save Memory and Done

Save memory: if the audit revealed patterns about the codebase worth preserving (recurring issues, architectural context, security posture), write a context entry to \`.ai/memory/\` using the memory skill conventions and update \`MANIFEST.md\`. Then commit those files: \`git add .ai/memory/ && git commit -m "chore: record audit findings in memory"\`. If nothing significant emerged, skip.

Display:
\`\`\`
AUDIT COMPLETE
Domains scanned: {domains}
Total findings: {count} ({critical} critical, {high} high, {medium} medium, {low} low)
GitHub issues created: {issue_numbers.join(', ') || 'none'}
\`\`\`

Suggest: "Use \`/work-issue {first_issue_number}\` to start fixing."

---

## Error Handling

- If a domain skill fails: note it, continue with other domains
- If GitHub issue creation fails mid-batch: note which ones succeeded, which failed \u2014 partial progress is fine
- If the repo has no source files: say so and stop
`;

// src/skill/audit-security/SKILL.md
var SKILL_default6 = `---
name: audit-security
description: Scan codebase for security vulnerabilities using OWASP Top 10
license: MIT
compatibility: opencode
---

# Security Audit

Scan the codebase for security vulnerabilities using OWASP Top 10 2021 as the reference framework.

---

## What to Scan

**Quick mode** \u2014 prioritize these files:
1. Auth and login modules
2. API route handlers
3. Database query files
4. Config files that reference secrets or credentials
5. Input validation utilities

**Deep mode** \u2014 scan all source files: \`.ts\`, \`.js\`, \`.py\`, \`.go\`, \`.java\`, \`.rb\`, \`.php\` plus config files (\`.env*\`, \`*.yaml\`, \`*.yml\`, \`*.json\`, \`*.toml\`) and package manifests.

If no file index was provided, use Glob to discover files yourself.

---

## What to Look For

### Injection (OWASP A03)
- **SQL injection**: User input concatenated or interpolated directly into SQL queries
- **Command injection**: User input passed to \`exec()\`, \`spawn()\`, \`system()\`, or shell commands
- **XSS**: Unsanitized user input rendered in HTML via \`innerHTML\`, \`dangerouslySetInnerHTML\`, or similar
- **Path traversal**: User input used in file paths without validation (watch for \`../\` patterns)

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
- \`.env\` files or secrets committed to the repository

### Security Misconfiguration (OWASP A05)
- Debug mode or verbose error output enabled in production config
- CORS set to \`*\` on endpoints that use credentials
- Missing security headers (CSP, X-Frame-Options, etc.)
- Default credentials left unchanged in config

### Vulnerable Dependencies (OWASP A06) \u2014 deep mode only
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
- **Title** \u2014 a short, specific description of the issue
- **Severity** and **effort**
- **What's wrong** \u2014 what the code is doing and why it's a problem
- **How to fix** \u2014 a concrete recommendation
- **OWASP/CWE reference** where applicable

Group findings by severity (critical first). At the end, report how many files were scanned and how many issues were found.

If no issues are found, say so clearly \u2014 a clean result is useful information.

If a file can't be read, skip it and note it in the summary. Don't stop the scan.
`;

// src/skill/audit-accessibility/SKILL.md
var SKILL_default7 = '---\nname: audit-accessibility\ndescription: Scan codebase for accessibility issues using WCAG 2.1 AA\nlicense: MIT\ncompatibility: opencode\n---\n\n# Accessibility Audit\n\nScan frontend code for accessibility violations against WCAG 2.1 AA standards.\n\n---\n\n## What to Scan\n\n**Quick mode** \u2014 prioritize these files:\n1. Form components\n2. Button and interactive element components\n3. Navigation and layout components\n4. Modal and dialog components\n\n**Deep mode** \u2014 scan all frontend files: `.jsx`, `.tsx`, `.html`, `.vue`, `.svelte`, `.component.ts`, `.component.html`, and `.css`/`.scss` for color analysis.\n\nIf no file index was provided, use Glob to discover frontend files. If the project has no frontend files, say so and stop.\n\n---\n\n## What to Look For\n\n### Text Alternatives (WCAG 1.1.1)\n- `<img>` elements without an `alt` attribute\n- Informative images with empty `alt=""` (correct for decorative images only)\n- `<button>` elements containing only an icon with no `aria-label`\n- `<svg>` elements without a `title`, `aria-label`, or `aria-labelledby`\n\n### Structure and Relationships (WCAG 1.3.1)\n- `<input>` elements with no associated `<label>` or `aria-label`\n- Data tables missing `<th>` elements\n- Radio or checkbox groups without `<fieldset>` and `<legend>`\n- `<div>` or `<span>` used where semantic elements should be (headings, lists, tables)\n- Pages missing landmark regions (`<main>`, `<nav>`, `<header>`, `<footer>`)\n\n### Use of Color (WCAG 1.4.1)\n- Error or success states indicated only by color with no other visual cue\n- Links distinguished from surrounding text only by color (no underline or other indicator)\n- Required fields marked only with a color change\n\n### Color Contrast (WCAG 1.4.3)\n- Hardcoded color values that appear to fail 4.5:1 for normal text or 3:1 for large text\n- Very light placeholder text colors\n- Note: static analysis can only flag potential issues \u2014 computed styles need runtime verification\n\n### Keyboard Accessibility (WCAG 2.1.1)\n- `<div>` or `<span>` elements with `onClick` but no keyboard event handler (`onKeyDown`, `onKeyPress`)\n- Custom interactive elements without `tabindex`\n- `tabindex` values greater than 0 (disrupts natural tab order)\n- `onMouseOver` / `onMouseEnter` handlers with no keyboard equivalent\n\n### Focus Visibility (WCAG 2.4.7)\n- `outline: none` or `outline: 0` applied without a replacement focus style\n- Custom interactive elements with no `:focus` CSS rule\n- Focus rings that blend into the background\n\n### Headings and Labels (WCAG 2.4.6)\n- Skipped heading levels (e.g. `<h1>` followed directly by `<h3>`)\n- More than one `<h1>` per page or view\n- Empty heading elements\n- Generic, non-descriptive labels like "Click here" or "Submit"\n\n### Skip Navigation (WCAG 2.4.1)\n- Navigation-heavy pages with no skip-to-content link\n\n### Error Identification (WCAG 3.3.1)\n- Form validation errors not announced to screen readers\n- Invalid inputs without `aria-invalid="true"`\n- Error messages not linked to their input via `aria-describedby`\n\n### ARIA Usage \u2014 deep mode\n- Native elements with redundant ARIA roles (e.g., `<button role="button">`)\n- `aria-hidden="true"` applied to elements that receive keyboard focus\n- Custom widgets missing required ARIA roles or state attributes (`aria-expanded`, `aria-selected`, etc.)\n\n---\n\n## Severity Guide\n\n| Severity | When to use |\n|----------|-------------|\n| critical | Complete barrier \u2014 user cannot complete the task (e.g., form with no labels) |\n| high | Major barrier that\'s difficult to work around (missing alt text, no keyboard access) |\n| medium | Moderate impact, workarounds exist (missing skip link, potential contrast issue) |\n| low | Minor impact, best practice improvement |\n\n| Effort | When to use |\n|--------|-------------|\n| trivial | Add a single attribute |\n| small | Localized fix, under an hour |\n| medium | Multiple components, needs testing with assistive technology |\n| large | Pattern change across the codebase |\n\n---\n\n## Output Format\n\nReport findings as a list. For each finding include:\n- **File and line number**\n- **Title** \u2014 a short, specific description of the issue\n- **Severity** and **effort**\n- **What\'s wrong** \u2014 what the code is doing and why it fails accessibility\n- **How to fix** \u2014 a concrete code-level recommendation\n- **WCAG criterion** (e.g., WCAG 1.1.1)\n\nGroup by severity (critical first). At the end, report files scanned and issues found.\n\nIf no frontend files exist, say so \u2014 this audit doesn\'t apply. If a file can\'t be read, skip and note it.\n';

// src/skill/audit-tech-debt/SKILL.md
var SKILL_default8 = `---
name: audit-tech-debt
description: Scan codebase for maintainability issues and code quality problems
license: MIT
compatibility: opencode
---

# Tech Debt Audit

Scan the codebase for maintainability issues, code smells, and quality problems that slow development or introduce risk.

---

## What to Scan

**Quick mode** \u2014 prioritize these files:
1. Core business logic modules
2. Entry points and public APIs
3. Utility and helper modules

**Deep mode** \u2014 scan all source files: \`.ts\`, \`.js\`, \`.py\`, \`.go\`, \`.java\`, \`.rb\`, \`.php\`, \`.rs\`, \`.c\`, \`.cpp\`, plus config files (\`package.json\`, \`requirements.txt\`, \`go.mod\`, \`Gemfile\`, \`Cargo.toml\`) and test files.

If no file index was provided, use Glob to discover source files.

---

## What to Look For

### Complexity
- **Deep nesting**: Functions with more than 4 levels of nesting (if/for/while/try)
- **Long functions**: Functions exceeding ~50\u2013100 lines (language-dependent)
- **Too many branches**: Functions with many conditional paths that are hard to reason about
- **Long parameter lists**: Functions with more than 5 parameters \u2014 consider grouping into an options object
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
- **Duplicate-purpose packages**: Multiple packages solving the same problem (e.g., \`moment\` and \`dayjs\` both present)
- **Missing lockfile**: No lockfile for reproducible installs

### Testing Gaps
- **Untested critical paths**: Core business logic with no corresponding tests
- **Happy-path-only tests**: Tests that don't cover error cases or edge conditions
- **Untested error handling**: \`catch\` blocks or error paths with no test coverage
- **Source files with no test file**: Files that should have a companion test file but don't

### Dead Code
- **Exported functions or classes never imported**: Visible dead exports
- **Unreachable code**: Code after \`return\`, \`throw\`, or \`break\`
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
| medium | Moderate impact \u2014 should be addressed in normal flow |
| low | Minor issues \u2014 address opportunistically |

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
- **Title** \u2014 a short, specific description of the issue
- **Severity** and **effort**
- **What's wrong** \u2014 describe the specific problem
- **How to fix** \u2014 a concrete recommendation

Group by severity (critical first). At the end, report files scanned and issues found.

If no issues are found, say so. If a file can't be read, skip and note it in the summary.
`;

// src/skill/audit-performance/SKILL.md
var SKILL_default9 = `---
name: audit-performance
description: Scan codebase for performance bottlenecks and optimization opportunities
license: MIT
compatibility: opencode
---

# Performance Audit

Scan the codebase for performance bottlenecks and optimization opportunities through static analysis.

---

## What to Scan

**Quick mode** \u2014 prioritize these files:
1. Database query files, repositories, and data access layers (ORM models, SQL patterns)
2. High-traffic React/Vue/Svelte components (pages, layouts)
3. \`package.json\` and application entry points
4. API route handlers

**Deep mode** \u2014 also scan all component files, state management, build config, and asset directories.

If no file index was provided, use Glob to discover relevant files.

---

## What to Look For

### Database Performance
- **N+1 queries**: Database calls inside loops \u2014 a \`map()\` or \`forEach()\` that \`await\`s a query on each iteration
- **Missing pagination**: Queries that fetch all records with no \`LIMIT\` or page size
- **Over-fetching**: \`SELECT *\` when only a few specific columns are needed, or eager-loading relations that aren't used
- **Missing indexes** (inferred): Frequent \`WHERE\` or \`ORDER BY\` on columns that look unindexed based on query patterns

### React Rendering
- **Missing memoization**: Expensive calculations inside render without \`useMemo\`; components that re-render unnecessarily and could use \`React.memo\`
- **Inline functions in JSX**: Arrow functions defined directly in \`onClick\`, \`onChange\`, or similar props \u2014 these create new function references on every render, causing child component re-renders
- **Missing or incorrect dependency arrays**: \`useEffect\` or \`useCallback\` with empty \`[]\` when they depend on values that change, or missing \`[]\` entirely
- **State updates in loops**: Calling \`setState\` inside \`map\` or \`forEach\`, triggering multiple renders instead of batching

### Bundle Size
- **Heavy libraries imported entirely**: \`import _ from 'lodash'\` instead of \`import { debounce } from 'lodash'\`; \`moment.js\` (suggest \`dayjs\` or \`date-fns\`)
- **Missing code splitting**: Large components or entire routes loaded eagerly instead of using \`React.lazy\` and dynamic imports
- **Overlapping utility libraries**: Multiple packages that do the same thing (e.g., two date libraries, two HTTP clients)

### Assets
- **Images without an optimization pipeline**: Image tags or references with no CDN transforms, no \`?w=\` sizing params, and no use of optimized image components (\`next/image\`, etc.)
- **Missing lazy loading**: \`<img>\` elements without \`loading="lazy"\` or Intersection Observer when they're not above the fold
- **Uncompressed or unminified assets** (inferred from import patterns \u2014 static analysis can't measure actual sizes)

### Caching
- **Repeated expensive computations**: The same heavy calculation done in multiple places with no shared memoization
- **Uncached API calls**: Identical fetch calls in multiple components with no shared cache layer (SWR, React Query, etc.)
- **Missing HTTP cache headers**: API response handlers with no \`Cache-Control\` configuration

### Blocking Operations
- **Synchronous file I/O**: \`fs.readFileSync\`, \`fs.writeFileSync\` used in contexts that should be async
- **Heavy computation on the main thread**: Large array operations in event handlers without chunking or Web Workers
- **Callback patterns where async/await would prevent blocking**

---

## Severity Guide

| Severity | When to use |
|----------|-------------|
| critical | Major user-facing impact \u2014 slow list views, unbounded queries on large tables |
| high | Noticeable slowdown or scalability issue \u2014 heavy imports, sync I/O in hot paths |
| medium | Moderate impact, optimization opportunity \u2014 missing memoization, suboptimal imports |
| low | Minor improvement, best practice \u2014 missing lazy loading, small bundle savings |

| Effort | When to use |
|--------|-------------|
| trivial | Change an import, add a single attribute |
| small | Add memoization, swap a library |
| medium | Refactor queries, implement a caching layer |
| large | Architectural change, major refactor |

---

## Output Format

Report findings as a list. For each finding include:
- **File and line number**
- **Title** \u2014 a short, specific description of the issue
- **Severity** and **effort**
- **What's wrong** \u2014 describe the specific pattern and its performance impact
- **How to fix** \u2014 a concrete recommendation

Group by severity (critical first). At the end, report files scanned and issues found.

Note: static analysis can identify patterns and likely bottlenecks, but cannot measure actual runtime performance. Flag findings appropriately as "likely" or "potential" where certainty is lower.

If no performance issues are found, say so. If a file can't be read, skip and note it.
`;

// src/skill/debug/SKILL.md
var SKILL_default10 = `---
name: debug
description: Diagnose a bug, failure, or problem \u2014 produces a diagnostic report with root cause analysis and recommendations
license: MIT
compatibility: opencode
---

# Debug Workflow

You are a diagnostic investigator. Your job is to analyze a problem, understand what's actually going wrong at the code level, and produce a clear report with root cause analysis and actionable recommendations. This workflow is diagnosis only \u2014 you do not implement fixes.

Before starting: read this entire skill, then create a focused todo list, then execute.

---

## Phase 1 \u2014 Load Core Philosophy and Memory

Load the \`core\` skill to internalize project values. These principles guide how you investigate and what you consider worth flagging.

Load memory: if \`.ai/memory/MANIFEST.md\` exists, read it. Pick entries relevant to the problem area \u2014 known bugs, architectural context, prior investigations. Read those files. Hold this as \`loaded_memory\`. If no MANIFEST exists, skip silently.

---

## Phase 2 \u2014 Parse the Input

The input will be one of these forms:
- A GitHub issue number: \`456\`
- A GitHub issue URL: \`https://github.com/owner/repo/issues/456\`
- A quoted problem description: \`"tests failing intermittently in CI"\`
- Any of the above followed by \`: some context\` for inline hints

Extract:
- \`issue_ref\` \u2014 issue number or URL if provided
- \`problem_description\` \u2014 the text description if provided, or the issue title once fetched
- \`inline_context\` \u2014 any text after \`:\` in the input

Display: \`Debug: {problem_description || 'fetching issue...'}\`

---

## Phase 3 \u2014 Fetch Issue Details (if applicable)

If the input was an issue number or URL:
- Get the repo from \`git remote get-url origin\`
- Fetch issue details: \`gh issue view {number} --json title,body,labels,comments\`
- Extract the full problem description, any error messages quoted in the issue body, and any relevant comments
- Note any labels (they often classify the problem type \u2014 \`bug\`, \`flaky-test\`, \`performance\`, etc.)

If the input was a quoted description, skip this phase and use the description directly.

Store: \`problem_description\`, \`error_messages\` (any stack traces or error text found), \`issue_context\`.

---

## Phase 4 \u2014 Classify the Problem

Look at the problem description and any error messages and classify what type of problem this is:

- **test** \u2014 failing or flaky tests, assertion errors, test setup issues
- **ci-cd** \u2014 CI pipeline failures, build errors, deployment issues, environment differences
- **performance** \u2014 slowness, timeouts, high memory/CPU, N+1 queries
- **security** \u2014 vulnerabilities, auth failures, unexpected access issues
- **database** \u2014 query errors, migration failures, data integrity issues, ORM issues
- **general** \u2014 runtime errors, unexpected behavior, logic bugs, crashes

Store: \`classification\`

Display: \`Classification: {classification}\`

---

## Phase 5 \u2014 Explore the Codebase

Before investigating, get oriented:
- Look at the directory structure to understand the project layout
- Identify the primary language, framework, and test setup
- Find files most likely related to the problem based on the description

Then dig in:
- Read the files most likely involved
- Follow the call chain from the failing point
- Find where the reported behavior originates

Use the classification to guide where you look:
- **test/ci-cd** \u2192 test files, CI config, test setup/fixtures, environment config
- **performance** \u2192 data access layer, loops, API handlers, database queries
- **security** \u2192 auth middleware, input handling, session management, config files
- **database** \u2192 ORM models, migration files, repository layer, query files
- **general** \u2192 the specific file/function mentioned in the error, then its callers

Collect: \`relevant_files\`, \`code_paths\`, \`observations\` as you go.

---

## Phase 6 \u2014 Form Hypotheses

Based on what you found in the codebase, form hypotheses about the root cause. For each hypothesis:

- State what you think is happening
- Point to the specific code location (\`file:line\`)
- Rate your confidence: high / medium / low
- Explain what evidence supports it
- Explain what would need to be true for it to be wrong

Order hypotheses by confidence (most confident first).

For **test/flaky test** problems specifically, also consider:
- Race conditions or timing dependencies
- Shared mutable state between tests
- External service dependencies (network, filesystem, time)
- Test isolation failures (one test affecting another)

For **ci-cd** problems, also consider:
- Environment differences (local vs CI \u2014 env vars, installed tools, file permissions)
- Caching issues (stale build artifacts)
- Dependency version mismatches

---

## Phase 7 \u2014 Generate Diagnostic Report

Produce a structured diagnostic report:

\`\`\`
## Problem
{problem_description}

## Classification
{classification}

## Files Investigated
{list of relevant files with brief note on what each does}

## Root Cause Analysis

### Most Likely: {hypothesis title} (confidence: high)
{explanation}
**Location:** {file:line}
**Evidence:** {what supports this}

### Also Possible: {hypothesis title} (confidence: medium)
{explanation}
**Location:** {file:line}
**Evidence:** {what supports this}

## Recommendations

### To confirm the root cause
{specific steps to reproduce or verify the diagnosis \u2014 what to run, what to look for}

### To fix it
{concrete, specific recommendations \u2014 not vague, not "refactor this" \u2014 actual changes to make}

### To prevent recurrence
{any broader improvements that would prevent this class of problem}

## What This Is Not
{briefly note hypotheses you investigated and ruled out, so the next person doesn't re-investigate them}
\`\`\`

---

## Phase 8 \u2014 Save Memory and Done

Save memory: if the diagnosis revealed something worth preserving \u2014 a non-obvious root cause pattern, an architectural gap, a debugging approach that worked \u2014 write a context entry to \`.ai/memory/\` using the memory skill conventions and update \`MANIFEST.md\`. Then commit: \`git add .ai/memory/ && git commit -m "chore: record debug findings in memory"\`. If nothing significant emerged, skip.

Display the report. Then offer:
- "Create a GitHub issue from this diagnosis" \u2014 runs \`gh issue create\` with the report as the body
- "Done" \u2014 stop here

If they choose to create an issue: use the problem description as the title, the full report as the body, label it with \`bug\` and the classification.

---

## Constraints

- This is diagnosis only. Do not modify files, write code, or implement fixes.
- If you can't determine the root cause with reasonable confidence, say so clearly. A honest "I don't know, but here are the most likely candidates and how to narrow it down" is more useful than a confident wrong answer.
- If the problem requires runtime data (profiling output, logs, query execution plans) that you don't have access to, say what data would help and how to collect it.
`;

// src/skill/wave/SKILL.md
var SKILL_default11 = `---
name: wave
description: Execute multiple related issues in order on a single shared branch
license: MIT
compatibility: opencode
---

# Wave Execution

You implement a group of related issues in sequence on one shared branch. The caller (work-issue) handles verification, review, commit, and PR after you finish.

You receive:
- The ordered list of issue numbers to implement
- The fetched data for each issue (title, body, labels)
- \`auto_mode\` \u2014 whether to skip confirmation prompts

---

## Step 1 \u2014 Determine the Branch Name

Name the branch using the smallest and largest issue numbers in the group, plus the count:

\`\`\`
wave/{min_issue}-{max_issue}-{count}
\`\`\`

Examples:
- Issues 123, 124, 125 \u2192 \`wave/123-125-3\`
- Issues 123, 127, 131 \u2192 \`wave/123-131-3\`
- Issues 123 only \u2192 \`wave/123-123-1\`

---

## Step 2 \u2014 Create or Resume the Branch

Check whether this branch already exists:

\`\`\`
git ls-remote --heads origin wave/{min}-{max}-{count}
\`\`\`

**If the branch does not exist:** Create and switch to it:
\`\`\`
git checkout -b wave/{min}-{max}-{count}
\`\`\`

**If the branch already exists** (resume case): Switch to it:
\`\`\`
git checkout wave/{min}-{max}-{count}
git pull origin wave/{min}-{max}-{count}
\`\`\`

Then check which issues were already implemented by scanning the git log:
\`\`\`
git log origin/main..HEAD --format="%s %b"
\`\`\`

Look for issue references (\`#123\`, \`Closes #123\`, etc.) in the commit messages. Any issue numbers from your group that appear in the log are already done \u2014 mark them as complete and skip them in Step 3.

Display: \`Branch: {branch_name} | resuming: {skipped_count} issues already done\`

---

## Step 3 \u2014 Implement Issues in Order

For each issue in the ordered list (skipping any already completed from Step 2):

**Display:** \`Implementing #{number}: {title}\`

**Read the requirements:** Look at the issue body. Extract:
- What needs to change
- Acceptance criteria (checkbox items if present)
- Any specific files mentioned

**Implement the changes:**
- Follow existing patterns in the codebase \u2014 explore before writing
- Make the smallest change that satisfies this issue's requirements
- Handle errors explicitly

**After implementing:** Run \`git diff --name-only\` and note the files changed for this issue. Store them in your running implementation record.

**On success:** Proceed to the next issue.

**On failure:** If the failure is critical (git errors, missing data, merge conflict you can't resolve) \u2014 stop here and report partial results. If the failure is recoverable (a single file edit failed, a nice-to-have enhancement couldn't apply) \u2014 note the warning and continue to the next issue.

---

## Step 4 \u2014 Return Results to Caller

When all issues are processed, report back:

\`\`\`
Wave complete: {completed_count}/{total_count} issues implemented
Branch: {branch_name}
Issues done: {list of completed issue numbers}
Files changed: {total count}

Per-issue summary:
  #{number}: {title} \u2014 {files_changed_count} files \u2014 {complete|partial|skipped}
  ...
\`\`\`

If any issues failed or were partial, note them clearly so the caller can decide whether to proceed or abort.

---

## What This Skill Does NOT Do

- Does not run tests
- Does not run lint or type checks
- Does not commit
- Does not create a PR

The work-issue skill handles all of that once, for the entire group together.

---

## Error Handling

- **Git branch errors**: report and stop \u2014 don't attempt to implement on a broken branch state
- **Issue data missing**: skip that issue, note it as unimplemented, continue with the rest
- **Merge conflict**: if auto-resolvable, resolve it; if not, stop and report which issue caused it
- **Partial group**: if some issues complete before a critical failure, return what completed \u2014 the caller decides whether to commit partial work or discard
`;

// src/skill/memory/SKILL.md
var SKILL_default12 = `---
name: memory
description: Project memory \u2014 decisions, patterns, and context stored in .ai/memory/
license: MIT
compatibility: opencode
---

# Memory

Project memory lives in \`.ai/memory/\` at the repository root. It stores architectural decisions, reusable patterns, and project context across sessions and across teammates. Memory files are committed to the repo \u2014 they are shared knowledge, versioned with the code.

---

## Directory Structure

\`\`\`
.ai/
\u251C\u2500\u2500 memory/
\u2502   \u251C\u2500\u2500 MANIFEST.md           \u2190 auto-maintained index (always read this first)
\u2502   \u251C\u2500\u2500 decisions/
\u2502   \u2502   \u2514\u2500\u2500 NNN-slug.md       \u2190 architectural decision records
\u2502   \u251C\u2500\u2500 patterns/
\u2502   \u2502   \u2514\u2500\u2500 name.md           \u2190 reusable code patterns
\u2502   \u2514\u2500\u2500 context/
\u2502       \u2514\u2500\u2500 name.md           \u2190 project context (architecture, setup, dependencies)
\u2514\u2500\u2500 session/
    \u2514\u2500\u2500 {command}-{id}.md     \u2190 active workflow checkpoints (crash recovery)
\`\`\`

---

## Session State \u2014 \`.ai/session/\`

Session files are workflow checkpoints written during execution and deleted on successful completion. They serve as the Ralph loop \u2014 if a session crashes or hits a context limit, rerunning the same command detects the session file and resumes from where it left off. The plugin's compaction hook automatically injects any active session files into every compaction prompt, so workflow state also survives context compaction mid-run.

**Naming:** \`work-issue-{number}.md\`, \`work-pr-{number}.md\`

**Written:** after the implementation plan is established (Phase 7 for work-issue, Phase 6 for work-pr)
**Updated:** as plan items are completed \u2014 mark each \`[ ]\` \u2192 \`[x]\` immediately when done
**Deleted:** on successful workflow completion

### work-issue session format

\`\`\`markdown
---
command: work-issue
issue: 123
branch: issue/123
started: 2026-03-08T17:00:00Z
complexity: medium
---

## Implementation Plan
- [x] Add validateEmail utility to src/utils/validation.ts
- [ ] Update UserController.register to call the validator  \u2190 NEXT
- [ ] Add unit tests for validateEmail
- [ ] Update API docs

## Status
Phase 8 \u2014 Implement (1 of 4 items done)

## Notes
Tests passing on item 1. Branch is clean.
\`\`\`

### work-pr session format

\`\`\`markdown
---
command: work-pr
pr: 456
branch: feature/auth-improvements
started: 2026-03-08T17:00:00Z
complexity: medium
---

## Blocking Feedback
- [x] Fix null check in UserService.find (line 42) \u2014 @alice
- [ ] Remove hardcoded timeout \u2014 @bob  \u2190 NEXT

## Recommended Feedback
- [ ] Extract magic number to named constant

## Status
Phase 7 \u2014 Implement (1 of 2 blocking items done)
\`\`\`

Session files are **not committed to git** \u2014 add \`.ai/session/\` to \`.gitignore\`. They are transient state, not shared knowledge.

---

## MANIFEST.md Format

The MANIFEST is the single entry point for all memory. Every stored entry gets one line here \u2014 a reference ID, a title, and a one-sentence summary. Read the MANIFEST first, pick what's relevant, then read only those files.

\`\`\`markdown
# Memory Manifest
Last updated: 2026-01-15

## Decisions
- [Decision-001] Use PostgreSQL \u2014 chose over MongoDB for ACID compliance (2026-01-10)
- [Decision-002] Feature flags via env vars \u2014 avoid DB-backed flags for simplicity (2026-01-12)

## Patterns
- [Pattern:error-handling] API error shape \u2014 {error, code, details} across all endpoints (2026-01-08)
- [Pattern:auth-middleware] JWT verification \u2014 wraps all protected routes (2026-01-10)

## Context
- [Context:architecture] System overview \u2014 microservices with shared auth service (2026-01-05)
- [Context:setup] Local development \u2014 requires Docker, Node 20, .env.local (2026-01-05)
\`\`\`

---

## Reading Memory

At the start of any workflow:

1. Check if \`.ai/memory/MANIFEST.md\` exists. If not, skip \u2014 no memory yet.
2. Read the MANIFEST.
3. Based on what you're working on (issue title, keywords, labels, file areas), pick the 3\u20137 most relevant entries.
4. Read only those files.
5. Hold the contents as \`loaded_memory\` for reference during the workflow.

Claude does the relevance matching natively \u2014 no scripts or indices needed.

---

## Writing Memory

After implementing something significant, capture what was learned. Write sparingly \u2014 only things that would genuinely help the next session or a teammate. Not every decision needs recording, only those with non-obvious rationale or lasting impact.

### Decision file \u2014 \`decisions/NNN-slug.md\`

Number sequentially. Find the highest existing number in the MANIFEST, use the next one.

\`\`\`markdown
---
ref: Decision-003
title: Use feature flags for gradual rollout
date: 2026-01-15
issue: 456
---

## Context
We needed to deploy risky features without exposing them to all users at once.

## Decision
Use environment variable-based feature flags rather than a database-backed system.

## Rationale
Simpler to reason about. No runtime DB reads per request. Deployments control exposure.

## Consequences
Requires a redeploy to toggle a flag. Not suitable for per-user targeting.
\`\`\`

### Pattern file \u2014 \`patterns/name.md\`

Name is a short descriptive slug: \`error-handling\`, \`auth-middleware\`, \`pagination\`.

\`\`\`markdown
---
ref: Pattern:error-handling
title: API error response shape
date: 2026-01-08
tags: [api, errors]
---

All API error responses follow this shape: \`{error: string, code: string, details?: object}\`.

\`\`\`typescript
return res.status(400).json({
  error: "Validation failed",
  code: "VALIDATION_ERROR",
  details: { field: "email", reason: "invalid format" }
})
\`\`\`
\`\`\`

### Context file \u2014 \`context/name.md\`

For architectural facts, setup instructions, or project background that isn't a decision per se.

\`\`\`markdown
---
ref: Context:architecture
title: System architecture overview
date: 2026-01-05
---

## Summary
Microservices: auth-service, api-gateway, and worker. Shared Postgres DB. Redis for sessions.

## Details
- Auth service handles all JWT issuance and validation
- API gateway proxies to services and enforces auth middleware
- Worker processes background jobs from a Redis queue
\`\`\`

---

## Updating the MANIFEST

After writing any new file:

1. Read \`MANIFEST.md\`.
2. Add one line under the correct section: \`- [ref] title \u2014 one-line summary (date)\`
3. Update the \`Last updated:\` date at the top.
4. Write the file back.

Keep entries in chronological order within each section. Never delete entries \u2014 if something is superseded, note it in the original file, but keep the MANIFEST line.

---

## Committing Memory Changes

Memory files should travel with the code that generated them.

- In workflows that produce a commit (work-issue, work-pr): write memory files before \`git add -A\` so they're staged automatically.
- In workflows without a code commit (audit, debug, merge-pr): after writing memory, run \`git add .ai/memory/ && git commit -m "chore: update memory"\` as a standalone commit.

If nothing was written, skip silently.

---

## /memory Command Routing

When invoked directly as \`/memory\`, route based on the user's input:

**No input** or **\`show\`**
Read \`.ai/memory/MANIFEST.md\` and display it. Show total entry counts by section. If no MANIFEST exists, say "No memory yet \u2014 one will be created when you complete your first workflow."

**\`search {query}\`**
Read the MANIFEST. Find all entries whose title or summary contains the query terms. Read and display those files in full.

**\`add\`**
Ask the user: decision, pattern, or context? Then ask for the content. Write the appropriate file, update the MANIFEST, and confirm what was written.

**\`add decision {description}\`** / **\`add pattern {description}\`** / **\`add context {description}\`**
Write the entry directly using the description provided. Fill in a reasonable title and date. Update the MANIFEST.

**\`rebuild\`**
Scan all files in \`.ai/memory/decisions/\`, \`.ai/memory/patterns/\`, \`.ai/memory/context/\`. Read each file's frontmatter (\`ref\`, \`title\`, \`date\`) and first non-heading paragraph as the summary. Regenerate \`MANIFEST.md\` from scratch. Display entry count found.

For all write operations: confirm what was written and remind the user to commit \`.ai/memory/\` if it's not part of an active workflow commit.
`;

// src/plugin/hv-plugin.ts
var CONFIG_DIR = path.join(os.homedir(), ".config", "opencode");
async function writeIfChanged(filePath, content) {
  try {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing === content)
      return false;
  } catch {}
  await fs.writeFile(filePath, content, "utf8");
  return true;
}
async function install(client) {
  const targets = [
    { dir: path.join(CONFIG_DIR, "commands"), name: "work-issue.md", content: work_issue_default },
    { dir: path.join(CONFIG_DIR, "commands"), name: "work-pr.md", content: work_pr_default },
    { dir: path.join(CONFIG_DIR, "commands"), name: "merge-pr.md", content: merge_pr_default },
    { dir: path.join(CONFIG_DIR, "commands"), name: "audit.md", content: audit_default },
    { dir: path.join(CONFIG_DIR, "commands"), name: "debug.md", content: debug_default },
    { dir: path.join(CONFIG_DIR, "commands"), name: "memory.md", content: memory_default },
    { dir: path.join(CONFIG_DIR, "skills", "core"), name: "SKILL.md", content: SKILL_default },
    { dir: path.join(CONFIG_DIR, "skills", "work-issue"), name: "SKILL.md", content: SKILL_default2 },
    { dir: path.join(CONFIG_DIR, "skills", "work-pr"), name: "SKILL.md", content: SKILL_default3 },
    { dir: path.join(CONFIG_DIR, "skills", "merge-pr"), name: "SKILL.md", content: SKILL_default4 },
    { dir: path.join(CONFIG_DIR, "skills", "audit"), name: "SKILL.md", content: SKILL_default5 },
    { dir: path.join(CONFIG_DIR, "skills", "audit-security"), name: "SKILL.md", content: SKILL_default6 },
    { dir: path.join(CONFIG_DIR, "skills", "audit-accessibility"), name: "SKILL.md", content: SKILL_default7 },
    { dir: path.join(CONFIG_DIR, "skills", "audit-tech-debt"), name: "SKILL.md", content: SKILL_default8 },
    { dir: path.join(CONFIG_DIR, "skills", "audit-performance"), name: "SKILL.md", content: SKILL_default9 },
    { dir: path.join(CONFIG_DIR, "skills", "debug"), name: "SKILL.md", content: SKILL_default10 },
    { dir: path.join(CONFIG_DIR, "skills", "wave"), name: "SKILL.md", content: SKILL_default11 },
    { dir: path.join(CONFIG_DIR, "skills", "memory"), name: "SKILL.md", content: SKILL_default12 }
  ];
  for (const { dir, name, content } of targets) {
    await fs.mkdir(dir, { recursive: true });
    const changed = await writeIfChanged(path.join(dir, name), content);
    if (changed) {
      await client.app.log({
        body: { service: "hivrr-plugin", level: "info", message: `Installed ${name} \u2192 ${dir}` }
      });
    }
  }
}
async function readManifest(worktree) {
  try {
    return await fs.readFile(path.join(worktree, ".ai", "memory", "MANIFEST.md"), "utf8");
  } catch {
    return null;
  }
}
async function readSessionFiles(worktree) {
  const sessionDir = path.join(worktree, ".ai", "session");
  try {
    const files = await fs.readdir(sessionDir);
    const results = [];
    for (const file of files) {
      if (!file.endsWith(".md"))
        continue;
      try {
        const content = await fs.readFile(path.join(sessionDir, file), "utf8");
        results.push({ name: file, content });
      } catch {}
    }
    return results;
  } catch {
    return [];
  }
}
var HivrrPlugin = async ({ client, worktree }) => {
  await install(client);
  return {
    "experimental.session.compacting": async (_input, output) => {
      if (!worktree)
        return;
      const manifest = await readManifest(worktree);
      const sessions = await readSessionFiles(worktree);
      if (manifest) {
        output.context.push(`## Project Memory

${manifest}`);
      }
      for (const { name, content } of sessions) {
        output.context.push(`## Active Workflow Session (${name})

${content}`);
      }
      if (sessions.length > 0) {
        output.prompt = `You are compacting an active hivrr workflow session. The context above includes the current workflow state. Produce a continuation summary that preserves:

1. The workflow name and current phase (e.g. "work-issue, Phase 8 \u2014 Implement")
2. The full implementation plan with each item's exact [ ] or [x] state
3. Every file changed so far and what each change does
4. Test and lint status at the last check
5. Branch name, issue/PR numbers, and any linked issues
6. Architectural decisions or patterns discovered during this session
7. The immediate next action \u2014 be specific

Be complete. This summary is the only memory the resumed session will have.`;
      } else {
        output.prompt = `You are compacting an opencode session. Produce a continuation summary that preserves:

1. The current task and its exact status
2. Files modified and the purpose of each change
3. Test and lint status
4. Decisions made and why
5. The immediate next action

The context above includes project memory (decisions, patterns, context). Ensure any memory entries referenced during this session remain accessible after compaction.`;
      }
    },
    event: async ({ event }) => {
      if (event.type === "session.created") {
        await client.app.log({
          body: { service: "hivrr-plugin", level: "info", message: "Session started" }
        });
      }
    }
  };
};
export {
  HivrrPlugin as default,
  HivrrPlugin
};
