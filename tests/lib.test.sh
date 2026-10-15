#!/usr/bin/env bash
# Tests for scripts/lib.sh: the real-HOME rule is exercised by calling the
# check directly with an injected "true home", so no test needs to touch the
# real home directory or weaken the rule through an environment variable.
set -euo pipefail
unset CDPATH GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)

TMP=$(mktemp -d)
cleanup() {
  if [ -n "${TMP:-}" ] && [ -d "$TMP" ]; then
    rm -rf -- "$TMP" || true
  fi
}
trap cleanup EXIT

pass=0
fail=0

check() {
  local desc=$1
  shift
  if "$@"; then
    pass=$((pass + 1))
    echo "ok   $desc"
  else
    fail=$((fail + 1))
    echo "FAIL $desc"
  fi
}

# rule <true-home | FAIL> <HOME> <MANTRA_TEST_REAL_HOME or ''> <live path>
# Returns the check's status. mantra_true_home is replaced after sourcing.
# shellcheck disable=SC2030,SC2031  # HOME and the override are meant to be local to the subshell
rule() {
  (
    # shellcheck disable=SC1091
    . "$ROOT/scripts/lib.sh"
    if [ "$1" = FAIL ]; then
      mantra_true_home() { return 1; }
    else
      TRUE_HOME=$1
      mantra_true_home() { printf '%s' "$TRUE_HOME"; }
    fi
    HOME=$2
    if [ -n "$3" ]; then
      export MANTRA_TEST_REAL_HOME=$3
    else
      unset MANTRA_TEST_REAL_HOME
    fi
    mantra_check_real_home_rule lib.test "$4"
  ) >/dev/null 2>&1
}
accepts() { rule "$@"; }
refuses() { ! rule "$@"; }

TH="$TMP/truehome"
OTHER="$TMP/other"
mkdir -p "$TH/.mantra/live" "$OTHER/.mantra/live" "$TMP/elsewhere"

# --- the true home -------------------------------------------------------------
check "true home + live at ~/.mantra/live: accepted" accepts "$TH" "$TH" "" "$TH/.mantra/live"
check "true home + other live path: refused" refuses "$TH" "$TH" "" "$TMP/elsewhere"
check "true home + override /nonexistent + other live path: still refused" \
  refuses "$TH" "$TH" /nonexistent "$TMP/elsewhere"
check "true home + override pointing at the live path itself: still refused" \
  refuses "$TH" "$TH" "$TMP/elsewhere" "$TMP/elsewhere"
check "true home + override /nonexistent + correct live path: accepted" \
  accepts "$TH" "$TH" /nonexistent "$TH/.mantra/live"

# --- a different (temp) HOME ------------------------------------------------------
check "temp HOME without override: not restricted" accepts "$TH" "$OTHER" "" "$TMP/elsewhere"
check "temp HOME equal to the override: other live path refused" \
  refuses "$TH" "$OTHER" "$OTHER" "$TMP/elsewhere"
check "temp HOME equal to the override: ~/.mantra/live accepted" \
  accepts "$TH" "$OTHER" "$OTHER" "$OTHER/.mantra/live"
check "override for a different home does not restrict this HOME" \
  accepts "$TH" "$OTHER" "$TMP/unrelated" "$TMP/elsewhere"

# --- the account database cannot be read: fail closed --------------------------------
check "lookup fails + HOME outside any temp root: refused" \
  refuses FAIL /nonexistent-home "" "$TMP/elsewhere"
check "lookup fails + HOME outside any temp root: refused even at ~/.mantra/live" \
  refuses FAIL /nonexistent-home "" /nonexistent-home/.mantra/live
check "lookup fails + temp HOME: accepted" accepts FAIL "$OTHER" "" "$TMP/elsewhere"
check "lookup fails + temp HOME equal to the override: restricted" \
  refuses FAIL "$OTHER" "$OTHER" "$TMP/elsewhere"
check "lookup fails + HOME under /tmp: accepted" accepts FAIL /tmp/mantra-lib-test-home "" "$TMP/elsewhere"

# --- the real lookup ---------------------------------------------------------------------
real=$(
  # shellcheck disable=SC1091
  . "$ROOT/scripts/lib.sh"
  mantra_true_home || true
)
if [ -n "$real" ]; then
  check "mantra_true_home returns an absolute path" test "${real#/}" != "$real"
  check "mantra_true_home ignores a faked HOME" test "$(HOME=/definitely/not/home bash -c ". '$ROOT/scripts/lib.sh'; mantra_true_home")" = "$real"
else
  echo "skip mantra_true_home checks (no passwd entry for this user)"
fi

echo "lib.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
