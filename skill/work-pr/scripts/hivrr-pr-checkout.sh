#!/usr/bin/env bash
set -uo pipefail

# hivrr-pr-checkout.sh — check out a PR branch and pull latest
# Usage: hivrr-pr-checkout.sh --branch <branch_name>

usage() {
  echo "Usage: hivrr-pr-checkout.sh --branch <branch_name>" >&2
  exit 1
}

BRANCH_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      BRANCH_NAME="${2:-}"
      [[ -z "$BRANCH_NAME" ]] && { echo "ERROR: --branch requires a value" >&2; usage; }
      shift 2
      ;;
    *)
      echo "ERROR: Unknown flag: $1" >&2
      usage
      ;;
  esac
done

[[ -z "$BRANCH_NAME" ]] && { echo "ERROR: --branch is required" >&2; usage; }

# Warn if working tree is dirty, but continue
if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  echo "WARNING: Working tree has uncommitted changes — continuing anyway"
fi

# Checkout and pull
git checkout "${BRANCH_NAME}" || { echo "ERROR: Failed to checkout ${BRANCH_NAME}" >&2; exit 1; }
git pull origin "${BRANCH_NAME}" || { echo "ERROR: Failed to pull ${BRANCH_NAME}" >&2; exit 1; }

echo "Branch: ${BRANCH_NAME}"
