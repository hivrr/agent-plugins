#!/usr/bin/env bash
set -euo pipefail

# hivrr-merge.sh — mechanical phases of the merge-pr workflow
# Handles: PR validation, CI check, confirm, squash merge, issue close, branch cleanup
# Outputs a structured summary line for the skill to consume.

usage() {
  echo "Usage: hivrr-merge.sh --pr <number> --repo <owner/repo> [--auto]" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
PR_NUMBER=""
REPO=""
AUTO=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr)
      PR_NUMBER="${2:-}"
      [[ -z "$PR_NUMBER" ]] && { echo "ERROR: --pr requires a value" >&2; usage; }
      shift 2
      ;;
    --repo)
      REPO="${2:-}"
      [[ -z "$REPO" ]] && { echo "ERROR: --repo requires a value" >&2; usage; }
      shift 2
      ;;
    --auto)
      AUTO=true
      shift
      ;;
    *)
      echo "ERROR: Unknown flag: $1" >&2
      usage
      ;;
  esac
done

[[ -z "$PR_NUMBER" ]] && { echo "ERROR: --pr is required" >&2; usage; }
[[ -z "$REPO" ]] && { echo "ERROR: --repo is required" >&2; usage; }

# ---------------------------------------------------------------------------
# Phase 3 — Fetch PR details
# ---------------------------------------------------------------------------
echo "Fetching PR #${PR_NUMBER} from ${REPO}..."

PR_JSON=$(gh pr view "$PR_NUMBER" --repo "$REPO" \
  --json title,body,headRefName,state,baseRefName,reviews 2>&1) || {
  echo "ERROR: Failed to fetch PR #${PR_NUMBER}: ${PR_JSON}" >&2
  exit 1
}

PR_TITLE=$(echo "$PR_JSON" | jq -r '.title')
PR_BODY=$(echo "$PR_JSON"  | jq -r '.body')
BRANCH_NAME=$(echo "$PR_JSON"  | jq -r '.headRefName')
PR_STATE=$(echo "$PR_JSON"  | jq -r '.state')
BASE_BRANCH=$(echo "$PR_JSON"  | jq -r '.baseRefName')

echo "PR #${PR_NUMBER}: \"${PR_TITLE}\" | state: ${PR_STATE}"

if [[ "$PR_STATE" == "MERGED" ]]; then
  echo "PR #${PR_NUMBER} is already merged — skipping to cleanup"
  ALREADY_MERGED=true
elif [[ "$PR_STATE" == "CLOSED" ]]; then
  echo "ERROR: PR #${PR_NUMBER} is closed but not merged. Cannot merge a closed PR." >&2
  exit 1
else
  ALREADY_MERGED=false
fi

CHANGES_REQUESTED=$(echo "$PR_JSON" | jq '[.reviews[] | select(.state == "CHANGES_REQUESTED")] | length')
if [[ "$CHANGES_REQUESTED" -gt 0 ]]; then
  echo "WARNING: ${CHANGES_REQUESTED} review(s) requesting changes — consider addressing before merge" >&2
fi

# ---------------------------------------------------------------------------
# Phase 4 — Extract linked issues
# ---------------------------------------------------------------------------
LINKED_ISSUES=()
while IFS= read -r num; do
  [[ -n "$num" ]] && LINKED_ISSUES+=("$num")
done < <(echo "$PR_BODY" | grep -oiE '(closes?|fixes?|resolves?)[[:space:]]+#[0-9]+' | grep -oE '[0-9]+' | sort -un)

if [[ ${#LINKED_ISSUES[@]} -gt 0 ]]; then
  echo "Linked issues: ${LINKED_ISSUES[*]}"
else
  echo "Linked issues: none"
fi

# ---------------------------------------------------------------------------
# Phase 5 — Verify CI (skip if already merged)
# ---------------------------------------------------------------------------
if [[ "$ALREADY_MERGED" == "false" ]]; then
  echo "Checking CI..."
  CI_JSON=$(gh pr checks "$PR_NUMBER" --repo "$REPO" --json name,state 2>&1) || {
    echo "ERROR: Failed to fetch CI checks: ${CI_JSON}" >&2
    exit 1
  }

  FAILING=$(echo "$CI_JSON" | jq -r \
    '.[] | select(.state | ascii_downcase | test("failure|timed_out|cancelled|startup_failure|action_required")) | "  \(.name): \(.state)"')
  if [[ -n "$FAILING" ]]; then
    echo "ERROR: CI checks are failing — cannot merge:" >&2
    echo "$FAILING" >&2
    exit 1
  fi

  CHECK_COUNT=$(echo "$CI_JSON" | jq 'length')
  if [[ "$CHECK_COUNT" -eq 0 ]]; then
    echo "CI: no checks configured — continuing"
  else
    echo "CI: all checks passed"
  fi
fi

# ---------------------------------------------------------------------------
# Phase 6 — Confirm (skip if --auto or already merged)
# ---------------------------------------------------------------------------
if [[ "$AUTO" == "false" && "$ALREADY_MERGED" == "false" ]]; then
  echo ""
  echo "--- Merge Summary ---"
  echo "  PR:      #${PR_NUMBER} — ${PR_TITLE}"
  echo "  Method:  squash"
  echo "  Branch:  ${BRANCH_NAME} (local + remote will be deleted)"
  if [[ ${#LINKED_ISSUES[@]} -gt 0 ]]; then
    echo "  Issues:  ${LINKED_ISSUES[*]} will be closed"
  else
    echo "  Issues:  none"
  fi
  echo ""
  read -rp "Ready to merge? [y/N] " CONFIRM
  case "$CONFIRM" in
    [yY]|[yY][eE][sS]) ;;
    *) echo "Aborted."; exit 0 ;;
  esac
fi

# ---------------------------------------------------------------------------
# Phase 7 — Merge
# ---------------------------------------------------------------------------
REMOTE_DELETED=false
if [[ "$ALREADY_MERGED" == "false" ]]; then
  echo "Merging PR #${PR_NUMBER} (squash)..."
  if gh pr merge "$PR_NUMBER" --repo "$REPO" --squash --delete-branch 2>&1; then
    REMOTE_DELETED=true
  else
    # --delete-branch may fail if branch was already deleted; re-check state before retrying
    RETRY_STATE=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json state --jq '.state' 2>/dev/null || echo "UNKNOWN")
    if [[ "$RETRY_STATE" == "MERGED" ]]; then
      echo "PR #${PR_NUMBER} was merged (branch deletion may have failed — will clean up below)"
    elif gh pr merge "$PR_NUMBER" --repo "$REPO" --squash 2>&1; then
      REMOTE_DELETED=false
    else
      echo "ERROR: Merge failed" >&2
      exit 1
    fi
  fi
  echo "Merged: PR #${PR_NUMBER} → ${BASE_BRANCH} (squash)"
fi

# ---------------------------------------------------------------------------
# Phase 8 — Close linked issues that didn't auto-close
# ---------------------------------------------------------------------------
MANUALLY_CLOSED=0
if [[ ${#LINKED_ISSUES[@]} -gt 0 ]]; then
  sleep 3  # give GitHub's auto-close a moment to fire
  for ISSUE_NUM in "${LINKED_ISSUES[@]}"; do
    ISSUE_STATE=$(gh issue view "$ISSUE_NUM" --repo "$REPO" --json state --jq '.state' 2>/dev/null || echo "UNKNOWN")
    if [[ "$ISSUE_STATE" == "CLOSED" ]]; then
      echo "Issue #${ISSUE_NUM}: already closed"
    elif [[ "$ISSUE_STATE" == "OPEN" ]]; then
      if gh issue close "$ISSUE_NUM" --repo "$REPO" 2>/dev/null; then
        echo "Issue #${ISSUE_NUM}: closed"
        MANUALLY_CLOSED=$(( MANUALLY_CLOSED + 1 ))
      else
        echo "WARNING: Failed to close issue #${ISSUE_NUM}" >&2
      fi
    else
      echo "WARNING: Could not determine state of issue #${ISSUE_NUM}" >&2
    fi
  done
  echo "Linked issues: ${#LINKED_ISSUES[@]} verified, ${MANUALLY_CLOSED} manually closed"
fi

# ---------------------------------------------------------------------------
# Phase 9 — Switch to base branch and pull
# ---------------------------------------------------------------------------
echo "Switching to ${BASE_BRANCH} and pulling..."
git checkout "$BASE_BRANCH"
git pull origin "$BASE_BRANCH"
echo "Main: updated"

# ---------------------------------------------------------------------------
# Phase 10 — Clean up branches
# ---------------------------------------------------------------------------
LOCAL_DELETED=false
REMOTE_PRUNED=false

# Delete local branch
if git show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
  git branch -d "$BRANCH_NAME" 2>/dev/null \
    || git branch -D "$BRANCH_NAME" 2>/dev/null \
    || echo "WARNING: Could not delete local branch ${BRANCH_NAME}" >&2
  LOCAL_DELETED=true
fi

# Delete remote branch if --delete-branch didn't handle it
if [[ "$REMOTE_DELETED" == "false" ]]; then
  if git ls-remote --heads origin "$BRANCH_NAME" | grep -q .; then
    git push origin --delete "$BRANCH_NAME" 2>/dev/null \
      || echo "WARNING: Could not delete remote branch ${BRANCH_NAME}" >&2
  fi
fi

# Prune stale remote-tracking refs
git remote prune origin 2>/dev/null || true
REMOTE_PRUNED=true

echo "Cleanup: local branch deleted | remote branch deleted | refs pruned"

# ---------------------------------------------------------------------------
# Structured summary for the skill to consume
# ---------------------------------------------------------------------------
ISSUES_SUMMARY="${LINKED_ISSUES[*]:-none}"
echo ""
echo "HIVRR_MERGE_SUMMARY pr=${PR_NUMBER} issues_closed=${ISSUES_SUMMARY// /,} branch_deleted=${BRANCH_NAME}"
