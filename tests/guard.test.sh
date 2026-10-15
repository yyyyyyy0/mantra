#!/usr/bin/env bash
# Tests for hooks/guard.sh: feeds hook JSON on stdin and checks deny / allow.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
GUARD="$ROOT/hooks/guard.sh"

if ! command -v jq >/dev/null 2>&1; then
  echo "guard.test.sh: jq is required" >&2
  exit 1
fi

pass=0
fail=0

payload() {
  jq -cn --arg c "$1" '{tool_name: "Bash", tool_input: {command: $c}}'
}

assert_deny() {
  local cmd=$1 out decision
  out=$(payload "$cmd" | bash "$GUARD")
  decision=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // empty' 2>/dev/null || true)
  if [ "$decision" = "deny" ] \
    && [ "$(printf '%s' "$out" | jq -r '.hookSpecificOutput.hookEventName')" = "PreToolUse" ] \
    && [ -n "$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecisionReason')" ]; then
    pass=$((pass + 1))
    echo "ok   deny   $cmd"
  else
    fail=$((fail + 1))
    echo "FAIL deny   $cmd (output: ${out:-<empty>})"
  fi
}

assert_allow() {
  local cmd=$1 out
  out=$(payload "$cmd" | bash "$GUARD")
  if [ -z "$out" ]; then
    pass=$((pass + 1))
    echo "ok   allow  $cmd"
  else
    fail=$((fail + 1))
    echo "FAIL allow  $cmd (output: $out)"
  fi
}

assert_deny 'git reset --hard HEAD'
assert_deny 'git push --force origin x'
assert_deny 'git push -f origin x'
assert_deny 'git push --force-with-lease origin x'
assert_deny 'rm -rf build'
assert_deny 'rm -fr build'
assert_deny 'echo ok && rm -rf x'
assert_deny 'sudo ls'
assert_deny 'git commit --no-verify -m x'
assert_deny 'git push --no-verify origin x'
assert_deny 'git clean -fd'
assert_deny 'git -C /tmp/repo reset --hard'
assert_deny 'ls | xargs rm -rf'
assert_deny '(rm -rf x)'
assert_deny 'cd build && (rm -rf out)'
assert_deny 'psql -c "DROP TABLE users;"'
assert_deny 'fly deploy'
assert_deny 'dd if=/dev/zero of=/dev/null'

assert_allow 'git status'
assert_allow 'git push origin main'
assert_allow 'trash build'
assert_allow 'rm file.txt'
assert_allow 'grep -- --force README.md'
assert_allow 'echo hello'
assert_allow 'git commit -m "docs: mention git reset --hard in the guard list"'
assert_allow 'git push --follow-tags origin main'
assert_allow 'git clean -n'
assert_allow 'git commit -m "feat: block rm -rf (via the guard)"'

# Fail-open on unparseable input, and on JSON without a command.
for raw in 'this is not json' '{"tool_input":' '{"tool_name":"Bash","tool_input":{}}' ''; do
  out=$(printf '%s' "$raw" | bash "$GUARD")
  if [ -z "$out" ]; then
    pass=$((pass + 1))
    echo "ok   allow  (stdin: ${raw:-<empty>})"
  else
    fail=$((fail + 1))
    echo "FAIL allow  (stdin: $raw) output: $out"
  fi
done

# Fail-open when jq is not on PATH (even for a command that would be denied).
json=$(payload 'rm -rf build')
out=$(printf '%s' "$json" | PATH=/nonexistent "$BASH" "$GUARD")
if [ -z "$out" ]; then
  pass=$((pass + 1))
  echo "ok   allow  (jq missing)"
else
  fail=$((fail + 1))
  echo "FAIL allow  (jq missing) output: $out"
fi

echo "guard.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
