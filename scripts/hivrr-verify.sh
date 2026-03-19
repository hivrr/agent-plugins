#!/usr/bin/env bash
set -uo pipefail

# hivrr-verify.sh — run tests and lint for a project
# Detects test runner and linter, skips tests for docs-only changes.
# Prints: Verify: tests {pass|fail|skipped} | lint {pass|fail|skipped}
# Exits 0 if all pass, 1 if any fail.

# ---------------------------------------------------------------------------
# Repo root detection
# ---------------------------------------------------------------------------
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# Detect docs-only change
# ---------------------------------------------------------------------------
only_docs_changed() {
  local changed
  changed="$(git diff --name-only HEAD 2>/dev/null)"
  if [[ -z "$changed" ]]; then
    # Nothing staged — check working tree vs HEAD
    changed="$(git diff --name-only 2>/dev/null)"
  fi
  if [[ -z "$changed" ]]; then
    return 1
  fi
  # Return true (0) only if every changed file is docs/config
  while IFS= read -r f; do
    case "$f" in
      *.md|*.txt|*.rst|*.json|*.yaml|*.yml|*.toml|*.ini|*.cfg|LICENSE|CHANGELOG*|README*) ;;
      *) return 1 ;;
    esac
  done <<< "$changed"
  return 0
}

# ---------------------------------------------------------------------------
# Test detection and run
# ---------------------------------------------------------------------------
TEST_STATUS="skipped"

run_tests() {
  if only_docs_changed; then
    TEST_STATUS="skipped"
    return 0
  fi

  # npm test
  if [[ -f "package.json" ]] && grep -q '"test"' package.json 2>/dev/null; then
    if npm test --silent 2>&1; then
      TEST_STATUS="pass"
    else
      TEST_STATUS="fail"
      return 1
    fi
    return 0
  fi

  # jest standalone
  if [[ -f "jest.config.js" || -f "jest.config.ts" || -f "jest.config.mjs" || -f "jest.config.cjs" ]]; then
    if npx jest --passWithNoTests 2>&1; then
      TEST_STATUS="pass"
    else
      TEST_STATUS="fail"
      return 1
    fi
    return 0
  fi

  # pytest
  if [[ -f "pytest.ini" || -f "pyproject.toml" ]] && command -v pytest &>/dev/null; then
    if pytest 2>&1; then
      TEST_STATUS="pass"
    else
      TEST_STATUS="fail"
      return 1
    fi
    return 0
  fi

  # Makefile test target
  if [[ -f "Makefile" ]] && grep -q '^test' Makefile 2>/dev/null; then
    if make test 2>&1; then
      TEST_STATUS="pass"
    else
      TEST_STATUS="fail"
      return 1
    fi
    return 0
  fi

  TEST_STATUS="skipped"
  return 0
}

# ---------------------------------------------------------------------------
# Lint detection and run
# ---------------------------------------------------------------------------
LINT_STATUS="skipped"

run_lint() {
  # eslint
  if [[ -f ".eslintrc.js" || -f ".eslintrc.cjs" || -f ".eslintrc.json" || -f ".eslintrc.yaml" || -f ".eslintrc.yml" || -f ".eslintrc" ]]; then
    if npx eslint . 2>&1; then
      LINT_STATUS="pass"
    else
      LINT_STATUS="fail"
      return 1
    fi
    return 0
  fi

  # eslint via package.json
  if [[ -f "package.json" ]] && grep -q '"eslint"' package.json 2>/dev/null; then
    if npx eslint . 2>&1; then
      LINT_STATUS="pass"
    else
      LINT_STATUS="fail"
      return 1
    fi
    return 0
  fi

  # ruff
  if command -v ruff &>/dev/null; then
    if ruff check . 2>&1; then
      LINT_STATUS="pass"
    else
      LINT_STATUS="fail"
      return 1
    fi
    return 0
  fi

  # ruff via pyproject.toml
  if [[ -f "pyproject.toml" ]] && grep -q '\[tool\.ruff\]' pyproject.toml 2>/dev/null; then
    if python -m ruff check . 2>&1; then
      LINT_STATUS="pass"
    else
      LINT_STATUS="fail"
      return 1
    fi
    return 0
  fi

  # flake8
  if command -v flake8 &>/dev/null; then
    if flake8 . 2>&1; then
      LINT_STATUS="pass"
    else
      LINT_STATUS="fail"
      return 1
    fi
    return 0
  fi

  LINT_STATUS="skipped"
  return 0
}

# ---------------------------------------------------------------------------
# Run and report
# ---------------------------------------------------------------------------
FAILED=0

run_tests || FAILED=1
run_lint  || FAILED=1

echo "Verify: tests ${TEST_STATUS} | lint ${LINT_STATUS}"
exit "$FAILED"
