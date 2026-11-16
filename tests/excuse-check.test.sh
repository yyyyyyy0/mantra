#!/usr/bin/env bash
# Tests for hooks/excuse-check.sh: builds throwaway git repos, feeds Stop hook
# JSON on stdin and checks block / silent. HOME and TMPDIR point at a temp dir.
set -euo pipefail
unset CDPATH GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
HOOK="$ROOT/hooks/excuse-check.sh"

if ! command -v jq >/dev/null 2>&1; then
  echo "excuse-check.test.sh: jq is required" >&2
  exit 1
fi

WORK=$(mktemp -d "${TMPDIR:-/tmp}/excuse-check-test.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
export HOME="$WORK/home" TMPDIR="$WORK/tmp"
mkdir -p "$HOME" "$TMPDIR"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.com GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.com

pass=0
fail=0
n=0

new_repo() {
  n=$((n + 1))
  REPO="$WORK/repo$n"
  mkdir -p "$REPO"
  git -C "$REPO" init -q
  printf 'base\n' >"$REPO/base.txt"
  git -C "$REPO" add base.txt
  git -C "$REPO" commit -q -m init
}

run_hook() { # $1 = session id, $2 = cwd, $3 = stop_hook_active
  jq -cn --arg s "$1" --arg c "$2" --argjson a "${3:-false}" \
    '{session_id: $s, cwd: $c, hook_event_name: "Stop", stop_hook_active: $a}' | bash "$HOOK"
}

ok() { pass=$((pass + 1)); echo "ok   $1"; }
bad() { fail=$((fail + 1)); echo "FAIL $1 ${2:-}"; }

assert_block() { # name, output, [substring]
  local name=$1 out=$2 sub=${3:-}
  if [ "$(printf '%s' "$out" | jq -r '.decision' 2>/dev/null)" = "block" ] \
    && [ "$(printf '%s' "$out" | jq -s 'length' 2>/dev/null)" = "1" ] \
    && { [ -z "$sub" ] || printf '%s' "$out" | jq -r '.reason' | grep -qF -- "$sub"; }; then
    ok "block  $name"
  else
    bad "block  $name" "(output: ${out:-<empty>})"
  fi
}

assert_silent() { # name, output
  if [ -z "$2" ]; then ok "silent $1"; else bad "silent $1" "(output: $2)"; fi
}

# --- A: excuse comments --------------------------------------------------------
new_repo
printf 'let a = 1\n// workaround: skip the null check\nlet b = 2\n' >"$REPO/a.ts"
git -C "$REPO" add a.ts
out=$(run_hook s1 "$REPO")
assert_block "added // workaround (staged)" "$out" "a.ts:2: // workaround"

new_repo
printf 'x = 1\n# 一旦これで\n' >"$REPO/m.py"
out=$(run_hook s2 "$REPO")
assert_block "untracked # 一旦" "$out" "m.py:2: # 一旦これで"

new_repo
printf 'one\n' >"$REPO/t.js"
git -C "$REPO" add t.js && git -C "$REPO" commit -q -m js
printf 'one\ntwo // TODO later\n' >"$REPO/t.js"
out=$(run_hook s3 "$REPO")
assert_block "modified tracked file, line number" "$out" "t.js:2:"

new_repo
printf 'const hackathon = 1\nconst s = "workaround"\n' >"$REPO/h.ts"
out=$(run_hook s4 "$REPO")
assert_silent "non-comment hack / string literal" "$out"

new_repo
printf '# TODO write docs\n' >"$REPO/notes.txt"
printf '# TODO write docs\n' >"$REPO/doc.md"
out=$(run_hook s5 "$REPO")
assert_silent "non-code extension (.md, .txt)" "$out"

new_repo
printf 'echo "$#"\nls --force\n' >"$REPO/s.sh"
out=$(run_hook s5b "$REPO")
assert_silent "shell \$# and flags" "$out"

# --- B: report markdown ---------------------------------------------------------
new_repo
printf 'x\n' >"$REPO/SUMMARY.md"
out=$(run_hook s6 "$REPO")
assert_block "root SUMMARY.md" "$out" "SUMMARY.md"

new_repo
printf 'x\n' >"$REPO/IMPLEMENTATION_NOTES.md"
git -C "$REPO" add IMPLEMENTATION_NOTES.md
out=$(run_hook s7 "$REPO")
assert_block "root IMPLEMENTATION_NOTES.md (staged)" "$out" "IMPLEMENTATION_NOTES.md"

new_repo
mkdir "$REPO/docs"
printf 'x\n' >"$REPO/docs/SUMMARY.md"
printf 'x\n' >"$REPO/README.md"
printf 'x\n' >"$REPO/CHANGELOG.md"
printf 'x\n' >"$REPO/HANDOVER.md"
printf 'x\n' >"$REPO/CLAUDE.md"
out=$(run_hook s8 "$REPO")
assert_silent "docs/SUMMARY.md, README, CHANGELOG, HANDOVER, CLAUDE" "$out"

# --- loop control ---------------------------------------------------------------
new_repo
printf '// hack\n' >"$REPO/a.go"
out1=$(run_hook s9 "$REPO")
out2=$(run_hook s9 "$REPO")
assert_block "first run" "$out1"
assert_silent "same findings second run" "$out2"
printf '// FIXME later\n' >>"$REPO/a.go"
out3=$(run_hook s9 "$REPO")
assert_block "changed findings block again" "$out3" "a.go:2"

new_repo
printf '// hack\n' >"$REPO/a.go"
out=$(run_hook s10 "$REPO" true)
assert_silent "stop_hook_active true" "$out"

# --- fail-open --------------------------------------------------------------------
new_repo
printf '// hack\n' >"$REPO/a.go"
rc=0
out=$(printf '' | bash "$HOOK") || rc=$?
{ [ -z "$out" ] && [ "$rc" -eq 0 ]; } && ok "empty input" || bad "empty input" "($rc, $out)"
rc=0
out=$(printf 'not json' | bash "$HOOK") || rc=$?
{ [ -z "$out" ] && [ "$rc" -eq 0 ]; } && ok "non-JSON input" || bad "non-JSON input" "($rc, $out)"
rc=0
out=$(printf '{}' | bash "$HOOK") || rc=$?
{ [ -z "$out" ] && [ "$rc" -eq 0 ]; } && ok "{} input" || bad "{} input" "($rc, $out)"
rc=0
out=$(printf '{"session_id":"x"}' | bash "$HOOK") || rc=$?
{ [ -z "$out" ] && [ "$rc" -eq 0 ]; } && ok "no cwd" || bad "no cwd" "($rc, $out)"
rc=0
out=$(printf '{"cwd":"%s"}' "$REPO" | bash "$HOOK") || rc=$?
{ [ -z "$out" ] && [ "$rc" -eq 0 ]; } && ok "no session_id" || bad "no session_id" "($rc, $out)"

mkdir -p "$WORK/plain"
printf '// hack\n' >"$WORK/plain/a.go"
out=$(run_hook s11 "$WORK/plain")
assert_silent "cwd outside git" "$out"

n=$((n + 1))
REPO="$WORK/repo$n"
mkdir -p "$REPO"
git -C "$REPO" init -q
printf '// hack\n' >"$REPO/a.go"
out=$(run_hook s12 "$REPO")
assert_silent "no HEAD" "$out"

new_repo
awk 'BEGIN { for (i = 0; i < 2001; i++) print "int x" i ";" ; print "// hack" }' >"$REPO/big.c"
git -C "$REPO" add big.c
out=$(run_hook s13 "$REPO")
assert_silent "over 2000 added lines" "$out"

new_repo
for i in $(seq 1 201); do printf 'x\n' >"$REPO/f$i.txt"; done
printf '// hack\n' >"$REPO/a.go"
out=$(run_hook s14 "$REPO")
assert_silent "over 200 untracked files" "$out"

# --- state dir safety ---------------------------------------------------------------
new_repo
printf '// hack\n' >"$REPO/a.go"
before=$(find "$WORK" -type f | sort | wc -l | tr -d ' ')
out=$(run_hook '../../evil/../x' "$REPO")
assert_block "path-like session_id still works" "$out"
if [ -f "$TMPDIR/mantra-excuse-check/evilx" ] && [ ! -e "$WORK/evil" ] && [ ! -e "$WORK/x" ] \
  && [ "$(find "$WORK" -type f | sort | wc -l | tr -d ' ')" -eq $((before + 1)) ]; then
  ok "state written only inside state dir"
else
  bad "state written only inside state dir"
fi

# --- ignored files and output shape ---------------------------------------------------
new_repo
printf 'node_modules/\n' >"$REPO/.gitignore"
mkdir "$REPO/node_modules"
printf '// hack\n' >"$REPO/node_modules/a.js"
git -C "$REPO" add .gitignore
out=$(run_hook s15 "$REPO")
assert_silent "gitignored file" "$out"

new_repo
printf '// hack "quoted" \\ back\\slash\n' >"$REPO/q.ts"
out=$(run_hook s16 "$REPO")
assert_block "valid single JSON with quotes/backslashes" "$out" 'back\slash'

echo
echo "excuse-check.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
