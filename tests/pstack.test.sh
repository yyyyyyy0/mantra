#!/usr/bin/env bash
# Tests for scripts/pstack.sh. The "upstream" is a local bare repo built here;
# nothing touches the network, the real ~/.claude, ~/.mantra or any real
# vendor directory.
set -euo pipefail
unset CDPATH GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY
unset MANTRA_VENDOR MANTRA_PSTACK_REPO

# Hermetic git: ignore the caller's global and system configuration.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)

# pwd -P: on macOS mktemp gives /var/..., which is a symlink to /private/var.
TMP=$(cd "$(mktemp -d)" && pwd -P)
cleanup() {
  if [ -n "${TMP:-}" ] && [ -d "$TMP" ]; then
    chmod -R u+w "$TMP" 2>/dev/null || true
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
count_matching() { # count_matching <dir> <name glob>
  find "$1" -maxdepth 1 -name "$2" 2>/dev/null | wc -l | tr -d ' '
}

GIT_ID=(-c user.name=test -c user.email=test@example.invalid -c commit.gpgsign=false)
PLUGIN_PATH=harness/pstack/claude-code

# --- the fake upstream -------------------------------------------------------
UP="$TMP/upstream"
mkdir -p "$UP"
git init -q -b main "$UP"

write_plugin() { # write_plugin <version> [skip-poteto]
  local d="$UP/$PLUGIN_PATH"
  rm -rf -- "$UP/harness"
  mkdir -p "$d/.claude-plugin" "$d/skills/poteto-mode" "$d/docs/harness" "$UP/harness/other"
  printf '{\n  "name": "pstack",\n  "version": "%s"\n}\n' "$1" >"$d/.claude-plugin/plugin.json"
  printf 'poteto-mode %s\n' "$1" >"$d/skills/poteto-mode/SKILL.md"
  printf 'claude-code %s\n' "$1" >"$d/docs/harness/claude-code.md"
  echo "not part of the plugin" >"$UP/harness/other/x.md"
  echo "readme" >"$UP/README.md"
  if [ "${2:-}" = "skip-poteto" ]; then rm -rf -- "$d/skills/poteto-mode"; fi
}
commit_all() {
  git -C "$UP" add -A
  git -C "$UP" "${GIT_ID[@]}" commit -q -m "$1"
  git -C "$UP" rev-parse HEAD
}

write_plugin 1.2.3
SHA_A=$(commit_all "A")
write_plugin 1.2.4
SHA_B=$(commit_all "B")
write_plugin 1.2.5 skip-poteto
SHA_NOPOTETO=$(commit_all "no poteto-mode")
git clone -q --bare "$UP" "$TMP/upstream.git"
# Fetching a commit by SHA must not depend on the git protocol version in use.
git -C "$TMP/upstream.git" config uploadpack.allowAnySHA1InWant true
REPO_URL="$TMP/upstream.git"

# --- a copy of the scripts with its own PIN -------------------------------------
MANTRA="$TMP/mantra"
mkdir -p "$MANTRA/scripts" "$MANTRA/pstack"
cp "$ROOT/scripts/pstack.sh" "$ROOT/scripts/lib.sh" "$MANTRA/scripts/"

write_pin() { # write_pin <commit> <version> [path]
  printf 'repo=https://invalid.example/never-used.git\ncommit=%s\npath=%s\nversion=%s\n' \
    "$1" "${3:-$PLUGIN_PATH}" "$2" >"$MANTRA/pstack/PIN"
}

export HOME="$TMP/home"
mkdir -p "$HOME"
export MANTRA_PSTACK_REPO="$REPO_URL"
VENDOR="$TMP/vendor"
export MANTRA_VENDOR="$VENDOR"
BASE="$VENDOR/pstack"

OUT=''
RC=0
run_pstack() { # run_pstack [args...]; sets OUT and RC
  set +e
  OUT=$(bash "$MANTRA/scripts/pstack.sh" "$@" 2>&1)
  RC=$?
  set -e
}

run_pstack_env() { # run_pstack_env <VAR=value|-u VAR>... -- [args...]; like run_pstack with env changes
  local envargs=()
  while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do
    envargs+=("$1")
    shift
  done
  shift
  set +e
  OUT=$(env "${envargs[@]}" bash "$MANTRA/scripts/pstack.sh" "$@" 2>&1)
  RC=$?
  set -e
}

fresh_vendor() {
  chmod -R u+w "$VENDOR" 2>/dev/null || true
  rm -rf -- "$VENDOR"
}

home_before=$(snapshot "$HOME")

# README, the design doc and install.sh's warning all run it directly.
check "scripts/pstack.sh is executable" test -x "$ROOT/scripts/pstack.sh"

# --- --dry-run on an empty vendor changes nothing --------------------------------
fresh_vendor
write_pin "$SHA_A" 1.2.3
run_pstack --dry-run
check "dry-run (empty vendor): exit 0" test "$RC" -eq 0
check "dry-run (empty vendor): announces the fetch" contains "$OUT" "[dry-run] fetch"
check "dry-run (empty vendor): announces the link" contains "$OUT" "[dry-run] link"
check "dry-run (empty vendor): creates nothing" absent "$VENDOR"

# --- first fetch ------------------------------------------------------------------
run_pstack
check "first run: exit 0" test "$RC" -eq 0
check "first run: checkout dir exists" test -d "$BASE/$SHA_A"
check "first run: checkout HEAD is the pinned commit" test "$(git -C "$BASE/$SHA_A" rev-parse HEAD)" = "$SHA_A"
check "first run: plugin.json is present" test -f "$BASE/$SHA_A/$PLUGIN_PATH/.claude-plugin/plugin.json"
check "first run: poteto-mode is present" test -f "$BASE/$SHA_A/$PLUGIN_PATH/skills/poteto-mode/SKILL.md"
check "first run: harness doc is present" test -f "$BASE/$SHA_A/$PLUGIN_PATH/docs/harness/claude-code.md"
check "first run: sparse checkout leaves other paths out" absent "$BASE/$SHA_A/harness/other"
check "first run: sparse checkout leaves top-level files out" absent "$BASE/$SHA_A/README.md"
check "first run: current points at <commit>/<path>" is_symlink_to "$BASE/current" "$BASE/$SHA_A/$PLUGIN_PATH"
check "first run: current resolves to a directory" test -d "$BASE/current/skills"
check "first run: no temp dir left" test "$(count_matching "$BASE" '.tmp.*')" -eq 0
check "first run: no lock left" absent "$BASE/.lock"
check "first run: reports the changes" contains "$OUT" "change(s) made"
check "first run: HOME was not touched" test "$home_before" = "$(snapshot "$HOME")"

# --- second run is a no-op --------------------------------------------------------
before=$(snapshot "$VENDOR")
run_pstack
check "second run: exit 0" test "$RC" -eq 0
check "second run: changes nothing" test "$before" = "$(snapshot "$VENDOR")"
check "second run: reports no changes" contains "$OUT" "no changes needed"
run_pstack --dry-run
check "dry-run after a fetch: changes nothing" test "$before" = "$(snapshot "$VENDOR")"
check "dry-run after a fetch: reports no changes" contains "$OUT" "no changes needed"

# --- default vendor location (MANTRA_VENDOR unset) lives under $HOME/.mantra/vendor --
(
  unset MANTRA_VENDOR
  bash "$MANTRA/scripts/pstack.sh" >/dev/null 2>&1 && [ -d "$HOME/.mantra/vendor/pstack/$SHA_A" ] \
    && [ -L "$HOME/.mantra/vendor/pstack/current" ]
) && rc=0 || rc=$?
check "default vendor: used when MANTRA_VENDOR is unset" test "$rc" -eq 0
rm -rf -- "$HOME/.mantra"
home_before=$(snapshot "$HOME")

# --- pin validation ---------------------------------------------------------------
fresh_vendor
for bad in "${SHA_A:0:39}" "${SHA_A}0" "$(printf '%s' "$SHA_A" | tr 'a-f' 'A-F')" "main" "${SHA_A:0:39}g"; do
  write_pin "$bad" 1.2.3
  run_pstack
  check "rejects commit '${bad:0:12}...' (exit 2)" test "$RC" -eq 2
  check "rejects commit '${bad:0:12}...': explains" contains "$OUT" "40-digit hex"
  check "rejects commit '${bad:0:12}...': creates nothing" absent "$VENDOR"
done

write_pin "$SHA_A" "1.2"
run_pstack
check "rejects a version that is not x.y.z (exit 2)" test "$RC" -eq 2
check "rejects a bad version: creates nothing" absent "$VENDOR"

for badpath in "../escape" "/abs/path" "a/../b" "a b"; do
  write_pin "$SHA_A" 1.2.3 "$badpath"
  run_pstack
  check "rejects path '$badpath' (exit 2)" test "$RC" -eq 2
  check "rejects path '$badpath': creates nothing" absent "$VENDOR"
done

printf 'repo=x\ncommit=%s\nversion=1.2.3\n' "$SHA_A" >"$MANTRA/pstack/PIN"
run_pstack
check "a PIN without path= is rejected (exit 2)" test "$RC" -eq 2
check "a PIN without path=: names the key" contains "$OUT" "'path='"

run_pstack --bogus
check "unknown argument: exit 2" test "$RC" -eq 2

# --- fetch failures leave nothing behind ---------------------------------------------
write_pin "$SHA_A" 1.2.3
fresh_vendor
set +e
OUT=$(MANTRA_PSTACK_REPO="$TMP/no-such-repo.git" bash "$MANTRA/scripts/pstack.sh" 2>&1)
RC=$?
set -e
check "unreachable repo: exit non-zero" test "$RC" -ne 0
check "unreachable repo: no checkout dir" absent "$BASE/$SHA_A"
check "unreachable repo: no current link" absent "$BASE/current"
check "unreachable repo: no temp dir left" test "$(count_matching "$BASE" '.tmp.*')" -eq 0
check "unreachable repo: no lock left" absent "$BASE/.lock"

write_pin "0000000000000000000000000000000000000000" 1.2.3
run_pstack
check "commit that upstream does not have: exit non-zero" test "$RC" -ne 0
check "commit that upstream does not have: no checkout dir" absent "$BASE/0000000000000000000000000000000000000000"
check "commit that upstream does not have: no temp dir left" test "$(count_matching "$BASE" '.tmp.*')" -eq 0

write_pin "$SHA_NOPOTETO" 1.2.5
run_pstack
check "checkout missing poteto-mode: exit non-zero" test "$RC" -ne 0
check "checkout missing poteto-mode: names the file" contains "$OUT" "poteto-mode/SKILL.md"
check "checkout missing poteto-mode: no checkout dir" absent "$BASE/$SHA_NOPOTETO"
check "checkout missing poteto-mode: no current link" absent "$BASE/current"
check "checkout missing poteto-mode: no temp dir left" test "$(count_matching "$BASE" '.tmp.*')" -eq 0
check "checkout missing poteto-mode: no lock left" absent "$BASE/.lock"

write_pin "$SHA_A" 9.9.9
run_pstack
check "plugin version differs from the pin: exit non-zero" test "$RC" -ne 0
check "plugin version differs from the pin: no checkout dir" absent "$BASE/$SHA_A"
check "plugin version differs from the pin: no temp dir left" test "$(count_matching "$BASE" '.tmp.*')" -eq 0

# A failed run must not disturb a good install.
fresh_vendor
write_pin "$SHA_A" 1.2.3
run_pstack
write_pin "$SHA_B" 1.2.4
before=$(snapshot "$VENDOR")
set +e
OUT=$(MANTRA_PSTACK_REPO="$TMP/no-such-repo.git" bash "$MANTRA/scripts/pstack.sh" 2>&1)
RC=$?
set -e
check "failed update: exit non-zero" test "$RC" -ne 0
check "failed update: the old install is untouched" test "$before" = "$(snapshot "$VENDOR")"
check "failed update: current still points at the old commit" is_symlink_to "$BASE/current" "$BASE/$SHA_A/$PLUGIN_PATH"

# --- current is swapped to a new pin; the old commit stays ------------------------------
run_pstack
check "pin bumped: exit 0" test "$RC" -eq 0
check "pin bumped: new checkout exists" test "$(git -C "$BASE/$SHA_B" rev-parse HEAD)" = "$SHA_B"
check "pin bumped: current points at the new commit" is_symlink_to "$BASE/current" "$BASE/$SHA_B/$PLUGIN_PATH"
check "pin bumped: old commit dir is kept" test -d "$BASE/$SHA_A"
check "pin bumped: no stray link inside the old target" test -z "$(find "$BASE/$SHA_A" -type l)"
check "pin bumped: no stray link inside the new target" test -z "$(find "$BASE/$SHA_B" -type l)"
before=$(snapshot "$VENDOR")
run_pstack
check "pin bumped: a further run changes nothing" test "$before" = "$(snapshot "$VENDOR")"

# --- --dry-run with a pending bump changes nothing ----------------------------------------
write_pin "$SHA_A" 1.2.3
before=$(snapshot "$VENDOR")
run_pstack --dry-run
check "dry-run with a pending relink: exit 0" test "$RC" -eq 0
check "dry-run with a pending relink: announces it" contains "$OUT" "[dry-run] relink"
check "dry-run with a pending relink: changes nothing" test "$before" = "$(snapshot "$VENDOR")"
run_pstack
check "rolling the pin back relinks current" is_symlink_to "$BASE/current" "$BASE/$SHA_A/$PLUGIN_PATH"

# --- a checkout that no longer matches is quarantined, then fetched again -----------------
printf '{"version": "0.0.1"}\n' >"$BASE/$SHA_A/$PLUGIN_PATH/.claude-plugin/plugin.json"
run_pstack
check "tampered checkout: exit 0" test "$RC" -eq 0
check "tampered checkout: moved to <commit>.bad-*" test "$(count_matching "$BASE" "$SHA_A.bad-*")" -eq 1
check "tampered checkout: fetched again" test "$(git -C "$BASE/$SHA_A" rev-parse HEAD)" = "$SHA_A"
check "tampered checkout: version is the pinned one again" contains "$(cat "$BASE/$SHA_A/$PLUGIN_PATH/.claude-plugin/plugin.json")" '"1.2.3"'
check "tampered checkout: current still resolves" test -f "$BASE/current/skills/poteto-mode/SKILL.md"

rm -rf -- "${BASE:?}/${SHA_A:?}"
mkdir -p "$BASE/$SHA_A"
echo junk >"$BASE/$SHA_A/junk"
run_pstack
check "a plain non-git dir in the way: exit 0" test "$RC" -eq 0
check "a plain non-git dir in the way: quarantined (now 2 .bad-* dirs)" test "$(count_matching "$BASE" "$SHA_A.bad-*")" -eq 2
check "a plain non-git dir in the way: replaced by a real checkout" test "$(git -C "$BASE/$SHA_A" rev-parse HEAD)" = "$SHA_A"

# --- tracked files modified, untracked files added, symlinked checkout ---------------------
# State here: BASE/SHA_A is a good checkout, current points at it, pin is SHA_A.
write_pin "$SHA_A" 1.2.3
SK="$BASE/$SHA_A/$PLUGIN_PATH/skills/poteto-mode/SKILL.md"

echo "untracked noise" >"$BASE/$SHA_A/$PLUGIN_PATH/node_modules_stub"
mkdir -p "$BASE/$SHA_A/$PLUGIN_PATH/node_modules/x"
echo "x" >"$BASE/$SHA_A/$PLUGIN_PATH/node_modules/x/y.js"
before=$(snapshot "$VENDOR")
run_pstack
check "untracked files added: exit 0" test "$RC" -eq 0
check "untracked files added: changes nothing" test "$before" = "$(snapshot "$VENDOR")"
check "untracked files added: reports no changes" contains "$OUT" "no changes needed"

bad_before=$(count_matching "$BASE" "$SHA_A.bad-*")
echo "evil line" >>"$SK"
run_pstack
check "tracked file edited: exit 0" test "$RC" -eq 0
check "tracked file edited: warns that the checkout does not match" contains "$OUT" "does not match the pin"
check "tracked file edited: old checkout quarantined" test "$(count_matching "$BASE" "$SHA_A.bad-*")" -eq $((bad_before + 1))
check "tracked file edited: the quarantined copy keeps the edit" test -n "$(grep -rl 'evil line' "$BASE"/"$SHA_A".bad-* 2>/dev/null || true)"
check "tracked file edited: fresh checkout has no edit" test "$(cat "$SK")" = "poteto-mode 1.2.3"
check "tracked file edited: current still resolves" test -f "$BASE/current/skills/poteto-mode/SKILL.md"
check "tracked file edited: the untracked noise went with the old copy" absent "$BASE/$SHA_A/$PLUGIN_PATH/node_modules_stub"
before=$(snapshot "$VENDOR")
run_pstack
check "tracked file edited: a further run changes nothing" test "$before" = "$(snapshot "$VENDOR")"

bad_before=$(count_matching "$BASE" "$SHA_A.bad-*")
rm -f -- "$SK"
run_pstack
check "tracked file deleted: exit 0" test "$RC" -eq 0
check "tracked file deleted: quarantined and fetched again" test "$(count_matching "$BASE" "$SHA_A.bad-*")" -eq $((bad_before + 1))
check "tracked file deleted: restored" test -f "$SK"

# <commit>/ replaced by a symlink to another repo that has the same HEAD and version.
EXT="$TMP/ext-checkout"
rm -rf -- "$EXT"
cp -R "$BASE/$SHA_A" "$EXT"
bad_before=$(count_matching "$BASE" "$SHA_A.bad-*")
mv "$BASE/$SHA_A" "$TMP/moved-away"
ln -s "$EXT" "$BASE/$SHA_A"
check "symlinked checkout: the stand-in really has the pinned HEAD" test "$(git -C "$BASE/$SHA_A" rev-parse HEAD)" = "$SHA_A"
ext_before=$(snapshot "$EXT")
run_pstack
check "symlinked checkout: exit 0" test "$RC" -eq 0
check "symlinked checkout: treated as a mismatch (quarantined)" test "$(count_matching "$BASE" "$SHA_A.bad-*")" -eq $((bad_before + 1))
check "symlinked checkout: <commit>/ is a real directory again" test -d "$BASE/$SHA_A" -a ! -L "$BASE/$SHA_A"
check "symlinked checkout: the other repo was not touched" test "$ext_before" = "$(snapshot "$EXT")"
rm -rf -- "$TMP/moved-away" "$EXT"

# A mismatch plus a failing fetch leaves the old checkout and current alone.
echo "evil line" >>"$SK"
before=$(snapshot "$VENDOR")
set +e
OUT=$(MANTRA_PSTACK_REPO="$TMP/no-such-repo.git" bash "$MANTRA/scripts/pstack.sh" 2>&1)
RC=$?
set -e
check "mismatch + failed fetch: exit non-zero" test "$RC" -ne 0
check "mismatch + failed fetch: nothing moved or removed" test "$before" = "$(snapshot "$VENDOR")"
check "mismatch + failed fetch: the existing checkout is still there" test -d "$BASE/$SHA_A"
check "mismatch + failed fetch: it still has the edit" contains "$(cat "$SK")" "evil line"
check "mismatch + failed fetch: current is untouched" is_symlink_to "$BASE/current" "$BASE/$SHA_A/$PLUGIN_PATH"
check "mismatch + failed fetch: warns that it does not match" contains "$OUT" "does not match the pin"
check "mismatch + failed fetch: says the old copy is not to be trusted" contains "$OUT" "do not trust"
check "mismatch + failed fetch: no temp dir or lock left" test "$(count_matching "$BASE" '.tmp.*')" -eq 0 -a ! -e "$BASE/.lock"
run_pstack --dry-run
check "mismatch + dry-run: announces the fetch" contains "$OUT" "[dry-run] fetch"
check "mismatch + dry-run: changes nothing" test "$before" = "$(snapshot "$VENDOR")"
run_pstack
check "mismatch, repaired when the source is back" test "$(cat "$SK")" = "poteto-mode 1.2.3"

# --- source, path and git hardening -------------------------------------------------------
# PIN repo, when MANTRA_PSTACK_REPO is not set: only github.com/cursor/plugins.
for badrepo in "https://evil.example/cursor/plugins.git" "http://github.com/cursor/plugins.git" \
  "https://github.com/cursor/plugins-evil.git" "https://github.com/other/plugins.git" \
  "https://github.com/cursor/plugins.git/x" "https://github.com.evil.example/cursor/plugins.git" \
  "git@github.com:cursor/plugins.git" "--upload-pack=touch-x" "/tmp/local/plugins" "ext::sh -c true"; do
  fresh_vendor
  printf 'repo=%s\ncommit=%s\npath=%s\nversion=1.2.3\n' "$badrepo" "$SHA_A" "$PLUGIN_PATH" >"$MANTRA/pstack/PIN"
  run_pstack_env -u MANTRA_PSTACK_REPO --
  check "PIN repo '$badrepo' is refused without an override (exit 2)" test "$RC" -eq 2
  check "PIN repo '$badrepo': creates nothing" absent "$VENDOR"
done
for goodrepo in "https://github.com/cursor/plugins.git" "https://github.com/cursor/plugins"; do
  fresh_vendor
  printf 'repo=%s\ncommit=%s\npath=%s\nversion=1.2.3\n' "$goodrepo" "$SHA_A" "$PLUGIN_PATH" >"$MANTRA/pstack/PIN"
  run_pstack_env -u MANTRA_PSTACK_REPO -- --dry-run
  check "PIN repo '$goodrepo' is accepted (dry-run, exit 0)" test "$RC" -eq 0
  check "PIN repo '$goodrepo': dry-run names it" contains "$OUT" "from $goodrepo"
  check "PIN repo '$goodrepo': dry-run creates nothing" absent "$VENDOR"
done

write_pin "$SHA_A" 1.2.3
for badenv in "--upload-pack=touch $TMP/pwned" "-c" "-"; do
  fresh_vendor
  run_pstack_env "MANTRA_PSTACK_REPO=$badenv" --
  check "MANTRA_PSTACK_REPO '$badenv' is refused (exit 2)" test "$RC" -eq 2
  check "MANTRA_PSTACK_REPO '$badenv': creates nothing" absent "$VENDOR"
  check "MANTRA_PSTACK_REPO '$badenv': ran nothing" absent "$TMP/pwned"
done

# shellcheck disable=SC2016  # 'a$b' and 'a`b`' are literal path strings, never expanded
for badpath in ".git" ".git/hooks" "a/.git" "a/.git/b" "*" "a/*" "a/b*" ".hidden/x" "a//b" "a/b/" "a/./b" "a/b?" "a;b" 'a$b' 'a`b`' "a:b" "[a]" "{a,b}"; do
  fresh_vendor
  write_pin "$SHA_A" 1.2.3 "$badpath"
  run_pstack
  check "rejects path '$badpath' (exit 2)" test "$RC" -eq 2
  check "rejects path '$badpath': creates nothing" absent "$VENDOR"
done
write_pin "$SHA_A" 1.2.3
fresh_vendor
run_pstack
check "the normal path still works after the hardening" test "$RC" -eq 0

# The fetch only speaks the transports it is allowed to: ext:: must not run anything,
# even if the caller's environment tries to enable it.
fresh_vendor
run_pstack_env "MANTRA_PSTACK_REPO=ext::sh -c touch% $TMP/pwned-ext" "GIT_ALLOW_PROTOCOL=ext:file:https" --
check "ext:: transport: exit non-zero" test "$RC" -ne 0
check "ext:: transport: nothing was executed" absent "$TMP/pwned-ext"
check "ext:: transport: no checkout left" absent "$BASE/$SHA_A"
check "ext:: transport: no temp dir left" test "$(count_matching "$BASE" '.tmp.*')" -eq 0

# Hooks from a template directory do not run during the fetch/checkout.
TPL="$TMP/git-template"
mkdir -p "$TPL/hooks"
printf '#!/bin/sh\ntouch "%s/pwned-hook"\n' "$TMP" >"$TPL/hooks/post-checkout"
chmod +x "$TPL/hooks/post-checkout"
fresh_vendor
run_pstack_env "GIT_TEMPLATE_DIR=$TPL" --
check "template hooks: the run succeeds" test "$RC" -eq 0
check "template hooks: post-checkout did not run" absent "$TMP/pwned-hook"

# A checkout's own git config must not be able to run code when it is inspected.
printf '#!/bin/sh\ntouch "%s/pwned-fsmonitor"\n' "$TMP" >"$TMP/fsmon.sh"
chmod +x "$TMP/fsmon.sh"
git -C "$BASE/$SHA_A" config core.fsmonitor "$TMP/fsmon.sh"
run_pstack
check "checkout config with core.fsmonitor: not executed" absent "$TMP/pwned-fsmonitor"

# --- current that is a real directory is never overwritten -----------------------------------
fresh_vendor
write_pin "$SHA_A" 1.2.3
mkdir -p "$BASE/current"
echo keep >"$BASE/current/keep.txt"
run_pstack
check "real dir named current: exit non-zero" test "$RC" -ne 0
check "real dir named current: contents kept" test -f "$BASE/current/keep.txt"
check "real dir named current: no link was put inside it" test -z "$(find "$BASE/current" -type l)"
check "real dir named current: no lock left" absent "$BASE/.lock"

# --- concurrent run: a held lock stops us and is left alone -----------------------------------
fresh_vendor
mkdir -p "$BASE/.lock"
run_pstack
check "lock held: exit 1" test "$RC" -eq 1
check "lock held: explains" contains "$OUT" "another run holds"
check "lock held: the other run's lock is not removed" test -d "$BASE/.lock"
check "lock held: nothing fetched" absent "$BASE/$SHA_A"
rmdir "$BASE/.lock"

# --- a stale temp dir from a crashed run does not block a new run -----------------------------
mkdir -p "$BASE/.tmp.crashed"
run_pstack
check "stale .tmp.* from a crash: exit 0" test "$RC" -eq 0
check "stale .tmp.* from a crash: left alone (not ours to delete)" test -d "$BASE/.tmp.crashed"

check "HOME was not touched by any run" test "$home_before" = "$(snapshot "$HOME")"

echo "pstack.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
