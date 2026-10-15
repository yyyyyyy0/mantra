#!/usr/bin/env bash
# Tests for scripts/verify.sh: each check must fail on a broken fixture and the
# untouched fixture must pass. Fixtures are temporary copies of rules/ and
# agents/ with a trivial tests/ directory; the real repo is never modified.
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

contains() { printf '%s' "$1" | grep -Fq -- "$2"; }

mk_fixture() { # prints the fixture dir
  local d
  d=$(mktemp -d "$TMP/fx.XXXXXX")
  mkdir -p "$d/scripts" "$d/tests"
  cp "$ROOT/scripts/verify.sh" "$d/scripts/"
  cp -R "$ROOT/rules" "$ROOT/agents" "$d/"
  printf '#!/usr/bin/env bash\necho "ok.test.sh: 1 passed, 0 failed"\n' >"$d/tests/ok.test.sh"
  printf '%s' "$d"
}

VOUT=''
VRC=0
run_verify() { # run_verify <dir> [VAR=value ...]
  local d=$1
  shift
  set +e
  VOUT=$(cd "$d" && env -u CI -u MANTRA_VERIFY_NESTED -u MANTRA_VERIFY_TOKEN -u MANTRA_VERIFY_TOKEN_FILE "$@" bash scripts/verify.sh 2>&1)
  VRC=$?
  set -e
}

expect_fail() { # expect_fail <description> <text the output must contain>
  check "$1: exit non-zero" test "$VRC" -ne 0
  check "$1: reports it" contains "$VOUT" "$2"
}

DELEGATION="rules/delegation.md"

# --- the untouched fixture passes -----------------------------------------------
d=$(mk_fixture)
run_verify "$d"
check "pristine fixture passes" test "$VRC" -eq 0
check "pristine fixture reports the budget" contains "$VOUT" "a. always-on rules"

# --- b. sentinels ---------------------------------------------------------------
for s in \
  '### FM-VERSION' \
  '### FM-AGENT-CRITIC' \
  'Do not leave model assignment implicit.' \
  'orchestration strategy: phases, and what runs in parallel vs. sequentially' \
  'which agent / model handles each phase, and why' \
  'the review / verification gate between phases'; do
  d=$(mk_fixture)
  grep -rlF -- "$s" "$d/rules" | while IFS= read -r f; do
    grep -vF -- "$s" "$f" >"$f.tmp" || true
    mv "$f.tmp" "$f"
  done
  run_verify "$d"
  expect_fail "missing sentinel '${s:0:40}'" "b. sentinel missing"
done

for w in code-reviewer security-reviewer mob-critic sonnet; do
  d=$(mk_fixture)
  # Keep the heading, drop the word from the section only.
  awk -v w="$w" '
    $0 == "## Do without being asked" { on = 1 }
    on && /^## / && $0 != "## Do without being asked" { on = 0 }
    on { gsub(w, "REDACTED") }
    { print }
  ' "$d/$DELEGATION" >"$d/$DELEGATION.tmp"
  mv "$d/$DELEGATION.tmp" "$d/$DELEGATION"
  run_verify "$d"
  expect_fail "'Do without being asked' without $w" "does not mention '$w'"
done

# --- a. budget ------------------------------------------------------------------
d=$(mk_fixture)
for i in $(seq 1 120); do echo "extra line $i"; done >>"$d/$DELEGATION"
run_verify "$d"
expect_fail "rules over the line budget" "over budget"

d=$(mk_fixture)
{
  printf -- '---\npaths:\n  - "src/**"\n---\n'
  for i in $(seq 1 400); do echo "scoped line $i"; done
} >"$d/rules/scoped.md"
run_verify "$d"
check "path-scoped rules do not count toward the budget" test "$VRC" -eq 0

d=$(mk_fixture)
mkdir -p "$d/elsewhere"
for i in $(seq 1 250); do echo "outside line $i"; done >"$d/elsewhere/big.md"
ln -s "$d/elsewhere/big.md" "$d/rules/linked.md"
run_verify "$d"
expect_fail "a symlinked rule file counts toward the budget" "over budget"

d=$(mk_fixture)
ln -s "$d/does-not-exist.md" "$d/rules/dangling.md"
run_verify "$d"
expect_fail "a dangling symlink in rules/" "dangling symlink"

# --- c. relative links ----------------------------------------------------------
d=$(mk_fixture)
echo 'See [x](../docs/x.md).' >>"$d/rules/failure-modes.md"
run_verify "$d"
expect_fail "relative link in rules/" "relative ](../ links"

# --- d. agent frontmatter -------------------------------------------------------
for key in 'hooks: {}' 'mcpServers: []' 'permissionMode: bypassPermissions'; do
  d=$(mk_fixture)
  sed -i.bak "s/^model: sonnet$/model: sonnet\n$key/" "$d/agents/code-reviewer.md"
  rm -f -- "$d/agents/code-reviewer.md.bak"
  run_verify "$d"
  expect_fail "agent with '${key%%:*}'" "is not allowed in agents"
done

d=$(mk_fixture)
sed -i.bak 's/^model: sonnet$/model: sonnet\nsomething: 1/' "$d/agents/code-reviewer.md"
rm -f -- "$d/agents/code-reviewer.md.bak"
run_verify "$d"
check "unknown agent key only warns (exit 0)" test "$VRC" -eq 0
check "unknown agent key is reported as WARN" contains "$VOUT" "WARN  d."

d=$(mk_fixture)
sed -i.bak 's/^name: planner$/name: other/' "$d/agents/planner.md"
rm -f -- "$d/agents/planner.md.bak"
run_verify "$d"
expect_fail "agent name differs from filename" "name must equal"

d=$(mk_fixture)
sed -i.bak 's/^model: opus$/model: gpt/' "$d/agents/planner.md"
rm -f -- "$d/agents/planner.md.bak"
run_verify "$d"
expect_fail "agent with an unknown model" "model 'gpt'"

for badline in 'hooks : {}' '"hooks": {}' $'hooks\t: {}' 'hooks:{}' '# a comment' '- Read'; do
  d=$(mk_fixture)
  sed -i.bak "s/^model: sonnet\$/model: sonnet\n${badline//\//\\/}/" "$d/agents/code-reviewer.md"
  rm -f -- "$d/agents/code-reviewer.md.bak"
  run_verify "$d"
  expect_fail "frontmatter line '${badline}'" "malformed frontmatter line"
done

# --- e. tests ---------------------------------------------------------------------
d=$(mk_fixture)
printf '#!/usr/bin/env bash\necho boom\nexit 1\n' >"$d/tests/bad.test.sh"
run_verify "$d"
expect_fail "a failing tests/*.test.sh" "bad.test.sh exited 1"

# The recursion guard is a token backed by a file, not a bare variable.
run_verify "$d" MANTRA_VERIFY_NESTED=1
expect_fail "the old MANTRA_VERIFY_NESTED variable no longer skips tests" "bad.test.sh exited 1"
run_verify "$d" MANTRA_VERIFY_TOKEN=abc123
expect_fail "a token without a file skips nothing" "bad.test.sh exited 1"
run_verify "$d" MANTRA_VERIFY_TOKEN=abc123 MANTRA_VERIFY_TOKEN_FILE="$TMP/no-such-file"
expect_fail "a token with a missing file skips nothing" "bad.test.sh exited 1"
printf '%s' "something-else" >"$TMP/token-file"
run_verify "$d" MANTRA_VERIFY_TOKEN=abc123 MANTRA_VERIFY_TOKEN_FILE="$TMP/token-file"
expect_fail "a token that does not match the file skips nothing" "bad.test.sh exited 1"
printf '%s' "abc123" >"$TMP/token-file"
run_verify "$d" MANTRA_VERIFY_TOKEN=abc123 MANTRA_VERIFY_TOKEN_FILE="$TMP/token-file"
check "a matching token + file skips tests/ (exit 0)" test "$VRC" -eq 0
check "the skip is a loud WARN" contains "$VOUT" "WARN  e. tests/ NOT run"

# --- 0 / f. tools -----------------------------------------------------------------
tools_dir() { # tools_dir <name> <with-jq 0|1>
  local b="$TMP/bin-$1" t p
  mkdir -p "$b"
  for t in bash awk grep sed find sort wc tail head tr basename dirname cat mktemp rm mv cp date od; do
    if p=$(command -v "$t" 2>/dev/null) && [ -x "$p" ]; then ln -sf "$p" "$b/$t"; fi
  done
  if [ "$2" = "1" ]; then ln -sf "$(command -v jq)" "$b/jq"; fi
  printf '%s' "$b"
}

d=$(mk_fixture)
run_verify "$d" PATH="$(tools_dir nojq 0)"
expect_fail "jq missing" "jq is not installed"

nosc=$(tools_dir nosc 1)
d=$(mk_fixture)
run_verify "$d" PATH="$nosc"
check "no shellcheck outside CI: skipped, exit 0" test "$VRC" -eq 0
check "no shellcheck outside CI: SKIP note" contains "$VOUT" "SKIP  f."
run_verify "$d" PATH="$nosc" CI=true
expect_fail "no shellcheck with CI=true" "required when CI=true"

echo "verify.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
