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
  cp -R "$ROOT/rules" "$ROOT/agents" "$ROOT/skills" "$d/"
  mkdir -p "$d/pstack"
  cp "$ROOT/pstack/PIN" "$d/pstack/PIN"
  printf '#!/usr/bin/env bash\necho "ok.test.sh: 1 passed, 0 failed"\n' >"$d/tests/ok.test.sh"
  printf '%s' "$d"
}

VOUT=''
VRC=0
run_verify() { # run_verify <dir> [VAR=value ...]
  local d=$1
  shift
  set +e
  VOUT=$(cd "$d" && env -u CI -u MANTRA_VERIFY_NESTED -u MANTRA_VERIFY_TOKEN -u MANTRA_VERIFY_TOKEN_FILE -u MANTRA_VENDOR HOME="$TMP/home" "$@" bash scripts/verify.sh 2>&1)
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

# --- g. skills ---------------------------------------------------------------------
d=$(mk_fixture)
run_verify "$d"
check "pristine fixture reports the skills" contains "$VOUT" "g. skills/nil-mode/SKILL.md frontmatter"

d=$(mk_fixture)
sed -i.bak 's/^name: nil-mode$/name: other/' "$d/skills/nil-mode/SKILL.md"
rm -f -- "$d/skills/nil-mode/SKILL.md.bak"
run_verify "$d"
expect_fail "skill name differs from its directory" "g. skills/nil-mode/SKILL.md: name must equal 'nil-mode'"

d=$(mk_fixture)
sed -i.bak '/^name: nil-mode$/d' "$d/skills/nil-mode/SKILL.md"
rm -f -- "$d/skills/nil-mode/SKILL.md.bak"
run_verify "$d"
expect_fail "skill without a name" "name must equal 'nil-mode' (got '<missing>')"

d=$(mk_fixture)
sed -i.bak 's/^description: .*$/description:/' "$d/skills/nil-mode/SKILL.md"
rm -f -- "$d/skills/nil-mode/SKILL.md.bak"
run_verify "$d"
expect_fail "skill with an empty description" "g. skills/nil-mode/SKILL.md: description is missing or empty"

d=$(mk_fixture)
sed -i.bak '/^description: /d' "$d/skills/nil-mode/SKILL.md"
rm -f -- "$d/skills/nil-mode/SKILL.md.bak"
run_verify "$d"
expect_fail "skill without a description" "description is missing or empty"

d=$(mk_fixture)
sed -i.bak 's/^description: .*$/description: >\n  A folded description\n  on two lines./' "$d/skills/nil-mode/SKILL.md"
rm -f -- "$d/skills/nil-mode/SKILL.md.bak"
run_verify "$d"
check "a folded (>) description with a body passes" test "$VRC" -eq 0

d=$(mk_fixture)
sed -i.bak 's/^description: .*$/description: >/' "$d/skills/nil-mode/SKILL.md"
rm -f -- "$d/skills/nil-mode/SKILL.md.bak"
run_verify "$d"
expect_fail "a folded (>) description without a body" "description is missing or empty"

d=$(mk_fixture)
printf 'no frontmatter here\n' >"$d/skills/nil-mode/SKILL.md"
run_verify "$d"
expect_fail "skill without frontmatter" "g. skills/nil-mode/SKILL.md: missing or unterminated YAML frontmatter"

d=$(mk_fixture)
trash_target="$d/skills/nil-mode/SKILL.md"
mv "$trash_target" "$trash_target.moved"
run_verify "$d"
expect_fail "skill directory without SKILL.md" "g. skills/nil-mode has no SKILL.md"

d=$(mk_fixture)
mv "$d/skills" "$d/skills.moved"
run_verify "$d"
expect_fail "no skills/ directory" "g. skills/ directory is missing"

d=$(mk_fixture)
mv "$d/skills" "$d/skills.moved"
mkdir "$d/skills"
run_verify "$d"
expect_fail "an empty skills/ directory" "g. no skills/*/ directory found"

# symlinks under skills/ and pstack/ are refused (positive control: none -> passes)
d=$(mk_fixture)
run_verify "$d"
check "pristine fixture: no symlink complaint" test -z "$(printf '%s\n' "$VOUT" | grep 'symlink under' || true)"

d=$(mk_fixture)
ln -s /etc/hosts "$d/skills/nil-mode/leak.md"
run_verify "$d"
expect_fail "a file symlink inside a skill" "g. symlink under skills/: skills/nil-mode/leak.md"

d=$(mk_fixture)
mkdir -p "$d/outside"
ln -s ../../outside "$d/skills/nil-mode/linked-dir"
run_verify "$d"
expect_fail "a directory symlink inside a skill" "g. symlink under skills/: skills/nil-mode/linked-dir"

d=$(mk_fixture)
ln -s nowhere "$d/skills/dangling"
run_verify "$d"
expect_fail "a dangling symlink directly under skills/" "g. symlink under skills/: skills/dangling"

d=$(mk_fixture)
mv "$d/skills/nil-mode" "$d/nil-mode.real"
ln -s ../nil-mode.real "$d/skills/nil-mode"
run_verify "$d"
expect_fail "a whole skill directory that is a symlink" "g. symlink under skills/: skills/nil-mode"

d=$(mk_fixture)
mv "$d/skills" "$d/skills.real"
ln -s skills.real "$d/skills"
run_verify "$d"
expect_fail "skills/ itself a symlink" "g. symlink under skills/: skills"

d=$(mk_fixture)
ln -s /etc/hosts "$d/pstack/PIN.link"
run_verify "$d"
expect_fail "a symlink inside pstack/" "h. symlink under pstack/: pstack/PIN.link"

d=$(mk_fixture)
mv "$d/pstack/PIN" "$d/PIN.real"
ln -s ../PIN.real "$d/pstack/PIN"
run_verify "$d"
expect_fail "pstack/PIN itself a symlink" "h. symlink under pstack/: pstack/PIN"

# --- h. pstack/PIN -----------------------------------------------------------------
d=$(mk_fixture)
run_verify "$d"
check "pristine fixture reports the pin" contains "$VOUT" "h. pstack/PIN has repo, commit"

d=$(mk_fixture)
mv "$d/pstack/PIN" "$d/pstack/PIN.moved"
run_verify "$d"
expect_fail "no pstack/PIN" "h. pstack/PIN is missing"

for k in repo commit path version; do
  d=$(mk_fixture)
  grep -v "^$k=" "$d/pstack/PIN" >"$d/pstack/PIN.tmp" || true
  mv "$d/pstack/PIN.tmp" "$d/pstack/PIN"
  run_verify "$d"
  expect_fail "PIN without $k=" "h. pstack/PIN has no '$k=' line"
done

d=$(mk_fixture)
sed -i.bak 's/^path=.*$/path=/' "$d/pstack/PIN"
rm -f -- "$d/pstack/PIN.bak"
run_verify "$d"
expect_fail "PIN with an empty value" "h. pstack/PIN: 'path=' is empty"

d=$(mk_fixture)
echo "version=9.9.9" >>"$d/pstack/PIN"
run_verify "$d"
expect_fail "PIN with a repeated key" "h. pstack/PIN has 'version=' 2 times"

for bad in "abc123" "FD268B808C786469E6DD8C8D9DB864D0DE4D669E" "fd268b808c786469e6dd8c8d9db864d0de4d669" "fd268b808c786469e6dd8c8d9db864d0de4d669e0" "fd268b808c786469e6dd8c8d9db864d0de4d669g" "main"; do
  d=$(mk_fixture)
  sed -i.bak "s/^commit=.*\$/commit=$bad/" "$d/pstack/PIN"
  rm -f -- "$d/pstack/PIN.bak"
  run_verify "$d"
  expect_fail "PIN commit '$bad'" "h. pstack/PIN: commit is not a 40-digit hex SHA"
done

for bad in "1.2" "v1.2.3" "1.2.3.4" "1.2.x" "latest"; do
  d=$(mk_fixture)
  sed -i.bak "s/^version=.*\$/version=$bad/" "$d/pstack/PIN"
  rm -f -- "$d/pstack/PIN.bak"
  run_verify "$d"
  expect_fail "PIN version '$bad'" "h. pstack/PIN: version is not x.y.z"
done

# --- i. rules/pstack-models.md -------------------------------------------------------
M=rules/pstack-models.md
d=$(mk_fixture)
run_verify "$d"
check "pristine fixture reports the model lines" contains "$VOUT" "i. rules/pstack-models.md:"
check "no vendor dir: the vendor checks are skipped, not failed" contains "$VOUT" "SKIP  i. pstack vendor checks"

d=$(mk_fixture)
printf 'a role: inherit-parent\nb: auto\nc, d: opus max, haiku low\ne: fable xhigh, sonnet medium, auto\n  # an indented comment\n\n' >>"$d/$M"
run_verify "$d"
check "inherit-parent, auto, lists, commas in roles, blank and comment lines pass" test "$VRC" -eq 0

for badline in \
  'feature: gpt-5 high' \
  'feature: sonnet' \
  'feature: sonnet ultra' \
  'feature: Sonnet high' \
  'feature sonnet high' \
  'feature: sonnet high,opus high' \
  'feature: sonnet high ' \
  'feature: sonnet  high' \
  'feature: inherit' \
  'feature: sonnet high, ' \
  'feature:sonnet high' \
  ': sonnet high' \
  'feature: sonnet high: extra'; do
  d=$(mk_fixture)
  printf '%s\n' "$badline" >>"$d/$M"
  run_verify "$d"
  expect_fail "pstack-models line '$badline'" "i. rules/pstack-models.md:"
done

d=$(mk_fixture)
mv "$d/$M" "$d/$M.moved"
run_verify "$d"
expect_fail "no rules/pstack-models.md" "i. rules/pstack-models.md is missing"

d=$(mk_fixture)
printf '# only a comment\n' >"$d/$M"
run_verify "$d"
expect_fail "pstack-models.md with no role lines" "has no role lines"

# Optional checks against an installed pstack: a fake vendor dir.
mk_vendor() { # prints a vendor dir whose pstack/current has what nil-mode names
  local v cur p
  v=$(mktemp -d "$TMP/vendor.XXXXXX")
  cur="$v/pstack/current"
  mkdir -p "$cur/skills/setup-pstack" "$cur/skills/poteto-mode" "$cur/docs/harness"
  printf 'setup\n```\n' >"$cur/skills/setup-pstack/SKILL.md"
  cat "$ROOT/rules/pstack-models.md" >>"$cur/skills/setup-pstack/SKILL.md"
  printf '```\n' >>"$cur/skills/setup-pstack/SKILL.md"
  : >"$cur/skills/poteto-mode/SKILL.md"
  : >"$cur/docs/harness/claude-code.md"
  # every <pstack>/... path nil-mode names (the same extraction verify.sh uses)
  while IFS= read -r p; do
    case "$p" in
      *.md)
        mkdir -p "$cur/$(dirname "$p")"
        : >>"$cur/$p"
        ;;
      *) mkdir -p "$cur/$p" ;;
    esac
  done < <(grep -oE '<pstack>/[A-Za-z0-9_./-]+' "$ROOT/skills/nil-mode/SKILL.md" | sed -e 's/^<pstack>\///' -e 's/[.,]*$//' | sort -u)
  while IFS= read -r p; do
    mkdir -p "$cur/skills/$p"
    : >"$cur/skills/$p/SKILL.md"
  done < <(grep -oE 'principle-[a-z0-9]+(-[a-z0-9]+)*' "$ROOT/skills/nil-mode/SKILL.md" | sort -u)
  printf '%s' "$v"
}

d=$(mk_fixture)
v=$(mk_vendor)
run_verify "$d" MANTRA_VENDOR="$v"
check "vendor present and complete: exit 0" test "$VRC" -eq 0
check "vendor present and complete: the checks ran" contains "$VOUT" "PASS  i. pstack at"
check "vendor present: no SKIP line" test -z "$(printf '%s\n' "$VOUT" | grep 'SKIP  i.' || true)"

v=$(mk_vendor)
run_verify "$d" HOME="$TMP/vhome" MANTRA_VENDOR=''
check "an empty MANTRA_VENDOR falls back to \$HOME/.mantra/vendor (absent: SKIP)" contains "$VOUT" "SKIP  i. pstack vendor checks"
mkdir -p "$TMP/vhome/.mantra"
mv "$v" "$TMP/vhome/.mantra/vendor"
run_verify "$d" HOME="$TMP/vhome" MANTRA_VENDOR=''
check "the default vendor dir under HOME is used when present" contains "$VOUT" "PASS  i. pstack at $TMP/vhome/.mantra/vendor/pstack/current"

d=$(mk_fixture)
printf 'a role pstack never heard of: auto\n' >>"$d/$M"
v=$(mk_vendor)
run_verify "$d" MANTRA_VENDOR="$v"
expect_fail "a role that setup-pstack does not define" "role 'a role pstack never heard of' in rules/pstack-models.md is not a role in setup-pstack"

d=$(mk_fixture)
v=$(mk_vendor)
trash_target="$v/pstack/current/docs/harness/claude-code.md"
mv "$trash_target" "$trash_target.moved"
run_verify "$d" MANTRA_VENDOR="$v"
expect_fail "nil-mode names a pstack path that does not exist" "names <pstack>/docs/harness/claude-code.md"

d=$(mk_fixture)
v=$(mk_vendor)
mv "$v/pstack/current/skills/principle-prove-it-works" "$v/pstack/current/skills/principle-renamed"
run_verify "$d" MANTRA_VENDOR="$v"
expect_fail "nil-mode names a principle that pstack lacks" "principle-prove-it-works, which is not a skill"

d=$(mk_fixture)
v=$(mk_vendor)
mv "$v/pstack/current/skills/setup-pstack" "$v/pstack/current/skills/setup-moved"
run_verify "$d" MANTRA_VENDOR="$v"
expect_fail "vendor without setup-pstack" "setup-pstack/SKILL.md is missing"

pin_commit=$(sed -n 's/^commit=//p' "$ROOT/pstack/PIN")
pin_path=$(sed -n 's/^path=//p' "$ROOT/pstack/PIN")
relocate_current() { # relocate_current <vendor> <sha>: make current a symlink to <sha>/<path>
  local v=$1 sha=$2
  mkdir -p "$v/pstack/$sha/$(dirname "$pin_path")"
  mv "$v/pstack/current" "$v/pstack/$sha/$pin_path"
  ln -s "$v/pstack/$sha/$pin_path" "$v/pstack/current"
}

d=$(mk_fixture)
v=$(mk_vendor)
relocate_current "$v" 0123456789abcdef0123456789abcdef01234567
run_verify "$d" MANTRA_VENDOR="$v"
check "a vendor dir that is not at the pinned commit only warns (exit 0)" test "$VRC" -eq 0
check "a vendor dir that is not at the pinned commit is flagged WARN" contains "$VOUT" "WARN  i."

d=$(mk_fixture)
v=$(mk_vendor)
relocate_current "$v" "$pin_commit"
run_verify "$d" MANTRA_VENDOR="$v"
check "a vendor dir at the pinned commit: exit 0" test "$VRC" -eq 0
check "a vendor dir at the pinned commit: no WARN" test -z "$(printf '%s\n' "$VOUT" | grep 'WARN  i.' || true)"
check "a vendor dir at the pinned commit: the checks ran" contains "$VOUT" "PASS  i. pstack at"

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
