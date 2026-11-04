#!/usr/bin/env bash
# Fetch the pinned pstack plugin into the mantra vendor directory.
#
#   scripts/pstack.sh [--dry-run]
#
# Reads pstack/PIN (repo, commit, path, version) and puts exactly that commit
# of <repo>, sparse-checked-out to <path>, under
#
#   ${MANTRA_VENDOR:-$HOME/.mantra/vendor}/pstack/<commit>/
#
# then points ${MANTRA_VENDOR}/pstack/current at <commit>/<path>. The checkout
# is never modified. ~/.claude and the live clone are never touched. Old
# <commit> directories are never deleted. A second run changes nothing.
# MANTRA_PSTACK_REPO overrides the repo URL (tests point it at a local bare
# repo); without it the PIN's repo must be https://github.com/cursor/plugins.
# --dry-run prints the actions and changes nothing.
#
# A <commit>/ that no longer matches (wrong HEAD or version, a symlink, or
# tracked files modified) is replaced only after a fresh copy has been fetched
# and checked: the old one is then moved to <commit>.bad-<timestamp>. If the
# fetch fails the old one is left exactly as it was.
set -euo pipefail
unset CDPATH GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY
unset GIT_CONFIG_COUNT GIT_CONFIG_PARAMETERS GIT_SSH_COMMAND GIT_ALLOW_PROTOCOL

# shellcheck disable=SC1091  # lib.sh sits next to this script
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/pstack.sh [--dry-run]

Fetches the commit pinned in pstack/PIN into
${MANTRA_VENDOR:-$HOME/.mantra/vendor}/pstack/<commit>/ and points
.../pstack/current at it. Never touches ~/.claude or the live clone.
USAGE
}

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "pstack.sh: unknown argument: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
PIN_FILE="$REPO_ROOT/pstack/PIN"

# --- read and validate the pin -------------------------------------------------
if [ ! -f "$PIN_FILE" ]; then
  echo "pstack.sh: $PIN_FILE is missing" >&2
  exit 2
fi

# Value of KEY in the PIN file (last assignment wins); empty when absent.
pin_value() {
  local key=$1 line val=''
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    case "$line" in
      "$key="*) val=${line#"$key="} ;;
    esac
  done <"$PIN_FILE"
  printf '%s' "$val"
}

PIN_REPO=$(pin_value repo)
PIN_COMMIT=$(pin_value commit)
PIN_PATH=$(pin_value path)
PIN_VERSION=$(pin_value version)

for k in repo commit path version; do
  if [ -z "$(pin_value "$k")" ]; then
    echo "pstack.sh: $PIN_FILE has no '$k=' line" >&2
    exit 2
  fi
done
if ! [[ $PIN_COMMIT =~ ^[0-9a-f]{40}$ ]]; then
  echo "pstack.sh: refusing: commit in $PIN_FILE is not a 40-digit hex SHA: $PIN_COMMIT" >&2
  exit 2
fi
if ! [[ $PIN_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "pstack.sh: refusing: version in $PIN_FILE is not x.y.z: $PIN_VERSION" >&2
  exit 2
fi
# A plain relative path: segments of [A-Za-z0-9._-], none starting with a dot.
PATH_RE='^[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$'
if ! [[ $PIN_PATH =~ $PATH_RE ]]; then
  echo "pstack.sh: refusing: path in $PIN_FILE must be a plain relative path of [A-Za-z0-9._-] segments, none starting with a dot: $PIN_PATH" >&2
  exit 2
fi

# The source repo. MANTRA_PSTACK_REPO (tests, mirrors) is used as given unless
# it could be read as an option; otherwise the PIN's repo must be cursor/plugins.
GITHUB_RE='^https://github\.com/cursor/plugins(\.git)?$'
if [ -n "${MANTRA_PSTACK_REPO:-}" ]; then
  SRC_REPO=$MANTRA_PSTACK_REPO
  case "$SRC_REPO" in
    -*)
      echo "pstack.sh: refusing: MANTRA_PSTACK_REPO must not start with '-': $SRC_REPO" >&2
      exit 2
      ;;
  esac
else
  SRC_REPO=$PIN_REPO
  if ! [[ $SRC_REPO =~ $GITHUB_RE ]]; then
    echo "pstack.sh: refusing: repo in $PIN_FILE must be https://github.com/cursor/plugins(.git): $SRC_REPO" >&2
    echo "  (set MANTRA_PSTACK_REPO to use another source on purpose)" >&2
    exit 2
  fi
fi

# git options for talking to the source: no hooks, no fsmonitor, https only;
# the file transport only for a source that is a local path or file:// URL.
GIT_NET=(-c core.hooksPath=/dev/null -c core.fsmonitor=false -c protocol.allow=never -c protocol.https.allow=always)
case "$SRC_REPO" in
  /* | ./* | ../* | file://*) GIT_NET+=(-c protocol.file.allow=always) ;;
esac
# git options for looking at a checkout that may have been tampered with.
GIT_LOOK=(-c core.hooksPath=/dev/null -c core.fsmonitor=false)
export GIT_OPTIONAL_LOCKS=0

VENDOR_RAW=${MANTRA_VENDOR:-$HOME/.mantra/vendor}
VENDOR=$(mantra_canon "${VENDOR_RAW%/}")
BASE="$VENDOR/pstack"
DEST="$BASE/$PIN_COMMIT"
LINK="$BASE/current"
LINK_TARGET="$DEST/$PIN_PATH"
LOCK="$BASE/.lock"
TS=$(date +%Y%m%d-%H%M%S)
CHANGES=0
TMP_DIR=''
LOCK_HELD=0

cleanup() {
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf -- "$TMP_DIR" || true
  fi
  if [ "$LOCK_HELD" -eq 1 ]; then
    rmdir "$LOCK" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Run (or, with --dry-run, only announce) one change.
act() {
  local desc=$1
  shift
  CHANGES=$((CHANGES + 1))
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] $desc"
  else
    echo "$desc"
    "$@"
  fi
}

# Version string of the plugin.json under checkout dir $1.
plugin_version() {
  local f="$1/$PIN_PATH/.claude-plugin/plugin.json"
  [ -f "$f" ] || return 1
  sed -n 's/^.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*$/\1/p' "$f" | head -n 1
}

# True when checkout dir $1 is a real directory (not a symlink) holding a git
# checkout at the pinned commit and plugin version whose tracked files are
# unmodified. Untracked files are ignored (pstack's own scripts create some).
checkout_matches() {
  local d=$1 head ver dirty
  [ ! -L "$d" ] || return 1
  [ -d "$d" ] || return 1
  { [ -d "$d/.git" ] && [ ! -L "$d/.git" ]; } || return 1
  head=$(git "${GIT_LOOK[@]}" -C "$d" rev-parse HEAD 2>/dev/null) || return 1
  [ "$head" = "$PIN_COMMIT" ] || return 1
  ver=$(plugin_version "$d") || return 1
  [ "$ver" = "$PIN_VERSION" ] || return 1
  dirty=$(git "${GIT_LOOK[@]}" -C "$d" status --porcelain --untracked-files=no 2>/dev/null) || return 1
  [ -z "$dirty" ]
}

# Files every good checkout must contain (relative to the checkout root).
required_files() {
  printf '%s\n' \
    "$PIN_PATH/.claude-plugin/plugin.json" \
    "$PIN_PATH/skills/poteto-mode/SKILL.md" \
    "$PIN_PATH/docs/harness/claude-code.md"
}

unique_bad_name() { # a path next to $1 that does not exist yet
  local base=$1 cand n=1
  cand="$base.bad-$TS"
  while [ -e "$cand" ] || [ -L "$cand" ]; do
    cand="$base.bad-$TS-$n"
    n=$((n + 1))
  done
  printf '%s' "$cand"
}

# Fetch the pinned commit into a temp dir beside DEST and check it. Only then
# is an existing DEST (which did not match the pin) moved to <commit>.bad-*
# and the temp dir moved into place. Anything that goes wrong before that
# point removes only the temp dir and leaves DEST as it was. The caller tests
# this function's status, which turns errexit off inside it, so every step
# checks itself.
fetch_into_place() {
  local f bad
  mkdir -p "$BASE" || return 1
  TMP_DIR=$(mktemp -d "$BASE/.tmp.XXXXXX") || return 1
  chmod 755 "$TMP_DIR" || return 1
  export GIT_TERMINAL_PROMPT=0
  git -C "$TMP_DIR" init -q || return 1
  git -C "$TMP_DIR" remote add origin "$SRC_REPO" || return 1
  git -C "$TMP_DIR" config core.sparseCheckout true || return 1
  git -C "$TMP_DIR" config core.sparseCheckoutCone false || return 1
  mkdir -p "$TMP_DIR/.git/info" || return 1
  printf '/%s/\n' "$PIN_PATH" >"$TMP_DIR/.git/info/sparse-checkout" || return 1
  git "${GIT_NET[@]}" -C "$TMP_DIR" fetch -q --depth 1 origin "$PIN_COMMIT" || return 1
  git "${GIT_NET[@]}" -C "$TMP_DIR" -c advice.detachedHead=false checkout -q FETCH_HEAD || return 1

  if ! checkout_matches "$TMP_DIR"; then
    echo "pstack.sh: fetched checkout is not commit $PIN_COMMIT with plugin version $PIN_VERSION" >&2
    return 1
  fi
  while IFS= read -r f; do
    if [ ! -f "$TMP_DIR/$f" ]; then
      echo "pstack.sh: fetched checkout is missing $f" >&2
      return 1
    fi
  done < <(required_files)

  if [ -e "$DEST" ] || [ -L "$DEST" ]; then
    bad=$(unique_bad_name "$DEST")
    echo "quarantine: $DEST does not match the pin; moved to $bad"
    mv "$DEST" "$bad" || return 1
    if ! mv "$TMP_DIR" "$DEST"; then
      mv "$bad" "$DEST" || true
      return 1
    fi
  else
    mv "$TMP_DIR" "$DEST" || return 1
  fi
  TMP_DIR=''
}

link_state() { # ok | wrong | file | absent
  if [ -L "$LINK" ]; then
    if [ "$(readlink "$LINK")" = "$LINK_TARGET" ]; then echo ok; else echo wrong; fi
  elif [ -e "$LINK" ]; then
    echo file
  else
    echo absent
  fi
}

# --- fetch -------------------------------------------------------------------
echo "pstack: $PIN_COMMIT (version $PIN_VERSION) from $SRC_REPO"

if [ "$DRY_RUN" -eq 0 ]; then
  mkdir -p "$BASE"
  if ! mkdir "$LOCK" 2>/dev/null; then
    echo "pstack.sh: another run holds $LOCK; if none is running, remove that directory" >&2
    exit 1
  fi
  LOCK_HELD=1
fi

NEED_FETCH=1
DEST_BAD=0
if checkout_matches "$DEST"; then
  echo "ok: $DEST is at the pinned commit"
  NEED_FETCH=0
elif [ -e "$DEST" ] || [ -L "$DEST" ]; then
  DEST_BAD=1
  echo "warning: $DEST does not match the pin (modified, replaced or a different checkout);" >&2
  echo "  it is moved to $DEST.bad-* only after a fresh copy has been fetched and checked" >&2
fi

if [ "$NEED_FETCH" -eq 1 ]; then
  if ! act "fetch: $PIN_PATH at $PIN_COMMIT -> $DEST" fetch_into_place; then
    echo "pstack.sh: fetch failed" >&2
    if [ "$DEST_BAD" -eq 1 ]; then
      echo "  $DEST was left as it was, and it does NOT match the pin: do not trust it" >&2
    fi
    exit 1
  fi
fi

# --- current -----------------------------------------------------------------
case "$(link_state)" in
  ok)
    echo "ok: $LINK -> $LINK_TARGET"
    ;;
  wrong)
    act "relink: $LINK (was $(readlink "$LINK")) -> $LINK_TARGET" ln -sfn "$LINK_TARGET" "$LINK"
    ;;
  file)
    echo "pstack.sh: $LINK exists and is not a symlink; remove or move it yourself" >&2
    exit 1
    ;;
  *)
    act "link: $LINK -> $LINK_TARGET" ln -sfn "$LINK_TARGET" "$LINK"
    ;;
esac

if [ "$CHANGES" -eq 0 ]; then
  echo "Summary: no changes needed."
elif [ "$DRY_RUN" -eq 1 ]; then
  echo "Summary: $CHANGES change(s) would be made (dry-run, nothing changed)."
else
  echo "Summary: $CHANGES change(s) made."
fi
