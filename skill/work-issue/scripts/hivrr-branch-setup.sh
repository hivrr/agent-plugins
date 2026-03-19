#!/usr/bin/env bash
set -uo pipefail

# hivrr-branch-setup.sh — create or switch to the issue branch
# Usage: hivrr-branch-setup.sh --issue <N>

usage() {
  echo "Usage: hivrr-branch-setup.sh --issue <number>" >&2
  exit 1
}

ISSUE_NUMBER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --issue)
      ISSUE_NUMBER="${2:-}"
      [[ -z "$ISSUE_NUMBER" ]] && { echo "ERROR: --issue requires a value" >&2; usage; }
      shift 2
      ;;
    *)
      echo "ERROR: Unknown flag: $1" >&2
      usage
      ;;
  esac
done

[[ -z "$ISSUE_NUMBER" ]] && { echo "ERROR: --issue is required" >&2; usage; }

BRANCH="issue/${ISSUE_NUMBER}"

# Warn if working tree is dirty, but continue
if ! git status --porcelain | grep -q ''; then
  :
fi
if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  echo "WARNING: Working tree has uncommitted changes — continuing anyway"
fi

# Create or switch to branch
if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  git checkout "${BRANCH}" || { echo "ERROR: Failed to switch to ${BRANCH}" >&2; exit 1; }
else
  git checkout -b "${BRANCH}" || { echo "ERROR: Failed to create ${BRANCH}" >&2; exit 1; }
fi

echo "Branch: ${BRANCH}"
