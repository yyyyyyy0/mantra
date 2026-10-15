#!/usr/bin/env bash
# PreToolUse guard for the Bash tool.
#
# Reads the hook JSON on stdin, takes .tool_input.command, splits it into
# segments on && || ; | & and newlines, and checks every segment
# (case-insensitive, after stripping leading grouping characters, env
# assignments and wrappers such as `command`, `time`, `xargs`, `eval`,
# `bash -c`) against a deny list of destructive commands. On a match it prints
# one permissionDecision=deny JSON object and exits 0. Otherwise it prints
# nothing and exits 0.
#
# FAIL-OPEN: if jq is not installed, or stdin is not parseable JSON, or there
# is no .tool_input.command, the hook exits 0 silently and the command runs.
# This is a seatbelt against accidents, not a sandbox. Quoted text that
# contains a separator (for example "a; rm -rf x") is split too and can cause
# a false positive, which is the intended direction of error; a destructive
# command nested mid-segment (`echo $(rm -rf x)`, `find -exec rm -rf`) is not
# detected.
#
# Registration is manual (settings.json -> hooks.PreToolUse, matcher "Bash",
# command: ~/.mantra/live/hooks/guard.sh). This script registers nothing.

command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
cmd=$(printf '%s' "$input" | tr -d '\000-\010\013-\037' | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
[ -n "$cmd" ] || exit 0

LABELS=()
REGEXES=()
add_rule() {
  LABELS+=("$1")
  REGEXES+=("$2")
}

# `git`, then any global options (-C <dir>, -c <k=v>, --flag, -x), then a space.
GIT='^git([[:space:]]+(-[cC][[:space:]]+[^[:space:]]+|-[^[:space:]]+))*[[:space:]]+'
END='([[:space:]]|$)'

add_rule 'git reset --hard' "${GIT}reset([[:space:]].*)?[[:space:]]--hard${END}"
add_rule 'git clean -f/-d/-x' "${GIT}clean[[:space:]]+(.*[[:space:]])?(-[a-z]*[fdx][a-z]*|--force)${END}"
add_rule 'git push --force / -f / --force-with-lease / +refspec' \
  "${GIT}push([[:space:]].*)?[[:space:]](--force[^[:space:]]*|-[a-z]*f[a-z]*|\\+[^[:space:]]+)${END}"
add_rule 'git commit/push --no-verify' "${GIT}(commit|push)([[:space:]].*)?[[:space:]]--no-verify(=[^[:space:]]*)?${END}"
# `git commit -n` is --no-verify. (`git push -n` is --dry-run and stays allowed.)
add_rule 'git commit -n (--no-verify)' "${GIT}commit([[:space:]].*)?[[:space:]]-[a-z]*n[a-z]*${END}"
add_rule 'rmdir' "^rmdir${END}"
add_rule 'DROP TABLE/DATABASE/SCHEMA' 'drop[[:space:]]+(table|database|schema)([[:space:]]|;|$)'
add_rule 'fly deploy/scale/secrets set' "^(fly|flyctl)[[:space:]]+(deploy|scale|secrets[[:space:]]+set)${END}"
add_rule 'shutdown/reboot/halt/poweroff' "^(shutdown|reboot|halt|poweroff)${END}"
add_rule 'dd if=' "^dd[[:space:]]+(.*[[:space:]])?if="
add_rule 'mkfs' '^mkfs(\.|[[:space:]]|$)'
add_rule 'fdisk' "^fdisk${END}"
add_rule 'sudo' "^sudo${END}"
add_rule 'passwd/userdel/iptables' "^(passwd|userdel|iptables)${END}"

RE_LEAD='^[[:space:]({!"$`'"'"']+'
RE_ENV='^[a-z_][a-z0-9_]*=[^[:space:]]*[[:space:]]+'
RE_WRAP='^(command|builtin|exec|time|nohup|env|nice|xargs|eval|(ba|z|da)?sh[[:space:]]+-[a-z]*c)[[:space:]]+'

normalize() {
  local s=$1 prev=''
  while [ "$s" != "$prev" ]; do
    prev=$s
    if [[ $s =~ $RE_LEAD ]]; then s=${s:${#BASH_REMATCH[0]}}; fi
    if [[ $s =~ $RE_ENV ]]; then s=${s:${#BASH_REMATCH[0]}}; fi
    if [[ $s =~ $RE_WRAP ]]; then s=${s:${#BASH_REMATCH[0]}}; fi
  done
  s=${s%"${s##*[![:space:]]}"}
  printf '%s' "$s"
}

# rm with both a recursive and a force flag (-rf, -fr, -r -f, --recursive --force).
is_rm_rf() {
  local s=$1
  [[ $s =~ ^rm${END} ]] || return 1
  [[ $s =~ [[:space:]](-[a-z]*r[a-z]*|--recursive)${END} ]] || return 1
  [[ $s =~ [[:space:]](-[a-z]*f[a-z]*|--force)${END} ]] || return 1
  return 0
}

matched=''
while IFS= read -r raw || [ -n "$raw" ]; do
  seg=$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')
  # Hook bypass through the environment (normalize() strips env assignments).
  if [[ $seg =~ (^|[[:space:]])husky(_skip_hooks)?=[^[:space:]]+ ]]; then
    matched='HUSKY=… (git hook bypass)'
    break
  fi
  seg=$(normalize "$seg")
  [ -n "$seg" ] || continue
  if is_rm_rf "$seg"; then
    matched='rm -rf'
    break
  fi
  i=0
  while [ "$i" -lt "${#LABELS[@]}" ]; do
    if [[ $seg =~ ${REGEXES[$i]} ]]; then
      matched=${LABELS[$i]}
      break 2
    fi
    i=$((i + 1))
  done
done < <(printf '%s\n' "$cmd" | tr '&|;' '\n\n\n')

[ -n "$matched" ] || exit 0

reason="危険なコマンドのパターン「${matched}」に一致したためブロックしました。別の書き方で回避せず、必要ならユーザーに理由を説明して、ユーザー自身に実行してもらってください（サブエージェントは呼び出し元に報告してください）。ファイルの削除には rm ではなく trash を使ってください。"
jq -cn --arg reason "$reason" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
exit 0
