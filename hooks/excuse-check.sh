#!/usr/bin/env bash
# Stop hook: catch "workaround / excuse" comments and unrequested report files.
#
# Runs when the agent finishes its turn. Reads the hook JSON on stdin
# (.session_id, .cwd, .stop_hook_active; see
# https://code.claude.com/docs/en/hooks, "Stop" section) and looks at the
# working tree of .cwd with read-only git calls. If it finds something it
# prints one {"decision":"block","reason":"..."} JSON object, which keeps the
# agent working and hands it the reason (Japanese, with file:line list). The
# same input shape is used by SubagentStop, so the script can also be
# registered there; this repo registers it for Stop only.
#
# Findings:
#   A. Added lines (git diff HEAD -U0, plus untracked code files) in code files
#      whose COMMENT part contains an excuse word: workaround, hack, hacky,
#      for now, temporary fix, quick fix, TODO, FIXME, XXX, and the Japanese
#      words ittan, ikkan, nen no tame, toriaezu, zantei (see EXCUSE_RE).
#      The comment marker depends on the extension: // /* * for C-like
#      languages, # for py rb sh bash zsh, -- for lua, both for php.
#   B. Untracked or newly added .md files directly in the repository root whose
#      name starts with SUMMARY, REPORT, NOTES, CHANGES, IMPLEMENTATION,
#      ANALYSIS, FINDINGS, PLAN, TODO, PROGRESS, STATUS or REVIEW.
#
# Loop control: a finding list is hashed and the hash is stored per session in
# ${TMPDIR:-/tmp}/mantra-excuse-check/<sanitized session_id>. The same list a
# second time is let through silently; a changed list blocks again. With
# stop_hook_active=true, or without a usable session_id, the hook never blocks.
# State files older than 7 days are removed on start.
#
# FAIL-OPEN: no jq, unparseable input, no cwd, not a git work tree, no HEAD,
# more than 2000 added lines or 200 untracked files, any state-dir problem:
# print nothing and exit 0.
#
# Limits (it is a nudge, not a gate):
#   - The comment test is textual. A "#" or "//" inside a string literal that is
#     followed by an excuse word is a false positive; a comment style not listed
#     above (e.g. "=begin" in Ruby, "<!-- -->", SQL "--") is a miss. A long block
#     comment is only seen on lines that start with "*" or "/*".
#   - Only the added side of the diff is scanned, so an existing excuse comment
#     that the agent merely touched on another line is not reported. Renamed
#     files are treated as modified files. File names that git quotes (tab,
#     quote, backslash) are skipped.
#   - Untracked files over 400 KB, binary files and symlinks are skipped.
#   - Report files are only caught in the repository root, by name.
#   - git is called read-only (-c core.hooksPath=/dev/null, core.fsmonitor=false,
#     GIT_OPTIONAL_LOCKS=0); diff text is only ever passed to awk/jq as data.
#
# Registration is manual (settings.json -> hooks.Stop, command:
# bash ~/.mantra/live/hooks/excuse-check.sh). This script registers nothing.
unset CDPATH GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY

MAX_ADDED=2000
MAX_UNTRACKED=200
MAX_FILE_BYTES=409600
MAX_SHOWN=10
MAX_HITS=50

if ! command -v jq >/dev/null 2>&1; then
  echo "excuse-check.sh: jq not found; the check is disabled (fail-open)" >&2
  exit 0
fi
command -v git >/dev/null 2>&1 || exit 0

input=$(cat)
input=$(printf '%s' "$input" | tr -d '\000-\010\013-\037')
[ -n "$input" ] || exit 0

if [ "$(printf '%s' "$input" | jq -r 'if type == "object" then (.stop_hook_active == true) else "bad" end' 2>/dev/null)" != "false" ]; then
  exit 0
fi
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty | strings' 2>/dev/null) || exit 0
sid_raw=$(printf '%s' "$input" | jq -r '.session_id // empty | strings' 2>/dev/null) || exit 0
sid=$(printf '%s' "$sid_raw" | tr -cd 'A-Za-z0-9_-' | cut -c1-100)
[ -n "$cwd" ] && [ -d "$cwd" ] || exit 0
[ -n "$sid" ] || exit 0

git_() {
  GIT_OPTIONAL_LOCKS=0 git -C "$cwd" -c core.hooksPath=/dev/null -c core.fsmonitor=false -c core.quotePath=false "$@"
}

[ "$(git_ rev-parse --is-inside-work-tree 2>/dev/null)" = "true" ] || exit 0
top=$(git_ rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -n "$top" ] && [ -d "$top" ] || exit 0
cwd=$top
git_ rev-parse --verify -q 'HEAD^{commit}' >/dev/null 2>&1 || exit 0

# --- size limits -------------------------------------------------------------
added=$(git_ diff HEAD --numstat --no-ext-diff --no-textconv 2>/dev/null | awk '$1 ~ /^[0-9]+$/ { n += $1 } END { print n + 0 }')
[ "$added" -le "$MAX_ADDED" ] 2>/dev/null || exit 0

untracked=()
while IFS= read -r -d '' f; do
  untracked+=("$f")
done < <(git_ ls-files -z --others --exclude-standard 2>/dev/null)
[ "${#untracked[@]}" -le "$MAX_UNTRACKED" ] || exit 0

# --- state dir ---------------------------------------------------------------
state_dir="${TMPDIR:-/tmp}/mantra-excuse-check"
if [ -L "$state_dir" ]; then exit 0; fi
mkdir -p "$state_dir" 2>/dev/null || exit 0
chmod 700 "$state_dir" 2>/dev/null || exit 0
[ -d "$state_dir" ] && [ -O "$state_dir" ] || exit 0
find "$state_dir" -maxdepth 1 -type f -mtime +7 -delete 2>/dev/null || true

# --- A. excuse comments ------------------------------------------------------
# mode=diff: stdin is `git diff -U0`; mode=file: stdin is one file, XF is its name.
# Prints "file<TAB>line<TAB>text" for up to MAX_HITS hits.
# shellcheck disable=SC2016  # awk program, $ is awk syntax
AWK_PROG='
function lang(f,   e, n) {
  n = split(f, parts, ".")
  if (n < 2) return ""
  e = tolower(parts[n])
  if (e ~ /^(ts|tsx|js|jsx|mjs|cjs|go|rs|java|kt|swift|c|h|cc|cpp|hpp|cs)$/) return "s"
  if (e ~ /^(py|rb|sh|bash|zsh)$/) return "h"
  if (e == "php") return "p"
  if (e == "lua") return "l"
  return ""
}
function comment(k, line,   c) {
  c = ""
  if (k == "s" || k == "p") {
    if (match(line, /(^|[^:])\/\//)) { c = substr(line, RSTART); }
    else if (match(line, /\/\*/)) { c = substr(line, RSTART); }
    else if (match(line, /^[ \t]*\*([ \t]|$)/)) { c = substr(line, RSTART); }
  }
  if (c == "" && (k == "h" || k == "p")) {
    if (match(line, /(^|[ \t])#/) && substr(line, RSTART + RLENGTH, 1) != "!") c = substr(line, RSTART);
  }
  if (c == "" && k == "l") {
    if (match(line, /(^|[ \t])--/)) c = substr(line, RSTART);
  }
  return c
}
function check(text,   c, low) {
  if (kind == "") return
  c = comment(kind, text)
  if (c == "") return
  low = tolower(c)
  if (low ~ EXCUSE_RE) {
    gsub(/\t/, " ", text)
    sub(/^[ ]+/, "", text)
    printf "%s\t%d\t%s\n", cur, ln, text
    if (++hits >= MAXHITS) exit
  }
}
BEGIN { hits = 0; hdr = 0; kind = ""; cur = ""; ln = 0
  if (mode == "file") { cur = ENVIRON["XF"]; kind = lang(cur) } }
mode == "file" { ln = FNR; check($0); next }
/^diff --git / { hdr = 1; kind = ""; cur = ""; next }
hdr && /^\+\+\+ / {
  f = substr($0, 5); sub(/\t.*$/, "", f)
  if (f == "/dev/null" || substr(f, 1, 1) == "\"") { cur = ""; kind = ""; next }
  sub(/^b\//, "", f); cur = f; kind = lang(f); next
}
/^@@ / { hdr = 0; if (match($0, /\+[0-9]+/)) ln = substr($0, RSTART + 1, RLENGTH - 1) + 0; next }
!hdr && /^\+/ { check(substr($0, 2)); ln++; next }
'
EXCUSE_RE='(^|[^a-z])(workarounds?|hacky|hack|for now|temporary fix|quick fix|todo|fixme|xxx)($|[^a-z])|一旦|いったん|念のため|とりあえず|暫定'

hits=$(git_ diff HEAD -U0 --no-color --no-ext-diff --no-textconv --no-renames 2>/dev/null |
  LC_ALL=C awk -v mode=diff -v MAXHITS="$MAX_HITS" -v EXCUSE_RE="$EXCUSE_RE" "$AWK_PROG")

for f in "${untracked[@]}"; do
  p="$top/$f"
  [ -f "$p" ] && [ ! -L "$p" ] || continue
  case "$f" in *.*) ;; *) continue ;; esac
  size=$(wc -c <"$p" 2>/dev/null | tr -d ' ') || continue
  [ -n "$size" ] && [ "$size" -le "$MAX_FILE_BYTES" ] || continue
  grep -Iq . "$p" 2>/dev/null || continue
  h=$(XF="$f" LC_ALL=C awk -v mode=file -v MAXHITS="$MAX_HITS" -v EXCUSE_RE="$EXCUSE_RE" "$AWK_PROG" <"$p")
  [ -n "$h" ] && hits=${hits:+$hits$'\n'}$h
done

findings=""
if [ -n "$hits" ]; then
  findings=$(printf '%s\n' "$hits" | jq -Rr 'split("\t") as $p | $p[0] + ":" + $p[1] + ": " + (($p[2] // "")[0:120])' 2>/dev/null) || exit 0
fi

# --- B. report markdown in the repo root -------------------------------------
REPORT_RE='^(summary|report|notes|changes|implementation|analysis|findings|plan|todo|progress|status|review)'
md_candidates=()
for f in "${untracked[@]}"; do md_candidates+=("$f"); done
while IFS= read -r -d '' f; do
  md_candidates+=("$f")
done < <(git_ diff HEAD --name-only -z --diff-filter=A --no-renames 2>/dev/null)
md_seen=" "
for f in ${md_candidates[@]+"${md_candidates[@]}"}; do
  case "$f" in */*) continue ;; esac
  lower=$(printf '%s' "$f" | tr 'A-Z' 'a-z')
  case "$lower" in *.md) ;; *) continue ;; esac
  base=${lower%.md}
  case "$base" in changelog | readme | handover | claude | agents) continue ;; esac
  printf '%s' "$base" | grep -Eq "$REPORT_RE" || continue
  case "$md_seen" in *" $f "*) continue ;; esac
  md_seen="$md_seen$f "
  line="$f: 報告用らしき Markdown（リポジトリ直下の新規ファイル）"
  findings=${findings:+$findings$'\n'}$line
done

[ -n "$findings" ] || exit 0

# --- loop control --------------------------------------------------------------
total=$(printf '%s\n' "$findings" | wc -l | tr -d ' ')
shown=$(printf '%s\n' "$findings" | head -n "$MAX_SHOWN")
hash=$(printf '%s\n%s\n' "$total" "$shown" | cksum | awk '{ print $1 "-" $2 }')
state_file="$state_dir/$sid"
if [ -f "$state_file" ] && [ ! -L "$state_file" ] && [ "$(cat "$state_file" 2>/dev/null)" = "$hash" ]; then
  exit 0
fi
[ ! -L "$state_file" ] || exit 0
printf '%s\n' "$hash" >"$state_file" 2>/dev/null || exit 0

more=""
[ "$total" -gt "$MAX_SHOWN" ] && more=$'\n'"（ほか $((total - MAX_SHOWN)) 件。最大 ${MAX_SHOWN} 件を表示）"

jq -cn --arg list "$shown" --arg more "$more" '{
  decision: "block",
  reason: ("excuse-check: 回避・言い訳のコメント、または報告用の Markdown が見つかりました。\n\n" + $list + $more
    + "\n\n回避や言い訳のコメントは消し、根本原因を直すか、型・lint・テストの歯止めに変えてください。頼まれていない報告用の Markdown は消してください（trash を使う）。ユーザーが頼んだもの、または直せない外部要因の説明なら、その理由を一行書いてそのまま終えてかまいません。")
}' 2>/dev/null || exit 0
exit 0
