#!/usr/bin/env bash
# Update the live clone to origin/main and re-run install.sh from it.
#
#   scripts/deploy.sh [--init] [--dry-run]
#
#   --init      clone the live repo (MANTRA_LIVE, default ~/.mantra/live) from
#               this repo's origin URL when it does not exist yet
#   --dry-run   fetch only; do not check out, and run install.sh --dry-run
#
# Development happens in any checkout or worktree. Only running this script
# changes what ~/.claude sees, because ~/.claude points at the live clone.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/deploy.sh [--init] [--dry-run]

Fetches origin in the live clone (MANTRA_LIVE, default ~/.mantra/live),
checks out origin/main detached, then runs the live scripts/install.sh.
--init clones the live repo first when it is missing.
--dry-run only fetches and runs install.sh --dry-run; it does not check out.
USAGE
}

INIT=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --init) INIT=1 ;;
    --dry-run) DRY_RUN=1 ;;
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
LIVE="${MANTRA_LIVE:-$HOME/.mantra/live}"
LIVE="${LIVE%/}"
export MANTRA_LIVE="$LIVE"

if [ ! -d "$LIVE" ]; then
  if ! ORIGIN=$(git -C "$REPO" remote get-url origin 2>/dev/null); then
    echo "deploy.sh: $REPO has no 'origin' remote to clone from" >&2
    exit 1
  fi
  if [ "$INIT" -ne 1 ]; then
    echo "deploy.sh: live clone not found: $LIVE" >&2
    echo "  create it with: git clone $ORIGIN $LIVE" >&2
    echo "  or run: scripts/deploy.sh --init" >&2
    exit 1
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] git clone $ORIGIN $LIVE"
    echo "[dry-run] nothing else can be previewed until the live clone exists"
    exit 0
  fi
  mkdir -p "$(dirname "$LIVE")"
  echo "git clone $ORIGIN $LIVE"
  git clone "$ORIGIN" "$LIVE"
fi

if [ -n "$(git -C "$LIVE" status --porcelain)" ]; then
  echo "deploy.sh: $LIVE has uncommitted changes; the live clone must stay clean" >&2
  git -C "$LIVE" status --short >&2
  exit 1
fi

echo "git -C $LIVE fetch origin"
git -C "$LIVE" fetch origin

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] would run: git -C $LIVE checkout --detach origin/main"
  echo "[dry-run] $(git -C "$LIVE" rev-parse --short HEAD) -> $(git -C "$LIVE" rev-parse --short origin/main)"
  echo "[dry-run] install.sh below previews the CURRENT live checkout, not origin/main"
else
  echo "git -C $LIVE checkout --detach origin/main"
  git -C "$LIVE" checkout --quiet --detach origin/main
  echo "live is now at $(git -C "$LIVE" rev-parse --short HEAD)"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  exec "$LIVE/scripts/install.sh" --dry-run
fi
exec "$LIVE/scripts/install.sh"
