#!/usr/bin/env bash
# Wire ~/.claude to the live mantra clone (default: ~/.mantra/live).
#
#   scripts/install.sh [--dry-run]
#
# - ~/.claude/rules  -> symlink to <live>/rules
# - ~/.claude/agents -> real directory; each <live>/agents/*.md is symlinked
#   into it per file. A legacy symlinked agents dir is replaced by a real dir
#   that keeps every non-mantra entry (e.g. web-search-agent.md).
# - settings.json is never modified.
#
# Must be run from the live clone itself (MANTRA_LIVE, default
# ~/.mantra/live), never from a dev checkout or worktree. Idempotent: a
# second run changes nothing. --dry-run prints the actions and changes nothing.
set -euo pipefail

# Agents that earlier mantra versions installed. They are dropped when an old
# agents directory is migrated; every other entry is preserved.
LEGACY_AGENTS=(architect autonomous-improvement-loop build-error-resolver code-reviewer doc-updater e2e-runner mob-critic mob-navigator mob-scribe planner refactor-cleaner replan security-reviewer tdd-guide)

usage() {
  cat <<'USAGE'
Usage: scripts/install.sh [--dry-run]

Links ~/.claude/rules and ~/.claude/agents/*.md to the live clone
(MANTRA_LIVE, default ~/.mantra/live). Run it from that clone only.
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
      echo "install.sh: unknown argument: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
LIVE_RAW="${MANTRA_LIVE:-$HOME/.mantra/live}"
LIVE_RAW="${LIVE_RAW%/}"

if ! LIVE=$(cd "$LIVE_RAW" 2>/dev/null && pwd -P); then
  echo "install.sh: live clone not found: $LIVE_RAW" >&2
  echo "  create it with: scripts/deploy.sh --init" >&2
  exit 2
fi
if [ "$REPO" != "$LIVE" ]; then
  echo "install.sh: refusing to install from $REPO" >&2
  echo "  The live config must come from the live clone: $LIVE" >&2
  echo "  Run: $LIVE/scripts/install.sh   (or scripts/deploy.sh)" >&2
  exit 2
fi
case "$LIVE_RAW" in
  /*) LIVE_LINK="$LIVE_RAW" ;;
  *) LIVE_LINK="$LIVE" ;;
esac

for d in rules agents; do
  if [ ! -d "$LIVE/$d" ]; then
    echo "install.sh: $LIVE/$d is missing; the live clone looks broken" >&2
    exit 2
  fi
done

CLAUDE_DIR="$HOME/.claude"
RULES_DST="$CLAUDE_DIR/rules"
AGENTS_DST="$CLAUDE_DIR/agents"
TS=$(date +%Y%m%d-%H%M%S)
CHANGES=0
PRESERVED=''

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

is_legacy_entry() {
  local n=$1 l
  case "$n" in
    *.md) n=${n%.md} ;;
    *) return 1 ;;
  esac
  for l in "${LEGACY_AGENTS[@]}"; do
    [ "$n" = "$l" ] && return 0
  done
  return 1
}

backup_name() {
  local base=$1 cand n=1
  cand="$base.bak-$TS"
  while [ -e "$cand" ] || [ -L "$cand" ]; do
    cand="$base.bak-$TS-$n"
    n=$((n + 1))
  done
  printf '%s' "$cand"
}

link_state() {
  local dst=$1 src=$2
  if [ -L "$dst" ]; then
    if [ "$(readlink "$dst")" = "$src" ]; then echo ok; else echo wrong; fi
  elif [ -e "$dst" ]; then
    echo file
  else
    echo absent
  fi
}

# Make $1 a symlink to $2, moving a real file or directory aside first.
# $3 overrides the observed state (used by --dry-run for a directory that
# does not exist yet): ok | wrong | file | absent.
ensure_link() {
  local dst=$1 src=$2 state=${3:-} bak
  [ -n "$state" ] || state=$(link_state "$dst" "$src")
  case "$state" in
    ok)
      echo "ok: $dst -> $src"
      ;;
    wrong)
      act "relink: $dst (was $(readlink "$dst")) -> $src" ln -sfn "$src" "$dst"
      ;;
    file)
      bak=$(backup_name "$dst")
      act "backup: $dst -> $bak" mv "$dst" "$bak"
      act "link: $dst -> $src" ln -s "$src" "$dst"
      ;;
    *)
      act "link: $dst -> $src" ln -s "$src" "$dst"
      ;;
  esac
}

# Names (one per line) in directory $1 that survive an agents migration.
list_preserved() {
  local old=$1 p
  for p in "$old"/* "$old"/.[!.]* "$old"/..?*; do
    { [ -e "$p" ] || [ -L "$p" ]; } || continue
    is_legacy_entry "$(basename "$p")" && continue
    basename "$p"
  done
}

# Replace the agents symlink with a real directory holding PRESERVED entries.
migrate_agents_dir() {
  local old=$1 tmp="$CLAUDE_DIR/agents.migrating-$$" name
  mkdir "$tmp"
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    cp -RPp "$old/$name" "$tmp/"
  done <<<"$PRESERVED"
  unlink "$AGENTS_DST"
  mv "$tmp" "$AGENTS_DST"
}

[ -d "$CLAUDE_DIR" ] || act "mkdir: $CLAUDE_DIR" mkdir -p "$CLAUDE_DIR"

# --- rules -------------------------------------------------------------------
ensure_link "$RULES_DST" "$LIVE_LINK/rules"

# --- agents ------------------------------------------------------------------
# VIRTUAL=1 means the agents directory does not exist yet in a dry-run, so its
# future content is derived from PRESERVED instead of the filesystem.
VIRTUAL=0
if [ -L "$AGENTS_DST" ]; then
  old_target=$(readlink "$AGENTS_DST")
  case "$old_target" in
    /*) ;;
    *) old_target="$CLAUDE_DIR/$old_target" ;;
  esac
  old_dir=''
  if [ -d "$old_target" ]; then
    old_dir=$(cd "$old_target" && pwd -P)
    # A symlink that already points into the live clone has nothing to keep.
    [ "$old_dir" != "$LIVE/agents" ] || old_dir=''
  fi
  if [ -n "$old_dir" ]; then
    PRESERVED=$(list_preserved "$old_dir")
    if [ -n "$PRESERVED" ]; then
      echo "preserve: $(printf '%s' "$PRESERVED" | tr '\n' ' ') (from $old_dir)"
    fi
  fi
  act "migrate: $AGENTS_DST (symlink to $old_target) becomes a real directory" \
    migrate_agents_dir "$old_dir"
  [ "$DRY_RUN" -eq 0 ] || VIRTUAL=1
elif [ -d "$AGENTS_DST" ]; then
  :
elif [ -e "$AGENTS_DST" ]; then
  echo "install.sh: $AGENTS_DST exists and is not a directory" >&2
  exit 2
else
  act "mkdir: $AGENTS_DST" mkdir "$AGENTS_DST"
  [ "$DRY_RUN" -eq 0 ] || VIRTUAL=1
fi

for src in "$LIVE"/agents/*.md; do
  [ -e "$src" ] || continue
  name=$(basename "$src")
  state=''
  if [ "$VIRTUAL" -eq 1 ]; then
    if printf '%s\n' "$PRESERVED" | grep -Fxq -- "$name"; then state=file; else state=absent; fi
  fi
  ensure_link "$AGENTS_DST/$name" "$LIVE_LINK/agents/$name" "$state"
done

if [ "$VIRTUAL" -eq 0 ]; then
  # Retired agents: links into the live clone whose target no longer exists.
  while IFS= read -r link; do
    [ -n "$link" ] || continue
    target=$(readlink "$link")
    case "$target" in
      "$LIVE_LINK"/agents/* | "$LIVE"/agents/*)
        if [ ! -e "$link" ]; then
          act "remove retired agent link: $link -> $target" unlink "$link"
        fi
        ;;
    esac
  done < <(find "$AGENTS_DST" -maxdepth 1 -type l)

  # Real files named after retired mantra agents are not ours to delete.
  for l in "${LEGACY_AGENTS[@]}"; do
    if [ -f "$AGENTS_DST/$l.md" ] && [ ! -L "$AGENTS_DST/$l.md" ]; then
      echo "note: $AGENTS_DST/$l.md is a real file; left in place"
    fi
  done
fi

echo "note: settings.json is never modified; register hooks/guard.sh there by hand."
if [ "$CHANGES" -eq 0 ]; then
  echo "Summary: no changes needed."
elif [ "$DRY_RUN" -eq 1 ]; then
  echo "Summary: $CHANGES change(s) would be made (dry-run, nothing changed)."
else
  echo "Summary: $CHANGES change(s) made."
fi
