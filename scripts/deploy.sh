#!/usr/bin/env bash
# Update the live clone to origin/main and re-run install.sh from it.
#
#   scripts/deploy.sh [--init] [--dry-run] [--force]
#
#   --init      clone the live repo (MANTRA_LIVE, default ~/.mantra/live) from
#               this repo's origin URL when it does not exist yet
#   --dry-run   run every gate, but do not check out; install.sh --dry-run
#               previews the CURRENT live checkout
#   --force     allow a non-fast-forward update of the live clone
#
# Development happens in any checkout or worktree. Only running this script
# changes what ~/.claude sees, because ~/.claude points at the live clone.
#
# Gates, in order. Each refusal leaves the live clone and ~/.claude untouched:
#   1. against the real home the live clone must be ~/.mantra/live, a full
#      clone (not a linked worktree) whose toplevel is exactly that directory
#   2. the live clone has no uncommitted changes
#   3. origin/main is a fast-forward of the live HEAD (unless --force)
#   4. origin/main, exported to a temp dir, passes bash -n hooks/guard.sh and
#      scripts/verify.sh
# Only then is origin/main checked out detached and install.sh run. If
# install.sh fails, the previous HEAD is checked out again and deploy.sh
# exits non-zero.
set -euo pipefail
unset CDPATH GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY

# shellcheck disable=SC1091  # lib.sh sits next to this script
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/deploy.sh [--init] [--dry-run] [--force]

Fetches origin in the live clone (MANTRA_LIVE, default ~/.mantra/live),
verifies origin/main in a temp export, checks it out detached, then runs the
live scripts/install.sh.
--init     clone the live repo first when it is missing
--dry-run  run the gates but do not check out; preview install.sh
--force    allow a non-fast-forward update
USAGE
}

INIT=0
DRY_RUN=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --init) INIT=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "deploy.sh: unknown argument: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
LIVE_RAW="${MANTRA_LIVE:-$HOME/.mantra/live}"
LIVE_RAW="${LIVE_RAW%/}"
export MANTRA_LIVE="$LIVE_RAW"

mantra_check_real_home_rule deploy.sh "$LIVE_RAW" || exit 2

if [ ! -d "$LIVE_RAW" ]; then
  if ! ORIGIN=$(git -C "$REPO" remote get-url origin 2>/dev/null); then
    echo "deploy.sh: $REPO has no 'origin' remote to clone from" >&2
    exit 1
  fi
  if [ "$INIT" -ne 1 ]; then
    echo "deploy.sh: live clone not found: $LIVE_RAW" >&2
    echo "  create it with: git clone $ORIGIN $LIVE_RAW" >&2
    echo "  or run: scripts/deploy.sh --init" >&2
    exit 1
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] git clone $ORIGIN $LIVE_RAW"
    echo "[dry-run] nothing else can be previewed until the live clone exists"
    exit 0
  fi
  mkdir -p "$(dirname "$LIVE_RAW")"
  echo "git clone $ORIGIN $LIVE_RAW"
  git clone "$ORIGIN" "$LIVE_RAW"
fi

LIVE=$(cd "$LIVE_RAW" && pwd -P)
mantra_check_not_worktree deploy.sh "$LIVE" || exit 2
if ! TOP=$(git -C "$LIVE" rev-parse --show-toplevel 2>/dev/null); then
  echo "deploy.sh: refusing: $LIVE is not a git repository" >&2
  exit 2
fi
TOP=$(cd "$TOP" && pwd -P)
if [ "$TOP" != "$LIVE" ]; then
  echo "deploy.sh: refusing: $LIVE is inside the repository at $TOP, not a clone of its own" >&2
  exit 2
fi

if [ -n "$(git -C "$LIVE" status --porcelain)" ]; then
  echo "deploy.sh: $LIVE has uncommitted changes; the live clone must stay clean" >&2
  git -C "$LIVE" status --short >&2
  exit 1
fi

PREV_HEAD=$(git -C "$LIVE" rev-parse HEAD)
echo "git -C $LIVE fetch origin"
git -C "$LIVE" fetch origin
if ! NEW_HEAD=$(git -C "$LIVE" rev-parse --verify --quiet 'origin/main^{commit}'); then
  echo "deploy.sh: origin/main does not exist in $LIVE" >&2
  exit 1
fi

# Gate 3: only fast-forwards, so a rewritten origin/main is a deliberate act.
if ! git -C "$LIVE" merge-base --is-ancestor "$PREV_HEAD" "$NEW_HEAD"; then
  if [ "$FORCE" -eq 1 ]; then
    echo "warning: origin/main is not a fast-forward of the live HEAD; continuing because of --force" >&2
  else
    echo "deploy.sh: refusing a non-fast-forward update: origin/main does not contain the live HEAD" >&2
    echo "  live HEAD ${PREV_HEAD:0:12}, origin/main ${NEW_HEAD:0:12}; review it, then use --force" >&2
    exit 1
  fi
fi

if [ "$PREV_HEAD" = "$NEW_HEAD" ]; then
  echo "live is already at origin/main (${NEW_HEAD:0:12})"
else
  echo "Changes to deploy (${PREV_HEAD:0:12}..${NEW_HEAD:0:12}):"
  git -C "$LIVE" log --oneline --stat "$PREV_HEAD..$NEW_HEAD" || true
fi

# Gate 4: verify the exact tree that would be checked out, outside the live clone.
EXPORT_DIR=$(mktemp -d)
cleanup_export() {
  if [ -n "${EXPORT_DIR:-}" ] && [ -d "$EXPORT_DIR" ]; then
    rm -rf -- "$EXPORT_DIR" || true
  fi
}
trap cleanup_export EXIT
git -C "$LIVE" archive "$NEW_HEAD" | tar -x -C "$EXPORT_DIR"
echo "verifying origin/main in $EXPORT_DIR"
if ! (cd "$EXPORT_DIR" && bash -n hooks/guard.sh && bash scripts/verify.sh); then
  echo "deploy.sh: origin/main failed verification; the live clone was not changed" >&2
  exit 1
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] would run: git -C $LIVE checkout --detach origin/main"
  echo "[dry-run] install.sh below previews the CURRENT live checkout, not origin/main"
  "$LIVE/scripts/install.sh" --dry-run
  exit 0
fi

echo "git -C $LIVE checkout --detach origin/main"
git -C "$LIVE" checkout --quiet --detach "$NEW_HEAD"
echo "live is now at $(git -C "$LIVE" rev-parse --short HEAD)"

if ! "$LIVE/scripts/install.sh"; then
  echo "deploy.sh: install.sh failed; restoring the live clone to ${PREV_HEAD:0:12}" >&2
  git -C "$LIVE" checkout --quiet --detach "$PREV_HEAD"
  echo "  ~/.claude may be partly updated; fix the cause and run deploy.sh again" >&2
  exit 1
fi
