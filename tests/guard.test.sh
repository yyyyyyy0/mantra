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
# Only the exact forms `git config core.hooksPath githooks`,
# `git config core.hooksPath` and `git config --get core.hooksPath` pass (also
# inside a subshell); every other way to touch it is denied.
assert_deny 'git -c core.hooksPath=githooks status'
assert_deny 'git -c core.hookspath=githooks status'
assert_deny 'git config --local core.hooksPath githooks'
assert_deny 'git config --unset core.hooksPath'
assert_deny 'git config --global --unset core.hooksPath'
assert_deny 'git config --get-all core.hooksPath'
assert_deny 'git -C repo config core.hooksPath githooks'
# A `git -C <dir>` prefix is accepted for the two reads only.
assert_deny 'git -C repo config core.hooksPath /dev/null'
assert_deny 'git -C repo config --unset core.hooksPath'
assert_deny 'git -C repo config --get-all core.hooksPath'
assert_deny 'git -C repo -c core.hooksPath=/dev/null config --get core.hooksPath'
assert_deny 'git -C repo commit config --get core.hooksPath'
assert_deny 'git -C repo config --get core.hooksPath /dev/null'
assert_deny 'echo /dev/null | xargs git -C repo config core.hooksPath'
# A subshell closer is dropped only after the exact forms; it never hides a value.
assert_deny '( cd x && git config core.hooksPath /dev/null )'
assert_deny '(git config core.hooksPath /dev/null)'
assert_deny '( git config --unset core.hooksPath )'
assert_deny '(git config core.hooksPath githooks;git config core.hooksPath /dev/null)'
assert_deny 'git config core.hooksPath githooks}'
assert_deny 'git config core.hooksPath githooks\)'
assert_deny 'git config core.hooksPath $(echo /dev/null)'

# Quoted text is data when the command only reads it (jq, echo, printf, grep,
# egrep, fgrep): a separator or a hook-bypass word inside the quotes does not
# count.
# Everything below is still checked: executors, unquoted separators, strings
# that are run as code, and commands where the scanner could misread the quotes.
assert_deny "bash -c 'cd x; rm -rf y'"
assert_deny "sh -c 'a && git reset --hard'"
assert_deny "FOO=1 bash -c 'cd x; rm -rf y'"
assert_deny "x=a\\ jq bash -c 'cd x; rm -rf y'"
assert_deny "echo 'a' && rm -rf y"
assert_deny "echo 'a'; git commit -m 'x; y' --no-verify"
assert_deny "echo 'a' | xargs sh -c 'cd x; rm -rf y'"
assert_deny "for c in 'a'; do bash -c 'cd x; rm -rf y'; done"
assert_deny "psql -c 'drop table users;'"
# A string piped into anything but a filter, or a shell given a script file.
assert_deny "echo 'cd x; rm -rf y' | bash"
assert_deny "echo 'cd x; rm -rf y' | sh -s"
assert_deny "printf '%s' 'a && git reset --hard' | env bash"
assert_deny $'echo \'cd x; rm -rf y\' | sh\necho done'
assert_deny "echo 'cd x; rm -rf y' | /bin/bash"
assert_deny "echo 'cd x; rm -rf y' | bash 2>&1"
assert_deny "echo 'cd x; rm -rf y' | sh > out.log"
assert_deny "echo 'cd x; rm -rf y' | bash -"
assert_deny "echo 'cd x; rm -rf y' | bash +x"
assert_deny "echo 'cd x; rm -rf y' | /usr/bin/env bash"
assert_deny "echo 'cd x; rm -rf y' | source /dev/stdin"
assert_deny "echo 'cd x; rm -rf y' | . /dev/stdin"
assert_deny "echo 'cd x; rm -rf y' | xargs -I{} sh -c {}"
assert_deny "echo 'cd x; rm -rf y' | bash -s foo"
assert_deny "echo 'cd x; rm -rf y' | bash -o pipefail"
assert_deny "echo 'cd x; rm -rf y' | sh 2>&1 | tail"
assert_deny "echo 'cd x; rm -rf y' |& bash"
assert_deny "echo 'cd x; rm -rf y' | env FOO=1 bash"
assert_deny "echo 'cd x; rm -rf y' | (bash)"
assert_deny "echo 'cd x; rm -rf y' | { bash; }"
assert_deny "echo 'cd x; rm -rf y' | busybox sh"
assert_deny "echo 'cd x; rm -rf y' | python3"
assert_deny "echo 'cd x; rm -rf y' | \$SHELL"
assert_deny "echo 'cd x; rm -rf y' | \$(echo bash)"
assert_deny "echo 'cd x; rm -rf y' | 'bash'"
assert_deny "echo 'cd x; rm -rf y' | cat | bash"
assert_deny "echo 'cd x; rm -rf y' | while read l; do eval \"\$l\"; done"
assert_deny "echo 'cd x; rm -rf y' > >(bash)"
assert_deny $'echo \'cd x; rm -rf y\' |\nbash'
# The pipe may be on a later line than the string (a loop or group body).
assert_deny $'for d in a b; do\n  echo \'cd \'$d\' && rm -rf build\'\ndone | sh'
assert_deny $'{\n  echo \'cd a && rm -rf build\'\n} | bash'
assert_deny $'(\n  echo \'cd a && rm -rf build\'\n) | bash'
assert_deny $'{\n  echo \'cd a && rm -rf build\'\n} > >(bash)'
# A for list or string that is run: eval, sh -c with or without other options.
assert_deny "for c in 'cd x; rm -rf y'; do eval \"\$c\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do bash -c \"\$c\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do sh -c \$c; done"
assert_deny "for c in 'cd x; rm -rf y'; do bash -e -c \"\$c\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do bash --norc -c \"\$c\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do sh -e -c \"\$c\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do bash -o pipefail -c \"\$c\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do env bash -e -c \"\$c\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do /bin/bash -x -c \"\$c\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do timeout 5 bash -e -c \"\$c\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do (bash -e -c \"\$c\"); done"
# A for list is never blanked, whatever its body does: the body consumes the
# items, and the commands that could run them (ssh, su -c, a quoted or
# substituted command word, a capture, a group after a pipe) cannot all be
# told apart from printing them. Run test inputs one by one, or from a file.
assert_deny "for c in 'cd x; rm -rf y'; do echo \"\$c\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do jq -cn --arg c \"\$c\" '{tool_input:{command:\$c}}' | bash hooks/guard.sh; done"
assert_deny "for c in 'cd x; rm -rf y'; do 'ssh' host \"\$c\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do \"\$SHELL\" -c \"\$c\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do echo \$(ssh host \"\$c\"); done"
assert_deny "for c in 'cd x; rm -rf y'; do echo \"\$(echo \"\$c\" | bash)\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do ssh host \"\$c\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do su -c \"\$c\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do docker exec ctr bash -e -c \"\$c\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do bash <<< \"\$c\"; done"
assert_deny "for c in 'cd x; rm -rf y'; do echo \"\$c\" > run.sh; bash run.sh; done"
assert_deny "for c in 'cd x; rm -rf y'; do \$c; done"
assert_deny $'for c in \'cd x; rm -rf y\'\ndo\n  ssh host "$c"\ndone'
assert_deny "printf -v c '%s' 'a; rm -rf x'; bash -e -c \"\$c\""
# More ways a piped string reaches a shell as its script: stdin file names,
# options with +, variables, process substitution.
assert_deny "echo 'a; rm -rf x' | bash /dev/stdin"
assert_deny "echo 'a; rm -rf x' | sh /dev/fd/0"
assert_deny "echo 'a; rm -rf x' | bash /proc/self/fd/0"
assert_deny "echo 'a; rm -rf x' | zsh /dev/stdin"
assert_deny "echo 'a; rm -rf x' | bash \$UNSET"
assert_deny "echo 'a; rm -rf x' | bash \\-s"
assert_deny "echo 'a; rm -rf x' > >(sh)"
assert_deny "echo \"a; rm -rf x\" > >(sh)"
assert_deny "echo 'a; rm -rf x' | cat > >(sh)"
assert_deny "bash <(true; echo 'a; rm -rf x')"
assert_deny ". <(true; echo 'a; rm -rf x')"
assert_deny "exec > >(sh); echo 'a; rm -rf x'"
# Only the first command after a pipe used to be looked at; a group or a
# negation can hold the shell, and a quoted command word is not plain text.
assert_deny "echo 'cd x; rm -rf y' | { cat /dev/null; bash; }"
assert_deny "echo 'cd x; rm -rf y' | ( cat /dev/null; bash )"
assert_deny "echo 'cd x; rm -rf y' | ( \"\$SHELL\" )"
assert_deny "echo 'cd x; rm -rf y' | ! \"\$SHELL\""
assert_deny "echo 'cd x; rm -rf y' | \"\$SHELL\""
# A path that reaches stdin through dots or a leading component.
assert_deny "echo 'a; rm -rf x' | bash /./dev/stdin"
assert_deny "echo 'a; rm -rf x' | bash /usr/../dev/stdin"
assert_deny "echo 'a; rm -rf x' | bash ../../../../dev/stdin"
assert_deny "echo 'a; rm -rf x' | bash ~/../../dev/stdin"
assert_deny "echo 'a; rm -rf x' | bash /tmp/../proc/self/fd/0"
# An escaped > before & is not a redirection.
assert_deny "echo \\>& ssh host 'cd x; rm -rf y'"
# printf -v keeps the string for later; so does anything the eval/-c check sees.
assert_deny "printf -v c '%s' 'cd x; rm -rf y'; ssh host \"\$c\""
assert_deny "echo 'cd x; rm -rf y' > f; bash -c \"\$(cat f)\""
assert_deny "echo 'cd x; rm -rf y' > f; bash -e -c \"\$(cat f)\""
assert_deny "echo 'cd x; rm -rf y' > f; eval \"\$(cat f)\""
# `>&` and `&>` are redirections, not separators: bash is still the command.
assert_deny "bash >&echo -c 'a; rm -rf x'"
assert_deny "bash 2>&echo -c 'a; rm -rf x'"
# xargs appends the value that `git config core.hooksPath` would read.
assert_deny 'echo /dev/null | xargs git config core.hooksPath'
assert_deny "printf '%s\\n' /tmp/evil | xargs -n1 git config core.hooksPath"
# A backslash before a newline can move a command into a data command's
# arguments (`a\\` is a literal backslash, so the newline is a separator).
assert_deny $'echo a\\\\\nssh host \'cd x; rm -rf y\''
# Double quotes expand: only text without $ or a backtick is data.
assert_deny 'echo "$(cd x; rm -rf y)"'
assert_deny 'echo "`cd x; rm -rf y`"'
assert_deny 'echo "$HOME; rm -rf y"'
# Quotes nested in $( ) inside double quotes pair up wrongly in a scanner that
# does not parse the substitution; what follows must stay visible.
assert_deny 'echo "$(cd "$d" && rm -rf build)"'
assert_deny 'echo "x: $(test -d "$d" && rm -rf "$d")"'
assert_deny 'echo "x: $(echo "a" ; rm -rf y)"'
assert_deny $'printf \'%s\\n\' "x: $(cd "$d" && git push --force origin y)"'
assert_deny 'grep -q "x" f && echo "ok: $(cd "$d" && rm -rf build)"'
assert_deny 'echo "done" "$(cd "$d"; rm -rf build)"'
assert_deny 'echo "$(cd "$d" && git config core.hooksPath /dev/null)"'
assert_deny 'echo "$(cd "$d" && HUSKY=0 git commit -m x)"'
assert_deny 'echo "`cd "$d" && rm -rf build`"'
# Unquoted substitutions: the string inside belongs to another command.
assert_deny "echo \$(ssh host 'cd x; rm -rf y')"
assert_deny "echo \`ssh host 'cd x; rm -rf y'\`"
assert_deny "echo <(ssh host 'cd x; rm -rf y')"
assert_deny "echo \$(bash -c 'cd x; rm -rf y')"
assert_deny "echo \`bash -c 'cd x; rm -rf y'\`"
assert_deny "echo <(bash -c 'cd x; rm -rf y')"
assert_deny "grep -r x \$(sh -c 'cd x; rm -rf y')"
assert_deny "for f in \$(bash -c 'cd x; rm -rf y'); do echo \$f; done"
assert_deny "printf '%s' \$(eval 'a; rm -rf y')"
# A stray apostrophe (comment, heredoc prose) must not shift which strings the
# blanking sees: the destructive command below is real.
assert_deny $'echo \'a\nb; rm -rf y\''
assert_deny $'echo start # don\'t\ngit push --force origin x\necho done # it\'s'
assert_deny $'echo \'x\' # it\'s\ngit commit -m \'a\' && rm -rf y \'main\''
assert_deny $'echo x # it\'s\ngit commit -m \'a\' ; git push --force origin \'main\''
assert_deny $'cat <<EOF\nfor the user\'s sake\nEOF\ngit commit -m \'a\'; rm -rf y; echo \'b\''
assert_deny $'echo hi # it\'s\necho \'x\' && rm -rf y && echo \'z\''
assert_deny $'echo hi # it\'s\ngit commit -m \'x\' && git push --force origin y && echo \'ok\''
assert_deny $'echo "hi" # it"s\ngit commit -m "x" && git push --force origin y && echo "ok"'
assert_deny $'grep -n foo f # it\'s\necho \'a\'; rm -rf x; echo \'b\''
assert_deny $'cat > notes.md <<\'EOF\'\nfor example it\'s fine\nEOF\ngit commit -m \'x\' && git push --force origin y && echo \'ok\''
assert_deny $'cat > notes.md <<\'EOF\'\necho it\'s here\nEOF\necho \'building\'; rm -rf dist; echo \'done\''
# A line over 20000 bytes is not scanned, so its strings stay visible.
long=$(head -c 20001 /dev/zero | tr '\0' x)
out=$(payload "echo 'a; rm -rf y' $long" | bash "$GUARD")
if [ "$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // empty')" = "deny" ]; then
  pass=$((pass + 1))
  echo "ok   deny   (string on a 20001-byte line)"
else
  fail=$((fail + 1))
  echo "FAIL deny   (string on a 20001-byte line) output: ${out:-<empty>}"
fi

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
# A value-less read, and the exact forms inside a subshell.
assert_allow 'git config core.hooksPath'
assert_allow '( cd x && git config core.hooksPath githooks )'
assert_allow '(cd x && git config core.hooksPath githooks)'
assert_allow '( git config --get core.hooksPath )'
assert_allow '(git config core.hooksPath)'
assert_allow 'git -C repo config --get core.hooksPath'
assert_allow 'git -C repo config core.hooksPath'
assert_allow 'git -C "dir with space" config --get core.hooksPath'
assert_allow '( cd x && git -C repo config --get core.hooksPath )'
# Quoted text that is only an argument of a data command.
assert_allow "jq -cn --arg c 'git config core.hooksPath githooks' '{tool_input:{command:\$c}}'"
assert_allow "jq -cn --arg c 'cd x && git config core.hooksPath githooks' '{tool_input:{command:\$c}}'"
assert_allow "jq -cn --arg c 'git commit -m x; git config core.hooksPath /dev/null' '{tool_input:{command:\$c}}' | bash hooks/guard.sh"
assert_allow "echo '{\"tool_input\":{\"command\":\"cd x && git reset --hard\"}}' | bash hooks/guard.sh"
assert_allow "echo 'a; git reset --hard' | sha256sum"
assert_allow "echo 'a; git reset --hard' | jq -R ."
assert_allow "echo 'a; git reset --hard' | wc -c | tr -d ' '"
assert_allow "(echo 'a; git reset --hard' | wc -c)"
assert_allow "echo 'a; rm -rf y' | bash ./run.sh"
assert_allow "echo 'a; rm -rf y' | bash ~/.mantra/live/hooks/guard.sh"
assert_allow "echo 'a; rm -rf y' |& cat"
assert_allow "echo 'a; rm -rf y' || echo none"
assert_allow "echo 'a; git reset --hard' \"\$(date)\""
assert_allow "echo 'a; git reset --hard'"
assert_allow "echo \"cd x && git reset --hard\""
assert_allow "printf '%s' 'x && rm -rf y'"
assert_allow "grep -rn 'git push --force; rm -rf' docs"
assert_allow "grep -rn 'drop table users' migrations"
assert_allow "echo 'HUSKY=0 git commit -m x'"
assert_allow "jq -cn --arg c 'GIT_CONFIG_KEY_0=core.hooksPath git commit -m x' '\$c'"
assert_allow "if true; then echo 'a; rm -rf y'; fi"
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

# A failing quoted-data pass must not switch the guard off: the unblanked text
# is checked instead. (awk shim that fails only for that program.)
shim=$(mktemp -d)
real_awk=$(command -v awk)
cat >"$shim/awk" <<EOF
#!/bin/sh
case "\$*" in *first_word*) exit 1 ;; esac
exec "$real_awk" "\$@"
EOF
chmod +x "$shim/awk"
out=$(payload 'echo ok && rm -rf x' | PATH="$shim:$PATH" bash "$GUARD")
if [ "$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // empty')" = "deny" ]; then
  pass=$((pass + 1))
  echo "ok   deny   (blanking pass fails: unblanked text is checked)"
else
  fail=$((fail + 1))
  echo "FAIL deny   (blanking pass fails) output: ${out:-<empty>}"
fi
rm -f -- "$shim/awk"
rmdir -- "$shim"

# bash 3.2 (the macOS /bin/bash) reads an apostrophe in a comment inside
# `< <( ... )` as a quote and cannot parse the guard at all, which turns every
# rule off. Keep such comments free of apostrophes.
bad_comments=$(sed -n '/^done < <(/,/^)$/p' "$GUARD" | grep -n "^[[:space:]]*#.*'" || true)
if [ -z "$bad_comments" ]; then
  pass=$((pass + 1))
  echo "ok   no apostrophe in a comment inside the process substitution"
else
  fail=$((fail + 1))
  echo "FAIL apostrophe in a comment inside the process substitution: $bad_comments"
fi

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
