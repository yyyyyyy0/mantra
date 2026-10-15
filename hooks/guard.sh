#!/usr/bin/env bash
# PreToolUse guard for the Bash tool.
#
# Reads the hook JSON on stdin and takes .tool_input.command. Backslash-newline
# continuations are joined, the command is lowercased, then split into
# segments on & && | || ; and newlines. Each segment is normalized (leading
# grouping characters, shell keywords such as `then`/`do`, env assignments,
# absolute paths and wrappers such as `command`, `time -p`, `env -i`,
# `nice -n 10`, `xargs -0`, `eval`, `bash -c` are stripped) and checked against
# a deny list of destructive commands and git-hook bypasses. On a match it
# prints one permissionDecision=deny JSON object and exits 0. Otherwise it
# prints nothing and exits 0.
#
# FAIL-OPEN: if jq is not installed (one line on stderr), stdin is not
# parseable JSON, or there is no .tool_input.command, the hook exits 0 and the
# command runs.
#
# This is a seatbelt against accidents, not a sandbox. Quoted text that
# contains a separator (for example "a; rm -rf x") is split too and can cause
# a false positive, which is the intended direction of error; a destructive
# command nested mid-segment (`echo $(rm -rf x)`, `find -exec rm -rf`) is not
# detected.
#
# Registration is manual (settings.json -> hooks.PreToolUse, matcher "Bash",
# command: ~/.mantra/live/hooks/guard.sh). This script registers nothing.
unset CDPATH

if ! command -v jq >/dev/null 2>&1; then
  echo "guard.sh: jq not found; the command guard is disabled (fail-open)" >&2
  exit 0
fi

input=$(cat)
cmd=$(printf '%s' "$input" | tr -d '\000-\010\013-\037' | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
[ -n "$cmd" ] || exit 0
if [[ $cmd == *$'\\\n'* ]]; then
  cmd=${cmd//$'\\\n'/ }
fi

LABELS=()
REGEXES=()
add_rule() {
  LABELS+=("$1")
  REGEXES+=("$2")
}

# `git`, then any global options (-C <dir>, -c <k=v>, --flag, -x), then a space.
GIT_OPTS='([[:space:]]+(-[cC][[:space:]]+[^[:space:]]+|-[^[:space:]]+))*'
GIT="^git${GIT_OPTS}[[:space:]]+"
# What may follow the end of a token: whitespace, end of line, or a closer.
END='([[:space:])}"'"'"'`<>]|$)'

add_rule 'git reset --hard' "${GIT}reset([[:space:]].*)?[[:space:]]--hard${END}"
add_rule 'git clean -f/-d/-x' "${GIT}clean[[:space:]]+(.*[[:space:]])?(-[a-z]*[fdx][a-z]*|--force)${END}"
add_rule 'git push --force / -f / --force-with-lease / +refspec' \
  "${GIT}push([[:space:]].*)?[[:space:]](--force[^[:space:]]*|-[a-z]*f[a-z]*|\\+[^[:space:]]+)${END}"
add_rule 'git commit/push/merge/rebase --no-verify' \
  "${GIT}(commit|push|merge|rebase)([[:space:]].*)?[[:space:]]--no-verify(=[^[:space:]]*)?${END}"
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

# Things that may precede the real command in a segment.
RE_LEAD='^[[:space:]({!"$`'"'"']+'
RE_PATH='^(\\|[^[:space:]=]*/)'
RE_ENV='^[a-z_][a-z0-9_]*=[^[:space:]]*[[:space:]]+'
RE_KW='^(if|then|else|elif|do|while|until)[[:space:]]+'
RE_WRAP='^(command|builtin|exec|nohup|eval|(ba|z|da)?sh[[:space:]]+-[a-z]*c)[[:space:]]+'
RE_WRAP_OPT='^(time|env|nice|timeout|xargs)([[:space:]]+-[^[:space:]]+([[:space:]]+([0-9][0-9.]*[smhd]?|\{\}))?)*([[:space:]]+[0-9][0-9.]*[smhd]?)?[[:space:]]+'

# Sets NORM to segment $1 without leading wrappers, keywords and paths.
NORM=''
normalize() {
  local s=$1 prev=''
  while [ "$s" != "$prev" ]; do
    prev=$s
    if [[ $s =~ $RE_LEAD ]]; then s=${s:${#BASH_REMATCH[0]}}; fi
    if [[ $s =~ $RE_ENV ]]; then s=${s:${#BASH_REMATCH[0]}}; fi
    if [[ $s =~ $RE_PATH ]]; then s=${s:${#BASH_REMATCH[0]}}; fi
    if [[ $s =~ $RE_KW ]]; then s=${s:${#BASH_REMATCH[0]}}; fi
    if [[ $s =~ $RE_WRAP ]]; then s=${s:${#BASH_REMATCH[0]}}; fi
    if [[ $s =~ $RE_WRAP_OPT ]]; then s=${s:${#BASH_REMATCH[0]}}; fi
  done
  NORM=${s%"${s##*[![:space:]]}"}
}

# rm with both a recursive and a force flag (-rf, -fr, -r -f, --recursive --force).
is_rm_rf() {
  local s=$1
  [[ $s =~ ^rm${END} ]] || return 1
  [[ $s =~ [[:space:]](-[a-z]*r[a-z]*|--recursive)${END} ]] || return 1
  [[ $s =~ [[:space:]](-[a-z]*f[a-z]*|--force)${END} ]] || return 1
  return 0
}

# Git hook bypass through core.hooksPath. Allowed: the repo's own `githooks`
# value, and read/unset calls (--get, --unset, --list, or no value at all).
hooks_path_override() {
  local s=$1
  [[ $s == *hookspath* ]] || return 1
  if [[ $s =~ ^git[[:space:]]+(.*[[:space:]])?--config-env=core\.hookspath ]]; then
    return 0
  fi
  if [[ $s =~ ^git[[:space:]]+(.*[[:space:]])?-c[[:space:]]+[\"\']?core\.hookspath= ]]; then
    [[ $s =~ core\.hookspath=[\"\']?githooks[\"\']?([[:space:]]|$) ]] && return 1
    return 0
  fi
  if [[ $s =~ ^git${GIT_OPTS}[[:space:]]+config([[:space:]].*)?[[:space:]]core\.hookspath ]]; then
    [[ $s =~ [[:space:]](--get|--get-all|--get-regexp|--unset|--unset-all|--list|-l)([[:space:]]|$) ]] && return 1
    [[ $s =~ core\.hookspath[[:space:]]*$ ]] && return 1
    [[ $s =~ core\.hookspath[[:space:]]+[\"\']?githooks[\"\']?([[:space:]]|$) ]] && return 1
    return 0
  fi
  return 1
}

matched=''
matched_seg=''
while IFS= read -r seg || [ -n "$seg" ]; do
  seg=${seg#"${seg%%[![:space:]]*}"}
  [ -n "$seg" ] || continue

  # Fast path for long prose / heredoc bodies: a segment whose first word is a
  # plain word that no rule or wrapper knows about cannot match.
  case ${seg%%[[:space:]]*} in
    git | rm | rmdir | dd | fdisk | sudo | passwd | userdel | iptables | fly | flyctl | mkfs) ;;
    shutdown | reboot | halt | poweroff | command | builtin | exec | nohup | eval) ;;
    sh | bash | zsh | dash | time | env | nice | timeout | xargs) ;;
    if | then | else | elif | do | while | until) ;;
    *[!a-z0-9]*) ;;
    *)
      case $seg in
        *drop* | *husky* | *git_config_* | *hookspath*) ;;
        *) continue ;;
      esac
      ;;
  esac

  # Hook bypass through the environment (normalize() strips env assignments).
  if [[ $seg == *husky* || $seg == *git_config_* ]]; then
    if [[ $seg =~ (^|[[:space:]])husky(_skip_hooks)?=[^[:space:]]+ ]]; then
      matched='HUSKY=… (git hook bypass)'
      matched_seg=$seg
      break
    fi
    if [[ $seg =~ git_config_key_[0-9]+=[\"\']?core\.hookspath ]]; then
      matched='GIT_CONFIG_KEY_n=core.hooksPath (git hook bypass)'
      matched_seg=$seg
      break
    fi
  fi

  normalize "$seg"
  seg=$NORM
  [ -n "$seg" ] || continue

  if hooks_path_override "$seg"; then
    matched='core.hooksPath override (git hook bypass)'
    matched_seg=$seg
    break
  fi
  if is_rm_rf "$seg"; then
    matched='rm -rf'
    matched_seg=$seg
    break
  fi
  i=0
  while [ "$i" -lt "${#LABELS[@]}" ]; do
    if [[ $seg =~ ${REGEXES[$i]} ]]; then
      matched=${LABELS[$i]}
      matched_seg=$seg
      break 2
    fi
    i=$((i + 1))
  done
done < <(printf '%s\n' "$cmd" | tr '[:upper:]' '[:lower:]' | tr '&|;' '\n')

[ -n "$matched" ] || exit 0

reason="危険なコマンドのパターン「${matched}」に一致したためブロックしました。別の書き方で回避せず、必要ならユーザーに理由を説明して、ユーザー自身に実行してもらってください（サブエージェントは呼び出し元に報告してください）。ファイルの削除には rm ではなく trash を使ってください。"
if [[ $matched_seg =~ ^git([[:space:]]|[[:space:]].*[[:space:]])commit ]]; then
  reason="${reason}コミットメッセージにブロック対象の文字列を書いただけの場合は、メッセージをファイルに書いて git commit -F <file> を使ってください。"
fi
jq -cn --arg reason "$reason" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
exit 0
