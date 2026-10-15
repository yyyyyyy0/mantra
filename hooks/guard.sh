#!/usr/bin/env bash
# PreToolUse guard for the Bash tool.
#
# Reads the hook JSON on stdin and takes .tool_input.command. Backslash-newline
# continuations are joined and the command is lowercased. Quoted strings that
# are only data for jq, echo, printf, grep, egrep, fgrep or a `for` list are
# blanked (see AWK_MASK and the first limit below). It is then split into
# segments twice, and the segments of both splits are checked: once on
# & && | || ; and newlines everywhere, and once with a quote-aware awk scanner
# that splits only outside quotes (so `git commit -m "a; b" --no-verify` is one
# segment). Each segment is normalized (leading grouping characters, shell
# keywords such as `then`/`do`, env assignments, absolute paths and wrappers
# such as `command`, `time -p`, `env -i`, `nice -n 10`, `xargs -0`, `eval`,
# `bash -c` are stripped) and checked against a deny list of destructive
# commands and git-hook bypasses. On a match it prints one
# permissionDecision=deny JSON object and exits 0. Otherwise it prints nothing
# and exits 0.
#
# FAIL-OPEN: if jq is not installed (one line on stderr), stdin is not
# parseable JSON, or there is no .tool_input.command, the hook exits 0 and the
# command runs.
#
# This is a seatbelt against accidents, not a sandbox. Residual limits:
#   - Quoted text that contains a separator (for example "a; rm -rf x") is also
#     split by the plain pass, so it can cause a false positive. That is the
#     intended direction of error. The exception is a closed string that is
#     only an argument of jq, echo, printf, grep, egrep, fgrep or a `for` list
#     (double quotes: no $ or backtick in it): it is blanked first, so
#     `jq --arg c 'a && git config core.hooksPath x'` passes. Blanking is
#     skipped for the whole command when a quote is still open at the end of
#     a line, when a line is over 20000 bytes, when a string is piped into
#     anything but a filter or `bash <plain file>` (`| bash`, `| sh -s`,
#     `| bash /dev/stdin`, `| env bash`, `| xargs`, `| python3`), when `<(`
#     or `>(` appears, when the command runs strings as code (`eval`,
#     `source`, `sh -c`, `bash -e -c`), and when a blanked `for` list is
#     followed by a command other than echo/printf/jq/grep/filters (`ssh`,
#     `su -c`, `bash <<<`, `$cmd`). A `$(` or backtick stops the blanking
#     for what follows it, so a string inside a capture such as
#     `r=$(jq --arg c 'a; b' ...)` is still split and can cause a false
#     positive. What a data command's string is used for later is not
#     followed: writing it to a file and running the file passes (`echo
#     'a; rm -rf x' > f; sh f`), as the same text without a separator
#     always did.
#   - `git config core.hooksPath` is read-only and allowed, with `git config
#     --get core.hooksPath` and the exact value `githooks` (a trailing `)` of a
#     subshell is ignored for these). Any other value, flag or global option
#     (`-C`, `-c`) is denied, including reads such as `--get-all`.
#   - A destructive command nested mid-segment is not detected:
#     `echo $(rm -rf x)`, `find -exec rm -rf`, `xargs -a list rm -rf`.
#   - Indirection is not followed: aliases, shell functions, variables
#     (`$CMD`), `source`d files, scripts that run rm/git themselves, other
#     interpreters (`python -c`, `perl -e`), and `git` through a wrapper not
#     listed above (`sudo` is itself denied).
#   - Option abbreviations are covered only for --no-verify (--no-veri...) and
#     reset --hard (--ha...). Other git aliases and config (alias.* or
#     push.default/remote.*.push that force) are not inspected.
#   - A heredoc body is checked line by line like any other text: a body line
#     that starts with a blocked command is denied (use `git commit -F <file>`
#     or avoid such lines); an apostrophe in a heredoc only disturbs the
#     quote-aware pass and switches the blanking off, the plain pass still
#     sees every line.
#   - Attribute-style tricks (`git -c alias.x='!rm -rf' x`) are not parsed.
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
joined=0
if [[ $cmd == *$'\\\n'* ]]; then
  cmd=${cmd//$'\\\n'/ }
  joined=1
fi

LABELS=()
REGEXES=()
add_rule() {
  LABELS+=("$1")
  REGEXES+=("$2")
}

# `git`, then any global options (-C <dir>, -c <k=v>, --git-dir <p>, --work-tree
# <p>, --flag, -x; arguments may be quoted), then a space.
ARG='(([^[:space:]"'"'"']|"[^"]*"|'"'"'[^'"'"']*'"'"')+)'
GIT_OPTS="([[:space:]]+(-[cC][[:space:]]+${ARG}|--(git-dir|work-tree|namespace|super-prefix|exec-path|config-env)[[:space:]]+${ARG}|-[^[:space:]]+))*"
GIT="^git${GIT_OPTS}[[:space:]]+"
# What may follow the end of a token: whitespace, end of line, or a closer.
END='([[:space:])}"'"'"'`<>]|$)'

add_rule 'git reset --hard' "${GIT}reset([[:space:]].*)?[[:space:]]--ha(r(d)?)?${END}"
add_rule 'git clean -f/-d/-x' "${GIT}clean[[:space:]]+(.*[[:space:]])?(-[a-z]*[fdx][a-z]*|--force)${END}"
add_rule 'git push --force / -f / --force-with-lease / +refspec' \
  "${GIT}push([[:space:]].*)?[[:space:]](--force[^[:space:]]*|-[a-z]*f[a-z]*|\\+[^[:space:]]+)${END}"
add_rule 'git commit/push/merge/rebase --no-verify' \
  "${GIT}(commit|push|merge|rebase)([[:space:]].*)?[[:space:]]--no-veri(f(y)?)?(=[^[:space:]]*)?${END}"
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

# Git hook bypass through core.hooksPath: any `git` segment that sets it with
# -c, --config-env or `git config`, except the exact forms below. Trailing
# `)` of a subshell is dropped for that comparison only (`( cd x && git config
# core.hooksPath githooks )`); `}` is not, because `githooks}` is a value.
# $2 is the segment before normalize() stripped its wrappers: the value-less
# read is not a read behind `xargs`, which appends its stdin as the value.
hooks_path_override() {
  local s=$1 t
  [[ $s == *hookspath* ]] || return 1
  t=${s%"${s##*[![:space:])]}"}
  [[ $t == 'git config core.hookspath githooks' ]] && return 1
  if [[ $t == 'git config core.hookspath' && ! $2 =~ (^|[^[:alnum:]_-])xargs([^[:alnum:]_-]|$) ]]; then
    return 1
  fi
  [[ $t == 'git config --get core.hookspath' ]] && return 1
  [[ $s =~ ^git([[:space:]]|$) ]] || return 1
  [[ $s =~ [[:space:]]-c[[:space:]]+[\"\']?core\.hookspath ]] && return 0
  [[ $s =~ --config-env[=[:space:]][\"\']?core\.hookspath ]] && return 0
  [[ $s =~ [[:space:]]config([[:space:]].*)?[[:space:]][\"\']?core\.hookspath ]] && return 0
  return 1
}

# awk program for the quote-aware split (must not contain a single quote).
# shellcheck disable=SC2016  # awk variables such as $0 must not expand in the shell
AWK_SPLIT='
function flush() {
  if (buf != "") print buf
  buf = ""
}
{
  line = $0
  if (inq == 0 && !index(line, "\"") && !index(line, sq) && !index(line, "\\") && !index(line, "&") && !index(line, "|") && !index(line, ";")) {
    flush()
    print line
    next
  }
  if (inq != 0) buf = buf " "
  n = length(line)
  for (i = 1; i <= n; i++) {
    c = substr(line, i, 1)
    if (inq == 1) {
      buf = buf c
      if (c == sq) inq = 0
    } else if (inq == 2 || inq == 3) {
      if (c == "\\") { buf = buf c substr(line, i + 1, 1); i++; continue }
      buf = buf c
      if ((inq == 2 && c == "\"") || (inq == 3 && c == sq)) inq = 0
    } else if (c == "\\") {
      buf = buf c substr(line, i + 1, 1); i++
    } else if (c == sq) {
      inq = 1; buf = buf c
    } else if (c == "\"") {
      inq = 2; buf = buf c
    } else if (c == "$" && substr(line, i + 1, 1) == sq) {
      inq = 3; buf = buf c sq; i++
    } else if (c == "&" || c == "|" || c == ";") {
      flush()
    } else {
      buf = buf c
    }
  }
  if (inq == 0) flush()
}
END {
  if (inq != 0) {
    gsub(/[&|;]/, "\n", buf)
    print buf
  }
}
'

# awk program that blanks quoted data before splitting (must not contain a
# single quote). A closed quoted string that is an argument of a command which
# only reads it (jq, echo, printf, grep, egrep, fgrep, for) is emptied: 'a; b'
# becomes ''. Double-quoted text is blanked only when it has no $ or backtick,
# since those expand. Nothing else is touched: executors (bash -c, xargs, eval)
# and command names that are not plain words keep their strings. After a $( or
# a backtick (inside double quotes or not) nothing more is blanked: the quotes
# nested in it cannot be paired by this scanner. It is all or nothing: if a
# quote is still open at the end of a line (a comment or heredoc prose with an
# apostrophe, a string that spans lines), a line is very long, a <( or >(
# appears, a string is piped into anything but a filter (wc, sort, jq, ...) or
# a shell that is given a plain script file, or a blanked for list is followed
# by anything but printing or filtering commands (the loop could run the
# items), the input is printed unchanged. So a quote the scanner misreads
# cannot hide a command that bash would run, and a string that reaches a shell
# stays visible. Lines with no quote, pipe, parenthesis or backtick are copied
# (their segments are still classified for the for-list check).
# shellcheck disable=SC2016  # awk variables such as $0 must not expand in the shell
AWK_MASK='
function first_word(s) {
  while (1) {
    if (match(s, "^[ \t({!]+") || match(s, "^(if|then|else|elif|do|while|until)[ \t]+") || match(s, "^[a-z_][a-z0-9_]*=[a-z0-9_./:@%+,=-]*[ \t]+")) {
      s = substr(s, RLENGTH + 1)
    } else break
  }
  if (match(s, "^[^ \t)}]+[ \t)}]")) return substr(s, 1, RLENGTH - 1)
  return ""
}
function seg_add(t) {
  if (fw_done == 0) {
    seg = seg t
    if (length(seg) > 200) { fw = ""; fw_done = 1 }
  }
}
function close_region(   inert) {
  inq = 0
  inert = 0
  if (rq == dq && (index(rbuf, "$(") > 0 || index(rbuf, "`") > 0)) nomask = 1
  if (nomask == 0) {
    if (fw_done == 0) { fw = first_word(seg); fw_done = 1 }
    if (fw ~ "^(jq|echo|printf|grep|egrep|fgrep|for)$") {
      if (rq == sq) inert = 1
      else if (index(rbuf, "$") == 0 && index(rbuf, "`") == 0) inert = 1
      if (fw == "printf" && seg ~ "[ \t]-v") inert = 0
    }
  }
  if (inert) {
    out = out rq rq
    if (fw == "for") used_for = 1
  } else out = out rbuf
  rbuf = ""
}
# Called when a command segment ends. A segment that follows a single pipe
# gets the string(s) before the pipe on its stdin: only a filter, or a shell
# that is given a plain script file, is known not to run that text; anything
# else switches the blanking off. Every segment is also checked against the
# commands a for loop body may use: when a for list was blanked, the body must
# only print, filter or pipe the items, never run them.
function end_segment(   w, shfile) {
  if (seg ~ "^[ \t]*$") {
    if (fw_done != 0) { nonwl = 1; if (await_t) bad = 1 }
    return
  }
  w = first_word(seg " ")
  if (w == "" && seg ~ "^[ \t({!]*((if|then|else|elif|do|while|until)[ \t]*)*$") return
  shfile = (seg ~ "^[ \t({!]*(sh|bash|zsh|dash|ksh)[ \t]+(~/|[.]/|/)?[a-z0-9_.][a-z0-9_./-]*([ \t]|$)" && seg !~ "^[ \t({!]*(sh|bash|zsh|dash|ksh)[ \t]+/(dev|proc)/")
  if (await_t && w !~ FILTERS && !shfile) bad = 1
  if (w !~ FILTERS && w !~ "^(jq|echo|printf|grep|egrep|fgrep|for|done|fi|true|false|:|test|\\[)$" && !(await_t && shfile)) nonwl = 1
  await_t = 0
}
BEGIN {
  dq = "\""
  FILTERS = "^(wc|sort|uniq|head|tail|tr|cut|grep|egrep|fgrep|rg|jq|cat|less|more|column|base64|shasum|sha1sum|sha256sum|md5sum|md5|xxd|od|hexdump|nl|rev|paste|pbcopy|diff|cmp)$"
}
{
  raw[NR] = $0
  if (bad) next
  line = $0
  if (length(line) > 20000) { bad = 1; next }
  if (await_t == 0 && !index(line, sq) && !index(line, dq) && !index(line, "|") && !index(line, "(") && !index(line, "`")) {
    res[++k] = line
    np = split(line, parts, "[;&]")
    for (p = 1; p <= np; p++) {
      seg = parts[p]; fw_done = 0
      end_segment()
    }
    seg = ""; fw_done = 0
    next
  }
  n = length(line)
  for (i = 1; i <= n; i++) {
    c = substr(line, i, 1)
    if (inq == 1) {
      rbuf = rbuf c
      if (c == sq) close_region()
    } else if (inq == 2) {
      if (c == "\\") { rbuf = rbuf c substr(line, i + 1, 1); i++; continue }
      rbuf = rbuf c
      if (c == dq) close_region()
    } else if (inq == 3) {
      if (c == "\\") { out = out c substr(line, i + 1, 1); i++; continue }
      out = out c
      if (c == sq) inq = 0
    } else if (c == "\\") {
      out = out c substr(line, i + 1, 1)
      seg_add(c substr(line, i + 1, 1))
      i++
    } else if (c == sq || c == dq) {
      inq = (c == sq) ? 1 : 2; rq = c; rbuf = c
    } else if (c == "$" && substr(line, i + 1, 1) == sq) {
      inq = 3; out = out c sq; i++
      fw = ""; fw_done = 1
    } else if ((c == ">" || c == "<") && substr(line, i + 1, 1) == "(") {
      bad = 1; next
    } else if (c == "`" || (c == "$" && substr(line, i + 1, 1) == "(")) {
      out = out c
      nomask = 1
      fw = ""; fw_done = 1
    } else if (c == "|") {
      out = out c
      end_segment()
      seg = ""; fw_done = 0
      if (substr(line, i + 1, 1) == "|") { out = out "|"; i++ }
      else await_t = 1
    } else if (c == "&" && (substr(line, i - 1, 1) == ">" || substr(line, i - 1, 1) == "<" || substr(line, i + 1, 1) == ">")) {
      out = out c
      seg_add(c)
    } else if (c == "&" || c == ";") {
      out = out c
      end_segment()
      seg = ""; fw_done = 0
    } else {
      out = out c
      seg_add(c)
    }
  }
  if (inq != 0) { bad = 1; next }
  end_segment()
  res[++k] = out
  out = ""
  seg = ""; fw_done = 0
}
END {
  if (used_for && nonwl) bad = 1
  if (bad) for (j = 1; j <= NR; j++) print raw[j]
  else for (j = 1; j <= k; j++) print res[j]
}
'

# A command that runs strings as code (`eval`, `source`, `sh -c`, also with
# other options before the -c) turns the blanking off for the whole command.
RE_RUNS_STRING="(^|[^[:alnum:]_.-])(eval|source)([[:space:]]|\$)|(^|[^[:alnum:]_.-])(sh|bash|zsh|dash|ksh)[[:space:]]+([^;&|]*[[:space:]])?-[[:alnum:]]*c([[:space:]]|\$)"

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

  raw_seg=$seg
  normalize "$seg"
  seg=$NORM
  [ -n "$seg" ] || continue

  if hooks_path_override "$seg" "$raw_seg"; then
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
done < <(
  lower=$(printf '%s\n' "$cmd" | tr '[:upper:]' '[:lower:]')
  # A string that is run as code is not data, and lines that were joined by a
  # backslash may have moved a command into a data command's arguments: blank
  # nothing in those cases. An empty result of the awk falls back to the
  # unblanked text.
  if [ "$joined" != 1 ] && ! [[ $lower =~ $RE_RUNS_STRING ]]; then
    masked=$(printf '%s\n' "$lower" | awk -v sq="'" "$AWK_MASK") || masked=''
    [ -z "$masked" ] || lower=$masked
  fi
  {
    # Plain split: separators everywhere, quotes ignored.
    printf '%s\n' "$lower" | tr '&|;' '\n'
    # Quote-aware split: separators only outside quotes; a newline inside
    # quotes becomes a space; an unterminated quote falls back to the plain split.
    printf '%s\n' "$lower" | awk -v sq="'" "$AWK_SPLIT"
  } | awk '!seen[$0]++'
)

[ -n "$matched" ] || exit 0

reason="危険なコマンドのパターン「${matched}」に一致したためブロックしました。別の書き方で回避せず、必要ならユーザーに理由を説明して、ユーザー自身に実行してもらってください（サブエージェントは呼び出し元に報告してください）。ファイルの削除には rm ではなく trash を使ってください。"
if [[ $matched_seg =~ ^git([[:space:]]|[[:space:]].*[[:space:]])commit ]]; then
  reason="${reason}コミットメッセージにブロック対象の文字列を書いただけの場合は、メッセージをファイルに書いて git commit -F <file> を使ってください。"
fi
jq -cn --arg reason "$reason" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
exit 0
