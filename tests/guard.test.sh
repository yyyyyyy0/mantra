#!/usr/bin/env bash
# Tests for hooks/guard.sh: feeds hook JSON on stdin and checks deny / allow.
# shellcheck disable=SC2016  # the tested commands are literal strings containing $ and backticks
set -euo pipefail
unset CDPATH GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY

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
assert_deny 'git commit -n -m x'
assert_deny 'git commit -an -m x'
assert_deny 'HUSKY=0 git commit -m x'
assert_deny 'HUSKY_SKIP_HOOKS=1 git push origin x'

# Closers after the pattern: subshells, quoted -c / eval payloads.
assert_deny '(git reset --hard)'
assert_deny '{ git reset --hard; }'
assert_deny 'bash -c "git reset --hard"'
assert_deny "sh -c 'git push --force origin x'"
assert_deny 'bash -lc "rm -rf x"'
assert_deny 'eval "git commit -m x --no-verify"'
assert_deny '`git reset --hard`'

# Backslash-newline continuations.
assert_deny $'git push \\\n  --force origin x'
assert_deny $'git commit -m x \\\n  --no-verify'
assert_deny $'rm \\\n -rf x'

# Shell keywords and compound commands.
assert_deny 'if true; then git reset --hard; fi'
assert_deny 'for f in a b; do rm -rf $f; done'
assert_deny 'while true; do git push -f origin x; done'
assert_deny $'for f in a b\ndo\n  rm -rf "$f"\ndone'
assert_deny 'until false; do sudo ls; done'
assert_deny '! git reset --hard'

# Wrappers with options.
assert_deny 'env -i git reset --hard'
assert_deny 'env FOO=1 rm -rf x'
assert_deny 'nice -n 10 rm -rf x'
assert_deny 'time -p rm -rf x'
assert_deny 'timeout 5 rm -rf x'
assert_deny 'xargs -0 rm -rf'
assert_deny 'xargs -n1 rm -rf'
assert_deny 'xargs -I{} rm -rf {}'
assert_deny 'xargs -I {} rm -rf {}'
assert_deny 'command rm -rf x'
assert_deny 'nohup git push -f origin x'

# Absolute paths and escaped command names.
assert_deny '/bin/rm -rf x'
assert_deny '\rm -rf x'
assert_deny '/usr/bin/git reset --hard'
assert_deny 'FOO=/usr/bin git reset --hard'

# Hook bypass through git configuration.
assert_deny 'git -c core.hooksPath=/dev/null commit -m x'
assert_deny 'git -c core.hooksPath=.husky push origin x'
assert_deny 'git config core.hooksPath /dev/null'
assert_deny 'git config --global core.hooksPath ~/.nohooks'
assert_deny 'git config --local core.hooksPath .git/hooks'
assert_deny 'env FOO=1 git config core.hooksPath /dev/null'
assert_deny 'git --config-env=core.hooksPath=EVIL commit -m x'
assert_deny 'GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null GIT_CONFIG_COUNT=1 git commit -m x'
# Only the exact forms `git config core.hooksPath githooks` and
# `git config --get core.hooksPath` pass; every other way to touch it is denied.
assert_deny 'git -c core.hooksPath=githooks status'
assert_deny 'git -c core.hookspath=githooks status'
assert_deny 'git config --local core.hooksPath githooks'
assert_deny 'git config core.hooksPath'
assert_deny 'git config --unset core.hooksPath'
assert_deny 'git config --global --unset core.hooksPath'
assert_deny 'git config --get-all core.hooksPath'
assert_deny 'git -C repo config core.hooksPath githooks'

# Quote-aware splitting: a separator inside quotes does not hide a later flag.
assert_deny 'git commit -m "fix: a; b" --no-verify'
assert_deny 'git commit -m "R&D" -n'
assert_deny 'git push -m "a|b" --force'
assert_deny "git commit -m 'x; y' --no-verify"
assert_deny 'git commit -m "say \"hi\"; ok" --no-verify'
assert_deny $'git commit -m "line one\nline two" --no-verify'
assert_deny 'bash -c "echo a; rm -rf x"'
# An apostrophe in a heredoc body must not hide a later command from the guard.
assert_deny $'git commit -F - <<\'EOF\'\nfix: don\'t do it\nEOF\ngit push --force origin x'
assert_deny $'echo "unbalanced\nrm -rf x'

# Global git options with quoted or separate arguments.
assert_deny 'git -C "dir with space" reset --hard'
assert_deny "git -C 'dir with space' push --force origin x"
assert_deny 'git --git-dir=/x/.git --work-tree=/x reset --hard'
assert_deny 'git --git-dir /x/.git --work-tree /x push -f origin x'
assert_deny 'git -c user.name="A B" commit --no-verify -m x'

# Prefix abbreviations git accepts.
assert_deny 'git reset --ha'
assert_deny 'git reset --har HEAD~1'
assert_deny 'git commit --no-veri -m x'
assert_deny 'git commit --no-verif -m x'
assert_deny 'git push --no-veri origin x'
assert_deny 'git merge --no-verif topic'
assert_deny 'git rebase --no-veri main'
assert_deny 'git merge --no-verify topic'
assert_deny 'git rebase --no-verify main'

assert_allow 'git status'
assert_allow 'git push origin main'
assert_allow 'git push -n origin main'
assert_allow 'git commit -m x'
assert_allow 'trash build'
assert_allow 'rm file.txt'
assert_allow 'grep -- --force README.md'
assert_allow 'echo hello'
assert_allow 'git commit -m "docs: mention git reset --hard in the guard list"'
assert_allow 'git push --follow-tags origin main'
assert_allow 'git clean -n'
assert_allow 'git commit -m "feat: block rm -rf (via the guard)"'
assert_allow 'git config core.hooksPath githooks'
assert_allow 'GIT CONFIG CORE.HOOKSPATH GITHOOKS'
assert_allow 'git config --get core.hooksPath'
assert_allow 'git config --global --list'
assert_allow 'git merge topic'
assert_allow 'git commit -m "x" && git log -n 5'
assert_allow 'git commit -m "fix: a; b" -S'
assert_allow 'git commit -m "R&D notes"'
assert_allow 'git -C "dir with space" status'
assert_allow 'git -C "dir with space" push origin main'
assert_allow 'git reset --soft HEAD~1'
assert_allow 'git commit --verify -m x'
assert_allow 'git push --no-thin origin main'
assert_allow 'echo "it is fine"; git status'
assert_allow 'nice -n 10 make test'
assert_allow 'xargs -0 echo'
assert_allow 'timeout 5 sleep 1'
assert_allow 'env -i printenv'
assert_allow 'if true; then echo ok; fi'
assert_allow 'for f in a b; do echo "$f"; done'
assert_allow '/bin/ls -la'
assert_allow $'git push origin main \\\n  --tags'

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

# Fail-open when jq is not on PATH (even for a command that would be denied),
# with exactly one line on stderr.
json=$(payload 'rm -rf build')
err_file=$(mktemp)
out=$(printf '%s' "$json" | PATH=/nonexistent "$BASH" "$GUARD" 2>"$err_file")
if [ -z "$out" ] && [ "$(wc -l <"$err_file" | tr -d ' ')" = "1" ]; then
  pass=$((pass + 1))
  echo "ok   allow  (jq missing: silent on stdout, one line on stderr)"
else
  fail=$((fail + 1))
  echo "FAIL allow  (jq missing) stdout: $out stderr: $(cat "$err_file")"
fi
rm -f -- "$err_file"

# The deny reason points at `git commit -F` for commit messages.
out=$(payload 'git commit -m "never use --no-verify"' | bash "$GUARD")
if printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecisionReason' | grep -Fq -- 'git commit -F'; then
  pass=$((pass + 1))
  echo "ok   deny reason suggests git commit -F"
else
  fail=$((fail + 1))
  echo "FAIL deny reason suggests git commit -F (output: ${out:-<empty>})"
fi

# A large heredoc must not make the hook slow.
big=$(mktemp)
{
  echo "git commit -F - <<'EOF'"
  for i in $(seq 1 1700); do
    echo "line $i: added the platform form handler and updated the dd/rm notes for release $i"
    echo "git log --oneline -n $i"
    echo "env FOO=$i rm file$i.txt"
  done
  echo "EOF"
} >"$big"
start=$SECONDS
out=$(jq -cn --rawfile c "$big" '{tool_name: "Bash", tool_input: {command: $c}}' | bash "$GUARD")
elapsed=$((SECONDS - start))
rm -f -- "$big"
if [ -z "$out" ] && [ "$elapsed" -le 10 ]; then
  pass=$((pass + 1))
  echo "ok   allow  (5100-line heredoc in ${elapsed}s)"
else
  fail=$((fail + 1))
  echo "FAIL 5100-line heredoc: ${elapsed}s, output: ${out:-<empty>}"
fi

# Same size, but every line has quotes, apostrophes and separators.
big=$(mktemp)
{
  echo "git commit -F - <<'EOF'"
  for i in $(seq 1 3000); do
    echo "line $i: don't break \"quoted\" things; a & b | c, release $i"
  done
  echo "EOF"
} >"$big"
start=$SECONDS
out=$(jq -cn --rawfile c "$big" '{tool_name: "Bash", tool_input: {command: $c}}' | bash "$GUARD")
elapsed=$((SECONDS - start))
rm -f -- "$big"
if [ -z "$out" ] && [ "$elapsed" -le 10 ]; then
  pass=$((pass + 1))
  echo "ok   allow  (3000 quote-heavy heredoc lines in ${elapsed}s)"
else
  fail=$((fail + 1))
  echo "FAIL quote-heavy heredoc: ${elapsed}s, output: ${out:-<empty>}"
fi

echo "guard.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
