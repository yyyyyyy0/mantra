#!/usr/bin/env bash
# Canonical check for the mantra repo. Exits non-zero on any failure.
#
#   bash scripts/verify.sh
#   VERIFY_SKIP_RULES=1 bash scripts/verify.sh   # skip the rules/ checks
#
# Checks:
#   a. always-on rules budget (rules without a `paths:` frontmatter key)
#   b. sentinel strings that must survive in rules/
#   c. no relative "](../" links in rules/ or agents/
#   d. agents/*.md frontmatter (name, description, model, known keys)
#   e. every tests/*.test.sh passes
#   f. shellcheck on the shell scripts, when shellcheck is installed
#
# VERIFY_SKIP_RULES=1 skips a, b and the rules/ half of c (used while rules/
# still holds a rule set that predates the budget).
set -euo pipefail

RULES_MAX_LINES=${RULES_MAX_LINES:-200}
RULES_MAX_BYTES=${RULES_MAX_BYTES:-8192}
SENTINELS=(
  '### FM-VERSION'
  '### FM-AGENT-CRITIC'
  'Do not leave model assignment implicit.'
  '## Do without being asked'
)
KNOWN_KEYS=" name description tools disallowedTools model effort permissionMode maxTurns background isolation color skills mcpServers hooks memory initialPrompt omitClaudeMd autoCompactWindow experimental "
VERIFY_SKIP_RULES=${VERIFY_SKIP_RULES:-0}

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
    \"*\") v=${v#\"}; v=${v%\"} ;;
    \'*\') v=${v#\'}; v=${v%\'} ;;
  esac
  printf '%s' "$v"
}

# --- a. always-on rules budget -----------------------------------------------
check_rules_budget() {
  if [ ! -d rules ]; then
    fail "a. rules/ directory is missing"
    return
  fi
  local total_lines=0 total_bytes=0 f lines bytes fm
  while IFS= read -r f; do
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
  done < <(find rules -type f -name '*.md' | sort)

  if [ "$total_lines" -le "$RULES_MAX_LINES" ] && [ "$total_bytes" -le "$RULES_MAX_BYTES" ]; then
    pass "a. always-on rules: $total_lines/$RULES_MAX_LINES lines, $total_bytes/$RULES_MAX_BYTES bytes"
  else
    fail "a. always-on rules over budget: $total_lines lines (max $RULES_MAX_LINES), $total_bytes bytes (max $RULES_MAX_BYTES)"
  fi
}

# --- b. sentinels ------------------------------------------------------------
check_sentinels() {
  local s missing=0
  for s in "${SENTINELS[@]}"; do
    if [ -d rules ] && grep -rqF --include='*.md' -- "$s" rules; then
      :
    else
      fail "b. sentinel missing from rules/: $s"
      missing=1
    fi
  done
  [ "$missing" -eq 1 ] || pass "b. all ${#SENTINELS[@]} sentinels present in rules/"
}

# --- c. relative links -------------------------------------------------------
check_relative_links() {
  local dirs=(agents) hits
  [ "$VERIFY_SKIP_RULES" = "1" ] || dirs=(rules agents)
  local existing=() d
  for d in "${dirs[@]}"; do
    [ -d "$d" ] && existing+=("$d")
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
    if [[ $line =~ ^([A-Za-z][A-Za-z0-9_-]*):[[:space:]]*(.*)$ ]]; then
      key=${BASH_REMATCH[1]}
      val=$(trim_value "${BASH_REMATCH[2]}")
      last_key=$key
      case "$KNOWN_KEYS" in
        *" $key "*) ;;
        *) warn "d. $f: unknown frontmatter key '$key'" ;;
      esac
      case "$key" in
        name) name=$val; has_name=1 ;;
        description) desc=$val; has_desc=1 ;;
        model) model=$val; has_model=1 ;;
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
check_tests() {
  local t out rc found=0
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
  [ "$found" -eq 1 ] || fail "e. no tests/*.test.sh found"
}

# --- f. shellcheck -----------------------------------------------------------
check_shellcheck() {
  local files=() f
  if ! command -v shellcheck >/dev/null 2>&1; then
    echo "SKIP  f. shellcheck is not installed"
    return
  fi
  for f in scripts/*.sh hooks/*.sh tests/*.sh githooks/*; do
    [ -f "$f" ] && files+=("$f")
  done
  if [ "${#files[@]}" -eq 0 ]; then
    echo "SKIP  f. no shell files to check"
    return
  fi
  if shellcheck "${files[@]}"; then
    pass "f. shellcheck (${#files[@]} files)"
  else
    fail "f. shellcheck reported problems"
  fi
}

if [ "$VERIFY_SKIP_RULES" = "1" ]; then
  echo "SKIP  a, b. VERIFY_SKIP_RULES=1 (rules budget and sentinels not checked)"
else
  check_rules_budget
  check_sentinels
fi
check_relative_links
check_agents
check_tests
check_shellcheck

echo
echo "verify: $PASSES passed, $WARNS warning(s), $FAILS failed"
[ "$FAILS" -eq 0 ]
