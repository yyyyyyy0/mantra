#!/usr/bin/env bash
# Tests for scripts/deploy.sh against a throwaway local "origin". Uses a
# temporary HOME and temporary repos only; nothing is pushed anywhere real.
set -euo pipefail
unset CDPATH GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)

# Hermetic git: ignore the caller's global and system configuration.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
# deploy.sh runs verify.sh on the exported tree; do not run the suite again.
export MANTRA_VERIFY_NESTED=1

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
snapshot() { (cd "$1" && find . -ls | sort); }

GIT_ID=(-c user.name=test -c user.email=test@example.invalid -c commit.gpgsign=false)

# Throwaway origin: current working-tree files committed on main.
SRC="$TMP/src"
mkdir -p "$SRC"
cp -R "$ROOT/agents" "$ROOT/rules" "$ROOT/scripts" "$ROOT/hooks" "$SRC/"
git init -q -b main "$SRC"
git -C "$SRC" add -A
git -C "$SRC" "${GIT_ID[@]}" commit -q -m "initial"
git clone -q --bare "$SRC" "$TMP/origin.git"
git clone -q "$TMP/origin.git" "$TMP/work"

HOME_DIR="$TMP/home"
LIVE="$HOME_DIR/.mantra/live"
mkdir -p "$HOME_DIR"

deploy() { HOME="$HOME_DIR" MANTRA_LIVE="$LIVE" bash "$TMP/work/scripts/deploy.sh" "$@"; }
live_head() { git -C "$LIVE" rev-parse HEAD; }
origin_head() { git -C "$TMP/origin.git" rev-parse main; }
work_commit() { # work_commit <message>  (stages everything, commits, pushes to the temp origin)
  git -C "$TMP/work" add -A
  git -C "$TMP/work" "${GIT_ID[@]}" commit -q -m "$1"
  git -C "$TMP/work" push -q origin HEAD:main
}

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
deploy --init >"$TMP/init.out" 2>&1
check "--init creates the live clone" test -d "$LIVE/.git"
check "--init verified origin/main first" contains "$(cat "$TMP/init.out")" "verify:"
check "live is at origin/main" test "$(live_head)" = "$(origin_head)"
check "live HEAD is detached" test -z "$(git -C "$LIVE" branch --show-current)"
check "rules linked to live" is_symlink_to "$HOME_DIR/.claude/rules" "$LIVE/rules"
check "agents linked to live" is_symlink_to "$HOME_DIR/.claude/agents/planner.md" "$LIVE/agents/planner.md"
c1=$(live_head)

# --- pick up a new origin commit (and retire an agent) ------------------------
git -C "$TMP/work" "${GIT_ID[@]}" rm -q agents/mob-critic.md
work_commit "retire mob-critic"
c2=$(origin_head)

out=$(deploy --dry-run 2>&1)
check "--dry-run does not move live" test "$(live_head)" = "$c1"
check "--dry-run lists the incoming commits" contains "$out" "retire mob-critic"
check "--dry-run lists the changed files (--stat)" contains "$out" "agents/mob-critic.md"
check "--dry-run says it will not check out" contains "$out" "would run: git -C"
check "--dry-run leaves the agent link" is_symlink_to "$HOME_DIR/.claude/agents/mob-critic.md" "$LIVE/agents/mob-critic.md"

deploy >/dev/null 2>&1
check "deploy moves live to the new origin/main" test "$(live_head)" = "$c2"
check "retired agent link removed" absent "$HOME_DIR/.claude/agents/mob-critic.md"

out=$(deploy 2>&1)
check "redeploy with no new commit installs nothing" contains "$out" "no changes needed"

# --- a commit that fails verification must not be checked out --------------------
sed -i.bak 's/^model: opus$/model: gpt/' "$TMP/work/agents/planner.md"
rm -f -- "$TMP/work/agents/planner.md.bak"
work_commit "break planner frontmatter"
before=$(snapshot "$HOME_DIR/.claude")
set +e
out=$(deploy 2>&1)
rc=$?
set -e
check "failing verification: exit non-zero" test "$rc" -ne 0
check "failing verification: says so" contains "$out" "failed verification"
check "failing verification: old HEAD still checked out" test "$(live_head)" = "$c2"
check "failing verification: live tree still clean" test -z "$(git -C "$LIVE" status --porcelain)"
check "failing verification: ~/.claude untouched" test "$before" = "$(snapshot "$HOME_DIR/.claude")"

git -C "$TMP/work" checkout -q "$c2" -- agents/planner.md
work_commit "fix planner frontmatter"
c4=$(origin_head)
deploy >/dev/null 2>&1
check "fixed commit deploys" test "$(live_head)" = "$c4"

# --- non-fast-forward origin/main is refused unless --force -----------------------
git -C "$TMP/work" reset -q --hard "$c2"
echo "rewritten" >"$TMP/work/NOTE"
git -C "$TMP/work" add -A
git -C "$TMP/work" "${GIT_ID[@]}" commit -q -m "rewritten history"
git -C "$TMP/work" push -q --force origin HEAD:main
c5=$(origin_head)
set +e
out=$(deploy 2>&1)
rc=$?
set -e
check "non-fast-forward: exit 1" test "$rc" -eq 1
check "non-fast-forward: explains" contains "$out" "non-fast-forward"
check "non-fast-forward: live HEAD unchanged" test "$(live_head)" = "$c4"
deploy --force >/dev/null 2>&1
check "--force accepts the rewrite" test "$(live_head)" = "$c5"

# --- install.sh failure restores the previous HEAD -----------------------------
printf '#!/usr/bin/env bash\nexit 1\n' >"$TMP/work/scripts/install.sh"
work_commit "install.sh that fails"
set +e
out=$(deploy 2>&1)
rc=$?
set -e
check "install failure: exit non-zero" test "$rc" -ne 0
check "install failure: says it restored" contains "$out" "restoring the live clone"
check "install failure: previous HEAD checked out again" test "$(live_head)" = "$c5"
check "install failure: live tree clean" test -z "$(git -C "$LIVE" status --porcelain)"
git -C "$TMP/work" reset -q --hard "$c5"
git -C "$TMP/work" push -q --force origin HEAD:main

# --- dirty live clone is refused ------------------------------------------------
echo dirty >"$LIVE/untracked-file"
set +e
out=$(deploy 2>&1)
rc=$?
set -e
check "dirty live clone: exit 1" test "$rc" -eq 1
check "dirty live clone: explains" contains "$out" "uncommitted changes"
rm -f -- "$LIVE/untracked-file"

# --- live path must be a clone of its own -----------------------------------------
OUTER="$TMP/outer"
mkdir -p "$OUTER/sub"
git init -q -b main "$OUTER"
set +e
out=$(HOME="$HOME_DIR" MANTRA_LIVE="$OUTER/sub" bash "$TMP/work/scripts/deploy.sh" 2>&1)
rc=$?
set -e
check "live path inside another repo: exit 2" test "$rc" -eq 2
check "live path inside another repo: explains" contains "$out" "not a clone of its own"

git -C "$LIVE" worktree add -q --detach "$TMP/linked-worktree" HEAD
set +e
out=$(HOME="$HOME_DIR" MANTRA_LIVE="$TMP/linked-worktree" bash "$TMP/work/scripts/deploy.sh" 2>&1)
rc=$?
set -e
check "linked worktree as live clone: exit 2" test "$rc" -eq 2
check "linked worktree as live clone: explains" contains "$out" "worktree"

# --- real-HOME rule (simulated with the test-only MANTRA_TEST_REAL_HOME) ---------
before=$(git -C "$LIVE" rev-parse HEAD)
set +e
out=$(HOME="$HOME_DIR" MANTRA_TEST_REAL_HOME="$HOME_DIR" MANTRA_LIVE="$TMP/linked-worktree" bash "$TMP/work/scripts/deploy.sh" 2>&1)
rc=$?
set -e
check "real home: a live path other than ~/.mantra/live is refused (exit 2)" test "$rc" -eq 2
check "real home: refusal names the required path" contains "$out" ".mantra/live"
out=$(HOME="$HOME_DIR" MANTRA_TEST_REAL_HOME="$HOME_DIR" MANTRA_LIVE="$LIVE" bash "$TMP/work/scripts/deploy.sh" 2>&1)
check "real home: ~/.mantra/live is accepted" contains "$out" "live is already at origin/main"
check "real home: live HEAD unchanged by the refusal" test "$(live_head)" = "$before"

echo "deploy.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
