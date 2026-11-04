#!/usr/bin/env bash
# Tests for scripts/install.sh. Runs entirely inside a temporary HOME and a
# temporary copy of the repo used as the "live" clone; the real ~/.claude and
# ~/.mantra are never touched.
set -euo pipefail
unset CDPATH GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY
unset MANTRA_VENDOR

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
cp -R "$ROOT/agents" "$ROOT/rules" "$ROOT/scripts" "$ROOT/skills" "$ROOT/pstack" "$LIVE/"
agent_count=$(find "$LIVE/agents" -maxdepth 1 -name '*.md' | wc -l | tr -d ' ')
skill_count=$(find "$LIVE/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
SK1=$(find "$LIVE/skills" -mindepth 1 -maxdepth 1 -type d | sort | sed -n 1p | xargs basename)
SK2=$(find "$LIVE/skills" -mindepth 1 -maxdepth 1 -type d | sort | sed -n 2p | xargs basename)
PIN_COMMIT=$(sed -n 's/^commit=//p' "$LIVE/pstack/PIN")
PIN_PATH=$(sed -n 's/^path=//p' "$LIVE/pstack/PIN")

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
  env -u MANTRA_VENDOR HOME="$h" MANTRA_LIVE="$LIVE" bash "$LIVE/scripts/install.sh" "$@"
}

IOUT=''
IRC=0
install_rc() { # install_rc <home> [args...]: like install_in, but keeps the exit code (IRC) and output (IOUT)
  set +e
  IOUT=$(install_in "$@" 2>&1)
  IRC=$?
  set -e
}

install_vendor() { # install_vendor <home> <vendor>: install with MANTRA_VENDOR set; sets IOUT and IRC
  set +e
  IOUT=$(env MANTRA_VENDOR="$2" HOME="$1" MANTRA_LIVE="$LIVE" bash "$LIVE/scripts/install.sh" 2>&1)
  IRC=$?
  set -e
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

# --- real-HOME rule (simulated with the test-only MANTRA_TEST_REAL_HOME) ------
H="$TMP/rh"
mkdir -p "$H/.mantra"
cp -R "$LIVE" "$H/.mantra/live"
before=$(snapshot "$H")
set +e
out=$(HOME="$H" MANTRA_TEST_REAL_HOME="$H" MANTRA_LIVE="$LIVE" bash "$LIVE/scripts/install.sh" 2>&1)
rc=$?
set -e
check "real home: a live clone outside ~/.mantra/live is refused (exit 2)" test "$rc" -eq 2
check "real home: refusal names the required path" contains "$out" ".mantra/live"
check "real home: refusal changes nothing" test "$before" = "$(snapshot "$H")"
out=$(HOME="$H" MANTRA_TEST_REAL_HOME="$H" MANTRA_LIVE="$H/.mantra/live" bash "$H/.mantra/live/scripts/install.sh")
check "real home: ~/.mantra/live is accepted" is_symlink_to "$H/.claude/rules" "$H/.mantra/live/rules"

# --- a linked worktree is refused ----------------------------------------------
WT="$TMP/worktree-live"
cp -R "$LIVE" "$WT"
printf 'gitdir: /nonexistent/.git/worktrees/x\n' >"$WT/.git"
H=$(new_home wt)
before=$(snapshot "$H")
set +e
out=$(HOME="$H" MANTRA_LIVE="$WT" bash "$WT/scripts/install.sh" 2>&1)
rc=$?
set -e
check "linked worktree as live clone is refused (exit 2)" test "$rc" -eq 2
check "worktree refusal explains" contains "$out" "worktree"
check "worktree refusal changes nothing" test "$before" = "$(snapshot "$H")"

# --- agents that is not a directory is refused before ANY change ---------------
H="$TMP/notdir"
mkdir -p "$H/.claude"
echo "i am a file" >"$H/.claude/agents"
before=$(snapshot "$H")
set +e
out=$(install_in "$H" 2>&1)
rc=$?
set -e
check "agents is a regular file: exit 2" test "$rc" -eq 2
check "agents is a regular file: rules were not linked either" absent "$H/.claude/rules"
check "agents is a regular file: nothing changed" test "$before" = "$(snapshot "$H")"

# --- interrupted migration: resume instead of mkdir -----------------------------
H="$TMP/resume"
mkdir -p "$H/.claude/agents.migrating/web-search-modules"
: >"$H/.claude/agents.migrating/web-search-agent.md"
: >"$H/.claude/agents.migrating/web-search-modules/x.md"
before=$(snapshot "$H")
out=$(install_in "$H" --dry-run)
check "resume: --dry-run announces it" contains "$out" "resume"
check "resume: --dry-run changes nothing" test "$before" = "$(snapshot "$H")"
install_in "$H" >/dev/null
check "resume: staging dir moved into place" absent "$H/.claude/agents.migrating"
check "resume: preserved file survives" test -f "$H/.claude/agents/web-search-agent.md"
check "resume: preserved dir survives" test -f "$H/.claude/agents/web-search-modules/x.md"
links=$(find "$H/.claude/agents" -maxdepth 1 -type l | wc -l | tr -d ' ')
check "resume: agents are linked afterwards" test "$links" -eq "$agent_count"
before=$(snapshot "$H")
install_in "$H" >/dev/null
check "resume: second run changes nothing" test "$before" = "$(snapshot "$H")"

# --- stale staging dir next to a still-symlinked agents dir ----------------------
H=$(new_home stale)
mkdir -p "$H/.claude/agents.migrating"
: >"$H/.claude/agents.migrating/junk.md"
install_in "$H" >/dev/null
check "stale staging: moved aside, not reused" test -f "$(find "$H/.claude" -maxdepth 2 -path '*/agents.migrating.bak-*/junk.md' | head -1)"
check "stale staging: junk is not in agents" absent "$H/.claude/agents/junk.md"
check "stale staging: migration still completed" test -f "$H/.claude/agents/web-search-agent.md"

# --- copy failure cleans up the staging dir and keeps the old symlink -------------
if [ "$(id -u)" -ne 0 ]; then
  H=$(new_home cpfail)
  chmod 000 "$H/.mantra/generated/agents/web-search-agent.md"
  set +e
  out=$(install_in "$H" 2>&1)
  rc=$?
  set -e
  check "copy failure: install exits non-zero" test "$rc" -ne 0
  check "copy failure: staging dir removed" absent "$H/.claude/agents.migrating"
  check "copy failure: old agents symlink intact" is_symlink_to "$H/.claude/agents" "$H/.mantra/generated/agents"
  chmod 644 "$H/.mantra/generated/agents/web-search-agent.md"
  install_in "$H" >/dev/null
  check "copy failure: retry after fixing succeeds" test -f "$H/.claude/agents/web-search-agent.md"
else
  echo "skip copy-failure test (running as root)"
fi

# --- skills: links, backups, retirement, foreign links ---------------------------
check "fixture has at least two skills" test "$skill_count" -ge 2

H=$(new_home sk)
before=$(snapshot "$H")
out=$(install_in "$H" --dry-run)
check "skills: --dry-run changes nothing" test "$before" = "$(snapshot "$H")"
check "skills: --dry-run announces the links" contains "$out" "[dry-run] link: $H/.claude/skills/$SK1"

mkdir -p "$H/.claude/skills/other-real" "$H/.claude/skills/.hidden-real"
echo "mine" >"$H/.claude/skills/other-real/SKILL.md"
ln -s ../../.agents/skills/ext "$H/.claude/skills/ext-link"
ln -s "$TMP/outside-missing" "$H/.claude/skills/ext-dangling"
install_rc "$H"
check "skills: install exits 0" test "$IRC" -eq 0
check "skills: skills is a real directory" test -d "$H/.claude/skills" -a ! -L "$H/.claude/skills"
check "skills: $SK1 is a symlink to live/skills/$SK1" is_symlink_to "$H/.claude/skills/$SK1" "$LIVE/skills/$SK1"
check "skills: $SK2 is a symlink to live/skills/$SK2" is_symlink_to "$H/.claude/skills/$SK2" "$LIVE/skills/$SK2"
check "skills: $SK1/SKILL.md is readable through the link" test -f "$H/.claude/skills/$SK1/SKILL.md"
mantra_links=$(find "$H/.claude/skills" -maxdepth 1 -type l -lname "$LIVE/skills/*" | wc -l | tr -d ' ')
check "skills: exactly $skill_count links point into live/skills" test "$mantra_links" -eq "$skill_count"
check "skills: nothing was backed up (skills.bak absent)" absent "$H/.claude/skills.bak"
check "skills: a non-mantra real skill is untouched" test "$(cat "$H/.claude/skills/other-real/SKILL.md")" = "mine"
check "skills: a non-mantra symlink is untouched" is_symlink_to "$H/.claude/skills/ext-link" "../../.agents/skills/ext"
check "skills: a non-mantra dangling symlink is untouched" is_symlink_to "$H/.claude/skills/ext-dangling" "$TMP/outside-missing"
check "skills: a hidden non-mantra dir is untouched" test -d "$H/.claude/skills/.hidden-real"

before=$(snapshot "$H")
install_rc "$H"
check "skills: second run exits 0" test "$IRC" -eq 0
check "skills: second run changes nothing" test "$before" = "$(snapshot "$H")"
check "skills: second run reports no changes" contains "$IOUT" "no changes needed"
before=$(snapshot "$H")
install_in "$H" --dry-run >/dev/null
check "skills: dry-run after install changes nothing" test "$before" = "$(snapshot "$H")"

# A real directory with a mantra skill's name is moved aside, outside skills/.
H=$(new_home skbak)
mkdir -p "$H/.claude/skills/$SK1"
echo "my own copy" >"$H/.claude/skills/$SK1/SKILL.md"
install_rc "$H"
check "backup: install exits 0" test "$IRC" -eq 0
check "backup: the skill is now the live symlink" is_symlink_to "$H/.claude/skills/$SK1" "$LIVE/skills/$SK1"
bak=$(find "$H/.claude/skills.bak" -maxdepth 1 -name "$SK1.bak-*" 2>/dev/null | head -1)
check "backup: the real dir moved to skills.bak/$SK1.bak-*" test -f "$bak/SKILL.md"
check "backup: the backup kept its content" test "$(cat "$bak/SKILL.md")" = "my own copy"
check "backup: nothing named *.bak* inside skills/" test -z "$(find "$H/.claude/skills" -maxdepth 1 -name '*.bak*')"
before=$(snapshot "$H")
install_rc "$H"
check "backup: second run changes nothing" test "$before" = "$(snapshot "$H")"

# A real FILE with a mantra skill's name is moved aside too.
H=$(new_home skfile)
mkdir -p "$H/.claude/skills"
echo "a file" >"$H/.claude/skills/$SK2"
install_rc "$H"
check "backup (file): the skill is now the live symlink" is_symlink_to "$H/.claude/skills/$SK2" "$LIVE/skills/$SK2"
check "backup (file): the file was kept in skills.bak" test -f "$(find "$H/.claude/skills.bak" -maxdepth 1 -name "$SK2.bak-*" | head -1)"

# Retired skills: links into live whose target is gone are removed; others stay.
H=$(new_home skretire)
install_rc "$H"
ln -s "$LIVE/skills/retired-skill" "$H/.claude/skills/retired-skill"
ln -s "$TMP/elsewhere-missing" "$H/.claude/skills/foreign-dangling"
ln -s "$LIVE/skills/$SK1" "$H/.claude/skills/alias-of-live-skill"
install_rc "$H"
check "retired: a dangling link into live/skills is removed" absent "$H/.claude/skills/retired-skill"
check "retired: an unrelated dangling link is kept" test -L "$H/.claude/skills/foreign-dangling"
check "retired: a working link into live/skills is kept" test -L "$H/.claude/skills/alias-of-live-skill"
check "retired: the live skills still link" is_symlink_to "$H/.claude/skills/$SK1" "$LIVE/skills/$SK1"

# A link into live/skills with the right name but another spelling is repointed.
H=$(new_home skrelink)
mkdir -p "$H/.claude/skills"
ln -s "$LIVE/skills/$SK1/" "$H/.claude/skills/$SK1"
install_rc "$H"
check "relink: a live-clone link spelled differently is repointed" is_symlink_to "$H/.claude/skills/$SK1" "$LIVE/skills/$SK1"
check "relink: exit 0" test "$IRC" -eq 0

# A same-named symlink that points somewhere other than live: exit 1 BEFORE
# anything is changed (rules, agents and the other skills included).
deep_snapshot() { # layout and file contents of $1
  snapshot "$1"
  (cd "$1" && find . -type f | sort | while IFS= read -r f; do printf '%s ' "$f"; cksum <"$f"; done)
}
H=$(new_home skconflict)
mkdir -p "$H/.claude/skills" "$TMP/foreign-skill-src"
ln -s "$TMP/foreign-skill-src" "$H/.claude/skills/$SK1"
before=$(deep_snapshot "$H")
install_rc "$H"
check "conflict: install exits 1" test "$IRC" -eq 1
check "conflict: the foreign link is kept" is_symlink_to "$H/.claude/skills/$SK1" "$TMP/foreign-skill-src"
check "conflict: the output names the link" contains "$IOUT" "conflict: $H/.claude/skills/$SK1"
check "conflict: the output names the target" contains "$IOUT" "symlink to $TMP/foreign-skill-src"
check "conflict: the output tells the user to remove it themselves" contains "$IOUT" "remove the link yourself"
check "conflict: nothing was changed at all" test "$before" = "$(deep_snapshot "$H")"
check "conflict: the other skill was NOT linked" absent "$H/.claude/skills/$SK2"
check "conflict: rules were NOT relinked" is_symlink_to "$H/.claude/rules" "$H/.mantra/generated/rules"
check "conflict: agents is still the old symlink" is_symlink_to "$H/.claude/agents" "$H/.mantra/generated/agents"
check "conflict: no agent link was made" test -z "$(find "$H/.claude" -type l -lname "$LIVE/*")"
check "conflict: nothing was backed up" absent "$H/.claude/skills.bak"
install_rc "$H"
check "conflict: a second run still exits 1" test "$IRC" -eq 1
check "conflict: a second run still keeps the foreign link" is_symlink_to "$H/.claude/skills/$SK1" "$TMP/foreign-skill-src"
install_rc "$H" --dry-run
check "conflict: --dry-run reports it too (exit 1)" test "$IRC" -eq 1
check "conflict: --dry-run names the link" contains "$IOUT" "conflict: $H/.claude/skills/$SK1"
check "conflict: --dry-run changed nothing" test "$before" = "$(deep_snapshot "$H")"
ln -s "$TMP/foreign-skill-src" "$H/.claude/skills/$SK2"
install_rc "$H"
check "conflict: two foreign links are both reported" test "$(printf '%s\n' "$IOUT" | grep -c '^conflict: ')" -eq 2
unlink "$H/.claude/skills/$SK2"
unlink "$H/.claude/skills/$SK1"
install_rc "$H"
check "conflict: once the foreign link is removed, install succeeds" test "$IRC" -eq 0
check "conflict: and links the live skill" is_symlink_to "$H/.claude/skills/$SK1" "$LIVE/skills/$SK1"
check "conflict: and links rules" is_symlink_to "$H/.claude/rules" "$LIVE/rules"

# The shape of the real environment: ~/.claude/skills/deepen-request is a
# relative link to ../../.agents/skills/deepen-request, a real directory.
check "fixture: mantra ships a skill named deepen-request" test -d "$LIVE/skills/deepen-request"
H=$(new_home skagents)
mkdir -p "$H/.agents/skills/deepen-request" "$H/.claude/skills"
echo "someone else's deepen-request" >"$H/.agents/skills/deepen-request/SKILL.md"
ln -s ../../.agents/skills/deepen-request "$H/.claude/skills/deepen-request"
before=$(deep_snapshot "$H")
install_rc "$H"
check ".agents link: install exits 1" test "$IRC" -eq 1
check ".agents link: the output names the link and its target" contains "$IOUT" "conflict: $H/.claude/skills/deepen-request is a symlink to ../../.agents/skills/deepen-request"
check ".agents link: not a single byte under HOME changed" test "$before" = "$(deep_snapshot "$H")"
check ".agents link: nil-mode was not linked" absent "$H/.claude/skills/nil-mode"
check ".agents link: rules were not linked" is_symlink_to "$H/.claude/rules" "$H/.mantra/generated/rules"
check ".agents link: no live agent link was made" test -z "$(find "$H/.claude" -type l -lname "$LIVE/*")"
check ".agents link: the other tool's skill is intact" test "$(cat "$H/.agents/skills/deepen-request/SKILL.md")" = "someone else's deepen-request"
install_rc "$H" --dry-run
check ".agents link: --dry-run exits 1 too" test "$IRC" -eq 1
check ".agents link: --dry-run changed nothing" test "$before" = "$(deep_snapshot "$H")"
unlink "$H/.claude/skills/deepen-request"
install_rc "$H"
check ".agents link: after removing the link, install succeeds" test "$IRC" -eq 0
check ".agents link: deepen-request is now the live skill" is_symlink_to "$H/.claude/skills/deepen-request" "$LIVE/skills/deepen-request"
check ".agents link: nil-mode is linked" is_symlink_to "$H/.claude/skills/nil-mode" "$LIVE/skills/nil-mode"
check ".agents link: the .agents directory itself is untouched" test -f "$H/.agents/skills/deepen-request/SKILL.md"

# skills that is not a real directory is refused before any change.
H="$TMP/skfileabort"
mkdir -p "$H/.claude"
echo "i am a file" >"$H/.claude/skills"
before=$(snapshot "$H")
install_rc "$H"
check "skills is a regular file: exit 2" test "$IRC" -eq 2
check "skills is a regular file: rules were not linked" absent "$H/.claude/rules"
check "skills is a regular file: nothing changed" test "$before" = "$(snapshot "$H")"
H="$TMP/sklinkabort"
mkdir -p "$H/.claude" "$H/elsewhere"
ln -s "$H/elsewhere" "$H/.claude/skills"
before=$(snapshot "$H")
install_rc "$H"
check "skills is a symlink: exit 2" test "$IRC" -eq 2
check "skills is a symlink: nothing changed" test "$before" = "$(snapshot "$H")"

# --- pstack warnings (warn only; never fetch; never a change) -----------------------
H=$(new_home pstackwarn)
VEND="$TMP/pw-vendor"
install_rc "$H"
check "pstack: no vendor dir warns" contains "$IOUT" "warning: pstack is not installed"
check "pstack: the warning does not fail the install" test "$IRC" -eq 0
check "pstack: install fetched nothing" absent "$H/.mantra/vendor"
before=$(snapshot "$H")
install_rc "$H"
check "pstack: the warning does not break 'no changes needed'" contains "$IOUT" "no changes needed"
check "pstack: the warning changes nothing" test "$before" = "$(snapshot "$H")"

other_sha=0123456789abcdef0123456789abcdef01234567
mkdir -p "$VEND/pstack/$other_sha/$PIN_PATH"
ln -s "$VEND/pstack/$other_sha/$PIN_PATH" "$VEND/pstack/current"
install_vendor "$H" "$VEND"
check "pstack: a different commit warns" contains "$IOUT" "is not the pinned ${PIN_COMMIT:0:12}"
check "pstack: a different commit does not fail the install" test "$IRC" -eq 0

unlink "$VEND/pstack/current"
ln -s "$VEND/pstack/$PIN_COMMIT/$PIN_PATH" "$VEND/pstack/current"
install_vendor "$H" "$VEND"
check "pstack: a dangling current warns" contains "$IOUT" "does not exist"

# A directory that is not a git checkout of the pinned commit is not "ok".
mkdir -p "$VEND/pstack/$PIN_COMMIT/$PIN_PATH"
install_vendor "$H" "$VEND"
check "pstack: a plain directory at the pinned path warns" contains "$IOUT" "does not match the pin"
check "pstack: a plain directory does not fail the install" test "$IRC" -eq 0

# From here the live clone pins a commit of a real local repo, so that a
# checkout of it can exist (git env: no global config, no signing).
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
FAKE_UP="$TMP/fake-upstream"
mkdir -p "$FAKE_UP/$PIN_PATH/.claude-plugin"
git init -q -b main "$FAKE_UP"
printf '{\n  "version": "1.0.0"\n}\n' >"$FAKE_UP/$PIN_PATH/.claude-plugin/plugin.json"
echo "one" >"$FAKE_UP/$PIN_PATH/tracked.txt"
git -C "$FAKE_UP" add -A
git -C "$FAKE_UP" -c user.name=t -c user.email=t@example.invalid -c commit.gpgsign=false commit -q -m one
PIN_COMMIT=$(git -C "$FAKE_UP" rev-parse HEAD)
sed -i.bak "s/^commit=.*/commit=$PIN_COMMIT/" "$LIVE/pstack/PIN"
rm -f "$LIVE/pstack/PIN.bak"
VEND="$TMP/pw-vendor2"
mkdir -p "$VEND/pstack"
cp -R "$FAKE_UP" "$VEND/pstack/$PIN_COMMIT"
ln -s "$VEND/pstack/$PIN_COMMIT/$PIN_PATH" "$VEND/pstack/current"
vend_before=$(snapshot "$VEND")

install_vendor "$H" "$VEND"
check "pstack: the pinned commit gives no warning" test -z "$(printf '%s\n' "$IOUT" | grep '^warning:' || true)"
check "pstack: the pinned commit is reported ok" contains "$IOUT" "ok: pstack ${PIN_COMMIT:0:12}"
check "pstack: the pinned commit leaves the exit code 0" test "$IRC" -eq 0
check "pstack: install never wrote into the vendor dir" test "$vend_before" = "$(snapshot "$VEND")"

echo "noise" >"$VEND/pstack/$PIN_COMMIT/$PIN_PATH/untracked.txt"
install_vendor "$H" "$VEND"
check "pstack: an untracked file is not a warning" test -z "$(printf '%s\n' "$IOUT" | grep '^warning:' || true)"

echo "evil" >>"$VEND/pstack/$PIN_COMMIT/$PIN_PATH/tracked.txt"
vend_before=$(snapshot "$VEND")
home_before=$(snapshot "$H")
install_vendor "$H" "$VEND"
check "pstack: a modified tracked file warns" contains "$IOUT" "warning: pstack checkout $VEND/pstack/$PIN_COMMIT does not match the pin"
check "pstack: the warning names the fix" contains "$IOUT" "scripts/pstack.sh"
check "pstack: the tamper warning leaves the exit code 0" test "$IRC" -eq 0
check "pstack: the tamper warning changes nothing in the vendor dir" test "$vend_before" = "$(snapshot "$VEND")"
check "pstack: the tamper warning is not a change" contains "$IOUT" "no changes needed"
check "pstack: the tamper warning leaves HOME alone" test "$home_before" = "$(snapshot "$H")"
git -C "$VEND/pstack/$PIN_COMMIT" checkout -q -- .

# A symlinked <commit>/ pointing at another checkout with the right HEAD.
mv "$VEND/pstack/$PIN_COMMIT" "$TMP/pw-elsewhere"
ln -s "$TMP/pw-elsewhere" "$VEND/pstack/$PIN_COMMIT"
install_vendor "$H" "$VEND"
check "pstack: a symlinked checkout warns" contains "$IOUT" "does not match the pin"
check "pstack: a symlinked checkout leaves the exit code 0" test "$IRC" -eq 0
unlink "$VEND/pstack/$PIN_COMMIT"
mv "$TMP/pw-elsewhere" "$VEND/pstack/$PIN_COMMIT"
install_vendor "$H" "$VEND"
check "pstack: restored checkout is ok again" contains "$IOUT" "ok: pstack ${PIN_COMMIT:0:12}"

# A checkout's own git config cannot run code when install looks at it.
printf '#!/bin/sh\ntouch "%s/pwned-fsmonitor"\n' "$TMP" >"$TMP/fsmon.sh"
chmod +x "$TMP/fsmon.sh"
git -C "$VEND/pstack/$PIN_COMMIT" config core.fsmonitor "$TMP/fsmon.sh"
install_vendor "$H" "$VEND"
check "pstack: core.fsmonitor in the checkout is not executed" absent "$TMP/pwned-fsmonitor"
git -C "$VEND/pstack/$PIN_COMMIT" config --unset core.fsmonitor

# --- fresh HOME --------------------------------------------------------------
H="$TMP/fresh"
mkdir -p "$H"
install_in "$H" >/dev/null
check "fresh HOME gets rules link" is_symlink_to "$H/.claude/rules" "$LIVE/rules"
check "fresh HOME gets real agents dir" test -d "$H/.claude/agents" -a ! -L "$H/.claude/agents"

echo "install.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
