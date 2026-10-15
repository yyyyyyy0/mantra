#!/usr/bin/env bash
# Tests for scripts/install.sh. Runs entirely inside a temporary HOME and a
# temporary copy of the repo used as the "live" clone; the real ~/.claude and
# ~/.mantra are never touched.
set -euo pipefail

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

# --- fixtures ----------------------------------------------------------------
LIVE="$TMP/live"
mkdir -p "$LIVE"
cp -R "$ROOT/agents" "$ROOT/rules" "$ROOT/scripts" "$LIVE/"
agent_count=$(find "$LIVE/agents" -maxdepth 1 -name '*.md' | wc -l | tr -d ' ')

new_home() {
  local h="$TMP/$1"
  mkdir -p "$h/.mantra/generated/agents/web-search-modules" "$h/.mantra/generated/rules" "$h/.claude"
  : >"$h/.mantra/generated/agents/planner.md"
  : >"$h/.mantra/generated/agents/architect.md"
  : >"$h/.mantra/generated/agents/web-search-agent.md"
  : >"$h/.mantra/generated/agents/web-search-modules/x.md"
  ln -s "$h/.mantra/generated/agents" "$h/.claude/agents"
  ln -s "$h/.mantra/generated/rules" "$h/.claude/rules"
  printf '%s' "$h"
}

install_in() { # install_in <home> [args...]
  local h=$1
  shift
  HOME="$h" MANTRA_LIVE="$LIVE" bash "$LIVE/scripts/install.sh" "$@"
}

snapshot() {
  (cd "$1" && find . -ls | sort)
}

is_symlink_to() { [ -L "$1" ] && [ "$(readlink "$1")" = "$2" ]; }
absent() { [ ! -e "$1" ] && [ ! -L "$1" ]; }
contains() { printf '%s' "$1" | grep -Fq -- "$2"; }

# --- refusal when run from somewhere other than the live clone ---------------
H=$(new_home refuse)
before=$(snapshot "$H")
set +e
out=$(HOME="$H" MANTRA_LIVE="$LIVE" bash "$ROOT/scripts/install.sh" 2>&1)
rc=$?
set -e
check "refuses (exit 2) when repo != live" test "$rc" -eq 2
check "refusal explains why" contains "$out" "refusing"
check "refusal changes nothing" test "$before" = "$(snapshot "$H")"

set +e
out=$(HOME="$H" MANTRA_LIVE="$TMP/does-not-exist" bash "$LIVE/scripts/install.sh" 2>&1)
rc=$?
set -e
check "refuses (exit 2) when the live clone is missing" test "$rc" -eq 2

# --- dry run -----------------------------------------------------------------
H=$(new_home dry)
before=$(snapshot "$H")
out=$(install_in "$H" --dry-run)
check "--dry-run changes nothing" test "$before" = "$(snapshot "$H")"
check "--dry-run reports actions" contains "$out" "[dry-run]"
check "--dry-run reports migration" contains "$out" "migrate"
check "--dry-run keeps the old agents symlink" test -L "$H/.claude/agents"

# --- real install over the old layout ----------------------------------------
H=$(new_home real)
install_in "$H" >"$TMP/install1.out"
check "rules is a symlink to live/rules" is_symlink_to "$H/.claude/rules" "$LIVE/rules"
check "agents is a real directory" test -d "$H/.claude/agents" -a ! -L "$H/.claude/agents"

links=$(find "$H/.claude/agents" -maxdepth 1 -type l | wc -l | tr -d ' ')
check "agents contains exactly $agent_count symlinks" test "$links" -eq "$agent_count"
all_into_live=1
for l in "$H"/.claude/agents/*; do
  if [ -L "$l" ] && ! is_symlink_to "$l" "$LIVE/agents/$(basename "$l")"; then all_into_live=0; fi
done
check "every agent symlink points into live/agents" test "$all_into_live" -eq 1
check "web-search-agent.md preserved" test -f "$H/.claude/agents/web-search-agent.md" -a ! -L "$H/.claude/agents/web-search-agent.md"
check "web-search-modules/ preserved" test -f "$H/.claude/agents/web-search-modules/x.md"
check "legacy architect.md is gone" absent "$H/.claude/agents/architect.md"
check "legacy planner.md is now the live symlink" is_symlink_to "$H/.claude/agents/planner.md" "$LIVE/agents/planner.md"
check "old generated dir is left untouched" test -f "$H/.mantra/generated/agents/architect.md"
check "no settings.json created" absent "$H/.claude/settings.json"

# --- idempotency --------------------------------------------------------------
before=$(snapshot "$H")
out=$(install_in "$H")
check "second run changes nothing" test "$before" = "$(snapshot "$H")"
check "second run reports no changes" contains "$out" "no changes needed"
before=$(snapshot "$H")
install_in "$H" --dry-run >/dev/null
check "dry-run after install changes nothing" test "$before" = "$(snapshot "$H")"

# --- retired agents are unlinked ----------------------------------------------
ln -s "$LIVE/agents/retired-agent.md" "$H/.claude/agents/retired-agent.md"
ln -s "$TMP/elsewhere-missing" "$H/.claude/agents/foreign-dangling.md"
install_in "$H" >/dev/null
check "dangling link into live/agents is removed" absent "$H/.claude/agents/retired-agent.md"
check "unrelated dangling link is kept" test -L "$H/.claude/agents/foreign-dangling.md"

# --- real rules dir and real agent file are backed up ---------------------------
H="$TMP/backups"
mkdir -p "$H/.claude/rules" "$H/.claude/agents"
echo old >"$H/.claude/rules/old.md"
echo mine >"$H/.claude/agents/planner.md"
install_in "$H" >/dev/null
check "real rules dir moved to rules.bak-*" test -f "$(find "$H/.claude" -maxdepth 2 -path '*/rules.bak-*/old.md' | head -1)"
check "rules is now a symlink to live/rules" is_symlink_to "$H/.claude/rules" "$LIVE/rules"
check "real planner.md moved to planner.md.bak-*" test -n "$(find "$H/.claude/agents" -maxdepth 1 -name 'planner.md.bak-*' | head -1)"
check "planner.md is now the live symlink" is_symlink_to "$H/.claude/agents/planner.md" "$LIVE/agents/planner.md"
before=$(snapshot "$H")
install_in "$H" >/dev/null
check "second run after backups changes nothing" test "$before" = "$(snapshot "$H")"

# --- fresh HOME --------------------------------------------------------------
H="$TMP/fresh"
mkdir -p "$H"
install_in "$H" >/dev/null
check "fresh HOME gets rules link" is_symlink_to "$H/.claude/rules" "$LIVE/rules"
check "fresh HOME gets real agents dir" test -d "$H/.claude/agents" -a ! -L "$H/.claude/agents"

echo "install.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
