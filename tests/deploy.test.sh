#!/usr/bin/env bash
# Tests for scripts/deploy.sh against a throwaway local "origin". Uses a
# temporary HOME and temporary repos only; nothing is pushed anywhere real.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)

# Hermetic git: ignore the caller's global and system configuration.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

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

is_symlink_to() { [ -L "$1" ] && [ "$(readlink "$1")" = "$2" ]; }
absent() { [ ! -e "$1" ] && [ ! -L "$1" ]; }
contains() { printf '%s' "$1" | grep -Fq -- "$2"; }

GIT_ID=(-c user.name=test -c user.email=test@example.invalid -c commit.gpgsign=false)

# Throwaway origin: current working-tree files committed on main.
SRC="$TMP/src"
mkdir -p "$SRC"
cp -R "$ROOT/agents" "$ROOT/rules" "$ROOT/scripts" "$SRC/"
git init -q -b main "$SRC"
git -C "$SRC" add -A
git -C "$SRC" "${GIT_ID[@]}" commit -q -m "initial"
git clone -q --bare "$SRC" "$TMP/origin.git"
git clone -q "$TMP/origin.git" "$TMP/work"

HOME_DIR="$TMP/home"
LIVE="$HOME_DIR/.mantra/live"
mkdir -p "$HOME_DIR"

deploy() { HOME="$HOME_DIR" MANTRA_LIVE="$LIVE" bash "$TMP/work/scripts/deploy.sh" "$@"; }

# --- missing live clone ------------------------------------------------------
set +e
out=$(deploy 2>&1)
rc=$?
set -e
check "without --init and no live clone: exit 1" test "$rc" -eq 1
check "prints the clone command" contains "$out" "git clone $TMP/origin.git $LIVE"
check "nothing was cloned" absent "$LIVE"

out=$(deploy --init --dry-run)
check "--init --dry-run previews the clone" contains "$out" "[dry-run] git clone"
check "--init --dry-run clones nothing" absent "$LIVE"

# --- init ----------------------------------------------------------------------
deploy --init >"$TMP/init.out"
check "--init creates the live clone" test -d "$LIVE/.git"
check "live is at origin/main" test "$(git -C "$LIVE" rev-parse HEAD)" = "$(git -C "$TMP/origin.git" rev-parse main)"
check "live HEAD is detached" test -z "$(git -C "$LIVE" branch --show-current)"
check "rules linked to live" is_symlink_to "$HOME_DIR/.claude/rules" "$LIVE/rules"
check "agents linked to live" is_symlink_to "$HOME_DIR/.claude/agents/planner.md" "$LIVE/agents/planner.md"

# --- pick up a new origin commit (and retire an agent) ------------------------
git -C "$TMP/work" "${GIT_ID[@]}" rm -q agents/mob-critic.md
git -C "$TMP/work" "${GIT_ID[@]}" commit -q -m "retire mob-critic"
git -C "$TMP/work" push -q origin HEAD:main
new_head=$(git -C "$TMP/origin.git" rev-parse main)

out=$(deploy --dry-run)
check "--dry-run does not move live" test "$(git -C "$LIVE" rev-parse HEAD)" != "$new_head"
check "--dry-run says it will not check out" contains "$out" "would run: git -C"
check "--dry-run leaves the agent link" is_symlink_to "$HOME_DIR/.claude/agents/mob-critic.md" "$LIVE/agents/mob-critic.md"

deploy >/dev/null
check "deploy moves live to the new origin/main" test "$(git -C "$LIVE" rev-parse HEAD)" = "$new_head"
check "retired agent link removed" absent "$HOME_DIR/.claude/agents/mob-critic.md"

out=$(deploy)
check "redeploy with no new commit installs nothing" contains "$out" "no changes needed"

# --- dirty live clone is refused ------------------------------------------------
echo dirty >"$LIVE/untracked-file"
set +e
out=$(deploy 2>&1)
rc=$?
set -e
check "dirty live clone: exit 1" test "$rc" -eq 1
check "dirty live clone: explains" contains "$out" "uncommitted changes"

echo "deploy.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
