#!/usr/bin/env bash
# Canonical check for the mantra repo. Exits non-zero on any failure.
#
#   bash scripts/verify.sh
#
# Checks:
#   0. jq is installed (hooks/guard.sh depends on it)
#   a. always-on rules budget (rules without a `paths:` frontmatter key)
#   b. sentinel strings that must survive in rules/
#   c. no relative "](../" links in rules/ or agents/
#   d. agents/*.md frontmatter (name, description, model, allowed keys)
#   e. every tests/*.test.sh passes
#   f. shellcheck on the shell scripts (required when CI=true)
#
# Check e is skipped (with a WARN) only when MANTRA_VERIFY_TOKEN matches the
# contents of the file named by MANTRA_VERIFY_TOKEN_FILE. An outer verify.sh
# creates that file in its own temp dir for the duration of its test run, so
# deploy.test.sh -> deploy.sh -> verify.sh cannot recurse, while a stray
# exported variable (no such file, or a stale one) skips nothing.
set -euo pipefail
unset CDPATH GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY

RULES_MAX_LINES=${RULES_MAX_LINES:-200}
RULES_MAX_BYTES=${RULES_MAX_BYTES:-8192}
# shellcheck disable=SC2016  # backticks here are literal text in the rule file
SENTINELS=(
  '### FM-VERSION'
  '### FM-AGENT-CRITIC'
  'Do not leave model assignment implicit.'
  '## Do without being asked'
  'orchestration strategy: phases, and what runs in parallel vs. sequentially'
  'which agent / model handles each phase, and why (see `rules/performance.md` Delegation Criteria)'
  'the review / verification gate between phases'
)
DO_SECTION_HEADING='## Do without being asked'
DO_SECTION_WORDS=(code-reviewer security-reviewer mob-critic sonnet)
KNOWN_KEYS=" name description tools disallowedTools model effort permissionMode maxTurns background isolation color skills mcpServers hooks memory initialPrompt omitClaudeMd autoCompactWindow experimental "
FORBIDDEN_KEYS=" hooks mcpServers permissionMode "

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$ROOT"

PASSES=0
FAILS=0
WARNS=0

pass() {
  PASSES=$((PASSES + 1))
  echo "PASS  $*"
}
fail() {
  FAILS=$((FAILS + 1))
  echo "FAIL  $*"
}
warn() {
  WARNS=$((WARNS + 1))
  echo "WARN  $*"
}

# Print the YAML frontmatter body (between the first two --- lines) of $1.
# Exit 3 if the file does not start with ---, 4 if it is never closed.
frontmatter() {
  awk '
    { sub(/\r$/, "") }
    NR == 1 { if ($0 !~ /^---[ \t]*$/) { bad = 3; exit } next }
    /^---[ \t]*$/ { closed = 1; exit }
    { print }
    END { if (bad) exit bad; if (!closed) exit 4 }
  ' "$1"
}

trim_value() {
  local v=$1
  v=${v#"${v%%[![:space:]]*}"}
  v=${v%"${v##*[![:space:]]}"}
  case "$v" in
    \"*\")
      v=${v#\"}
      v=${v%\"}
      ;;
    \'*\')
      v=${v#\'}
      v=${v%\'}
      ;;
  esac
  printf '%s' "$v"
}

# --- 0. tools ----------------------------------------------------------------
check_tools() {
  if command -v jq >/dev/null 2>&1; then
    pass "0. jq is installed"
  else
    fail "0. jq is not installed; hooks/guard.sh and its tests need it"
  fi
}

# --- a. always-on rules budget -----------------------------------------------
check_rules_budget() {
  if [ ! -d rules ]; then
    fail "a. rules/ directory is missing"
    return
  fi
  local total_lines=0 total_bytes=0 f lines bytes fm dangling=0
  while IFS= read -r f; do
    if [ ! -e "$f" ]; then
      fail "a. $f is a dangling symlink"
      dangling=1
      continue
    fi
    fm=''
    fm=$(frontmatter "$f" 2>/dev/null) || fm=''
    if printf '%s\n' "$fm" | grep -Eq '^paths:'; then
      continue
    fi
    lines=$(awk 'END { print NR }' "$f")
    bytes=$(($(wc -c <"$f")))
    total_lines=$((total_lines + lines))
    total_bytes=$((total_bytes + bytes))
    echo "      always-on: $f ($lines lines, $bytes bytes)"
  done < <(find -H rules \( -type f -o -type l \) -name '*.md' | sort)

  if [ "$total_lines" -le "$RULES_MAX_LINES" ] && [ "$total_bytes" -le "$RULES_MAX_BYTES" ]; then
    [ "$dangling" -eq 1 ] || pass "a. always-on rules: $total_lines/$RULES_MAX_LINES lines, $total_bytes/$RULES_MAX_BYTES bytes"
  else
    fail "a. always-on rules over budget: $total_lines lines (max $RULES_MAX_LINES), $total_bytes bytes (max $RULES_MAX_BYTES)"
  fi
}

# --- b. sentinels ------------------------------------------------------------
check_sentinels() {
  local s missing=0 f section w
  for s in "${SENTINELS[@]}"; do
    if [ -d rules ] && grep -rqF --include='*.md' -- "$s" rules; then
      :
    else
      fail "b. sentinel missing from rules/: $s"
      missing=1
    fi
  done

  # The "Do without being asked" section must still name the agents it triggers.
  f=''
  if [ -d rules ]; then
    f=$(grep -rlxF --include='*.md' -- "$DO_SECTION_HEADING" rules | head -n 1 || true)
  fi
  if [ -z "$f" ]; then
    fail "b. no rules file has a line exactly '$DO_SECTION_HEADING'"
    missing=1
  else
    section=$(awk -v h="$DO_SECTION_HEADING" '$0 == h { on = 1; next } on && /^## / { exit } on { print }' "$f")
    for w in "${DO_SECTION_WORDS[@]}"; do
      if ! grep -Fq -- "$w" <<<"$section"; then
        fail "b. '$DO_SECTION_HEADING' in $f does not mention '$w'"
        missing=1
      fi
    done
  fi
  [ "$missing" -eq 1 ] || pass "b. sentinels present and the 'Do without being asked' section names its agents"
}

# --- c. relative links -------------------------------------------------------
check_relative_links() {
  local existing=() d hits
  for d in rules agents; do
    if [ -d "$d" ]; then
      existing+=("$d")
    fi
  done
  if [ "${#existing[@]}" -eq 0 ]; then
    pass "c. no relative ](../ links (nothing to scan)"
    return
  fi
  hits=$(grep -rnF --include='*.md' -- '](../' "${existing[@]}" || true)
  if [ -n "$hits" ]; then
    fail "c. relative ](../ links found (they break once files are symlinked):"
    printf '%s\n' "$hits" | sed 's/^/        /'
  else
    pass "c. no relative ](../ links in ${existing[*]}"
  fi
}

# --- d. agent frontmatter ----------------------------------------------------
check_agent() {
  local f=$1 stem fm rc=0 line key val last_key='' name='' desc='' model=''
  local desc_body=0 has_name=0 has_desc=0 has_model=0 ok=1
  stem=$(basename "$f" .md)
  fm=$(frontmatter "$f") || rc=$?
  if [ "$rc" -ne 0 ]; then
    fail "d. $f: missing or unterminated YAML frontmatter"
    return
  fi
  while IFS= read -r line; do
    if [[ -n $line && ! $line =~ ^[[:space:]] && ! $line =~ ^[A-Za-z][A-Za-z0-9_-]*(:\ .*|:)$ ]]; then
      fail "d. $f: malformed frontmatter line (expected 'key: value'): $line"
      ok=0
    elif [[ $line =~ ^([A-Za-z][A-Za-z0-9_-]*):[[:space:]]*(.*)$ ]]; then
      key=${BASH_REMATCH[1]}
      val=$(trim_value "${BASH_REMATCH[2]}")
      last_key=$key
      case "$FORBIDDEN_KEYS" in
        *" $key "*)
          fail "d. $f: frontmatter key '$key' is not allowed in agents"
          ok=0
          ;;
      esac
      case "$KNOWN_KEYS" in
        *" $key "*) ;;
        *) warn "d. $f: unknown frontmatter key '$key'" ;;
      esac
      case "$key" in
        name)
          name=$val
          has_name=1
          ;;
        description)
          desc=$val
          has_desc=1
          ;;
        model)
          model=$val
          has_model=1
          ;;
      esac
    elif [[ $line =~ ^[[:space:]]+[^[:space:]] ]] && [ "$last_key" = "description" ]; then
      desc_body=1
    fi
  done <<<"$fm"

  if [ "$has_name" -eq 0 ] || [ "$name" != "$stem" ]; then
    fail "d. $f: name must equal '$stem' (got '${name:-<missing>}')"
    ok=0
  fi
  case "$desc" in
    '' | '>' | '|' | '>-' | '|-' | '>+' | '|+')
      if [ "$has_desc" -eq 0 ] || [ "$desc_body" -eq 0 ]; then
        fail "d. $f: description is missing or empty"
        ok=0
      fi
      ;;
  esac
  if [ "$has_model" -eq 0 ]; then
    fail "d. $f: model is missing"
    ok=0
  else
    case "$model" in
      opus | sonnet | haiku | fable | inherit) ;;
      claude-*) ;;
      *)
        fail "d. $f: model '$model' is not one of opus/sonnet/haiku/fable/inherit or claude-*"
        ok=0
        ;;
    esac
  fi
  [ "$ok" -eq 0 ] || pass "d. $f frontmatter"
}

check_agents() {
  local f found=0
  for f in agents/*.md; do
    [ -e "$f" ] || continue
    found=1
    check_agent "$f"
  done
  [ "$found" -eq 1 ] || fail "d. no agents/*.md found"
}

# --- e. tests ----------------------------------------------------------------
# True when MANTRA_VERIFY_TOKEN matches the file an outer verify.sh created.
verify_token_ok() {
  local tok=${MANTRA_VERIFY_TOKEN:-} file=${MANTRA_VERIFY_TOKEN_FILE:-}
  [ -n "$tok" ] && [ -n "$file" ] && [ -f "$file" ] && [ "$(cat "$file" 2>/dev/null)" = "$tok" ]
}

TOKEN_DIR=''
cleanup_token() {
  if [ -n "$TOKEN_DIR" ] && [ -d "$TOKEN_DIR" ]; then
    rm -rf -- "$TOKEN_DIR" || true
  fi
}

check_tests() {
  local t out rc found=0 token
  if verify_token_ok; then
    warn "e. tests/ NOT run: this is a nested verify.sh inside an outer run (token verified)"
    return
  fi
  TOKEN_DIR=$(mktemp -d)
  trap cleanup_token EXIT
  token=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
  printf '%s' "$token" >"$TOKEN_DIR/token"
  export MANTRA_VERIFY_TOKEN="$token" MANTRA_VERIFY_TOKEN_FILE="$TOKEN_DIR/token"
  for t in tests/*.test.sh; do
    [ -e "$t" ] || continue
    found=1
    rc=0
    out=$(bash "$t" 2>&1) || rc=$?
    if [ "$rc" -eq 0 ]; then
      pass "e. $t ($(printf '%s\n' "$out" | tail -n 1))"
    else
      fail "e. $t exited $rc"
      printf '%s\n' "$out" | tail -n 25 | sed 's/^/        /'
    fi
  done
  unset MANTRA_VERIFY_TOKEN MANTRA_VERIFY_TOKEN_FILE
  cleanup_token
  [ "$found" -eq 1 ] || fail "e. no tests/*.test.sh found"
}

# --- f. shellcheck -----------------------------------------------------------
check_shellcheck() {
  local files=() f
  if ! command -v shellcheck >/dev/null 2>&1; then
    if [ "${CI:-}" = "true" ]; then
      fail "f. shellcheck is not installed (required when CI=true)"
    else
      echo "SKIP  f. shellcheck is not installed (it is required when CI=true)"
    fi
    return
  fi
  for f in scripts/*.sh hooks/*.sh tests/*.sh githooks/*; do
    [ -f "$f" ] && files+=("$f")
  done
  if [ "${#files[@]}" -eq 0 ]; then
    echo "SKIP  f. no shell files to check"
    return
  fi
  if shellcheck -x "${files[@]}"; then
    pass "f. shellcheck (${#files[@]} files)"
  else
    fail "f. shellcheck reported problems"
  fi
}

check_tools
check_rules_budget
check_sentinels
check_relative_links
check_agents
check_tests
check_shellcheck

echo
echo "verify: $PASSES passed, $WARNS warning(s), $FAILS failed"
[ "$FAILS" -eq 0 ]
