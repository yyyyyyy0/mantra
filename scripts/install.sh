#!/usr/bin/env bash
# Wire ~/.claude to the live mantra clone (default: ~/.mantra/live).
#
#   scripts/install.sh [--dry-run]
#
# - ~/.claude/rules  -> symlink to <live>/rules
# - ~/.claude/agents -> real directory; each <live>/agents/*.md is symlinked
#   into it per file. A legacy symlinked agents dir is replaced by a real dir
#   that keeps every non-mantra entry (e.g. web-search-agent.md).
# - ~/.claude/skills -> real directory; each <live>/skills/<name>/ is symlinked
#   into it per skill. A real directory of the same name is moved to
#   ~/.claude/skills.bak/ first. A symlink of the same name that points
#   anywhere but the live clone is never touched: before ANYTHING is changed
#   (rules, agents or skills) every mantra skill is checked for such a link,
#   and one is enough to exit 1 with nothing changed (--dry-run too).
#   Skills that are not mantra's are never touched.
# - Warns (never fetches) when the pinned pstack is not installed under
#   ${MANTRA_VENDOR:-~/.mantra/vendor}/pstack/current, or is installed but does
#   not match the pin (symlinked checkout, modified tracked files); run
#   scripts/pstack.sh.
# - settings.json is never modified.
#
# Must be run from the live clone itself (MANTRA_LIVE, default
# ~/.mantra/live), never from a dev checkout or worktree. Against the real
# home the live clone must be exactly ~/.mantra/live. Idempotent: a second run
# changes nothing. --dry-run prints the actions and changes nothing.
set -euo pipefail
unset CDPATH GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY

# shellcheck disable=SC1091  # lib.sh sits next to this script
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# Agents that earlier mantra versions installed. They are dropped when an old
# agents directory is migrated; every other entry is preserved.
LEGACY_AGENTS=(architect autonomous-improvement-loop build-error-resolver code-reviewer doc-updater e2e-runner mob-critic mob-navigator mob-scribe planner refactor-cleaner replan security-reviewer tdd-guide)

usage() {
  cat <<'USAGE'
Usage: scripts/install.sh [--dry-run]

Links ~/.claude/rules, ~/.claude/agents/*.md and ~/.claude/skills/<name> to
the live clone (MANTRA_LIVE, default ~/.mantra/live). Run it from that clone
only.
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

mantra_check_real_home_rule install.sh "$LIVE_RAW" || exit 2
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
mantra_check_not_worktree install.sh "$LIVE" || exit 2
case "$LIVE_RAW" in
  /*) LIVE_LINK="$LIVE_RAW" ;;
  *) LIVE_LINK="$LIVE" ;;
esac

for d in rules agents skills; do
  if [ ! -d "$LIVE/$d" ]; then
    echo "install.sh: $LIVE/$d is missing; the live clone looks broken" >&2
    exit 2
  fi
done

CLAUDE_DIR="$HOME/.claude"
RULES_DST="$CLAUDE_DIR/rules"
AGENTS_DST="$CLAUDE_DIR/agents"
STAGING="$CLAUDE_DIR/agents.migrating"
SKILLS_DST="$CLAUDE_DIR/skills"
SKILLS_BAK="$CLAUDE_DIR/skills.bak"
TS=$(date +%Y%m%d-%H%M%S)
CHANGES=0
CONFLICTS=0
PRESERVED=''
STAGING_ACTIVE=0

# Checked before anything is changed, so a refusal never leaves a partial install.
if [ -e "$AGENTS_DST" ] && [ ! -L "$AGENTS_DST" ] && [ ! -d "$AGENTS_DST" ]; then
  echo "install.sh: $AGENTS_DST exists and is not a directory; nothing was changed" >&2
  exit 2
fi

if [ -e "$SKILLS_DST" ] || [ -L "$SKILLS_DST" ]; then
  if [ -L "$SKILLS_DST" ] || [ ! -d "$SKILLS_DST" ]; then
    echo "install.sh: $SKILLS_DST exists and is not a real directory; nothing was changed" >&2
    exit 2
  fi
fi

# A mantra skill whose name is taken by a symlink that does not lead into the
# live clone cannot be installed, and replacing it is the user's call (it may
# belong to another tool). Find all of them BEFORE anything is changed: a
# conflict found halfway would leave the links made so far dangling when
# deploy.sh rolls the live clone back after the failed install.
preflight_skill_conflicts() {
  local src name dst cur n=0
  for src in "$LIVE"/skills/*/; do
    [ -d "$src" ] || continue
    name=$(basename "$src")
    dst="$SKILLS_DST/$name"
    [ -L "$dst" ] || continue
    cur=$(readlink "$dst")
    case "$cur" in
      "$LIVE_LINK"/skills/* | "$LIVE"/skills/*) ;;
      *)
        echo "conflict: $dst is a symlink to $cur, not to the live clone" >&2
        n=$((n + 1))
        ;;
    esac
  done
  if [ "$n" -gt 0 ]; then
    echo "install.sh: $n skill link(s) conflict with mantra's skills; nothing was changed" >&2
    echo "  Check what each link points to first. If mantra's skill should replace it," >&2
    echo "  remove the link yourself (unlink <path>) and run this again." >&2
    exit 1
  fi
}
preflight_skill_conflicts

# Remove a half-built staging dir if the copy fails. Once the copy is
# complete STAGING_ACTIVE is cleared, so a finished staging dir survives and
# the next run resumes from it.
cleanup_staging() {
  if [ "$STAGING_ACTIVE" -eq 1 ] && [ -d "$STAGING" ]; then
    rm -rf -- "$STAGING" || true
  fi
}
trap cleanup_staging EXIT

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

# All entry names (one per line) in directory $1.
list_all() {
  local d=$1 p
  for p in "$d"/* "$d"/.[!.]* "$d"/..?*; do
    { [ -e "$p" ] || [ -L "$p" ]; } || continue
    basename "$p"
  done
}

# Replace the agents symlink with a real directory holding PRESERVED entries.
migrate_agents_dir() {
  local old=$1 name
  STAGING_ACTIVE=1
  mkdir "$STAGING"
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    cp -RPp "$old/$name" "$STAGING/"
  done <<<"$PRESERVED"
  STAGING_ACTIVE=0
  unlink "$AGENTS_DST"
  mv "$STAGING" "$AGENTS_DST"
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
  if [ -e "$STAGING" ] || [ -L "$STAGING" ]; then
    stale=$(backup_name "$STAGING")
    act "stale: $STAGING from an interrupted run moved to $stale" mv "$STAGING" "$stale"
  fi
  act "migrate: $AGENTS_DST (symlink to $old_target) becomes a real directory" \
    migrate_agents_dir "$old_dir"
  [ "$DRY_RUN" -eq 0 ] || VIRTUAL=1
elif [ -d "$AGENTS_DST" ]; then
  if [ -e "$STAGING" ]; then
    echo "note: $STAGING is left over from an interrupted run; $AGENTS_DST is in use, so it was not touched"
  fi
elif [ -d "$STAGING" ]; then
  # An earlier run finished copying, removed the old symlink, and stopped
  # before moving the staging dir into place. Finish that move; do not mkdir.
  PRESERVED=$(list_all "$STAGING")
  act "resume: $STAGING -> $AGENTS_DST (interrupted migration)" mv "$STAGING" "$AGENTS_DST"
  [ "$DRY_RUN" -eq 0 ] || VIRTUAL=1
else
  act "mkdir: $AGENTS_DST" mkdir "$AGENTS_DST"
  [ "$DRY_RUN" -eq 0 ] || VIRTUAL=1
fi

for src in "$LIVE"/agents/*.md; do
  [ -e "$src" ] || continue
  name=$(basename "$src")
  state=''
  if [ "$VIRTUAL" -eq 1 ]; then
    if grep -Fxq -- "$name" <<<"$PRESERVED"; then state='file'; else state='absent'; fi
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

# --- skills ------------------------------------------------------------------
# One symlink per mantra skill; every other entry in ~/.claude/skills is left
# alone. Real copies are moved OUTSIDE ~/.claude/skills (a backup inside it
# would be loaded as a second copy of the skill).
if [ ! -d "$SKILLS_DST" ]; then
  act "mkdir: $SKILLS_DST" mkdir "$SKILLS_DST"
fi

for src in "$LIVE"/skills/*/; do
  [ -d "$src" ] || continue
  name=$(basename "$src")
  dst="$SKILLS_DST/$name"
  want="$LIVE_LINK/skills/$name"
  if [ -L "$dst" ]; then
    cur=$(readlink "$dst")
    if [ "$cur" = "$want" ]; then
      echo "ok: $dst -> $want"
    else
      case "$cur" in
        "$LIVE_LINK"/skills/* | "$LIVE"/skills/*)
          act "relink: $dst (was $cur) -> $want" ln -sfn "$want" "$dst"
          ;;
        *)
          # preflight_skill_conflicts catches this before any change; this is
          # only reached if the link appeared since.
          echo "conflict: $dst is a symlink to $cur, not to the live clone; left alone" >&2
          CONFLICTS=$((CONFLICTS + 1))
          ;;
      esac
    fi
  elif [ -e "$dst" ]; then
    [ -d "$SKILLS_BAK" ] || act "mkdir: $SKILLS_BAK" mkdir -p "$SKILLS_BAK"
    bak=$(backup_name "$SKILLS_BAK/$name")
    act "backup: $dst -> $bak" mv "$dst" "$bak"
    act "link: $dst -> $want" ln -s "$want" "$dst"
  else
    act "link: $dst -> $want" ln -s "$want" "$dst"
  fi
done

# Retired skills: links into the live clone whose target no longer exists.
if [ -d "$SKILLS_DST" ]; then
  while IFS= read -r link; do
    [ -n "$link" ] || continue
    target=$(readlink "$link")
    case "$target" in
      "$LIVE_LINK"/skills/* | "$LIVE"/skills/*)
        if [ ! -e "$link" ]; then
          act "remove retired skill link: $link -> $target" unlink "$link"
        fi
        ;;
    esac
  done < <(find "$SKILLS_DST" -maxdepth 1 -type l)
fi

# --- pstack (warn only; scripts/pstack.sh fetches it, by hand) ----------------
# True when checkout dir $1 is a real directory with a real .git, at commit $2,
# with no modified tracked files (untracked files are ignored). Read-only: no
# hooks, no fsmonitor, no index refresh written.
GIT_LOOK=(-c core.hooksPath=/dev/null -c core.fsmonitor=false)
pstack_untampered() {
  local d=$1 want=$2 head dirty
  [ ! -L "$d" ] && [ -d "$d" ] || return 1
  { [ -d "$d/.git" ] && [ ! -L "$d/.git" ]; } || return 1
  head=$(GIT_OPTIONAL_LOCKS=0 git "${GIT_LOOK[@]}" -C "$d" rev-parse HEAD 2>/dev/null) || return 1
  [ "$head" = "$want" ] || return 1
  dirty=$(GIT_OPTIONAL_LOCKS=0 git "${GIT_LOOK[@]}" -C "$d" status --porcelain --untracked-files=no 2>/dev/null) || return 1
  [ -z "$dirty" ]
}

# echo, not act: a warning is not a change, so "no changes needed" still holds.
check_pstack() {
  local pin="$LIVE/pstack/PIN" commit='' path='' line vendor cur target rest sha
  vendor="${MANTRA_VENDOR:-$HOME/.mantra/vendor}"
  if [ -f "$pin" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in
        commit=*) commit=${line#commit=} ;;
        path=*) path=${line#path=} ;;
      esac
    done <"$pin"
  fi
  if [ -z "$commit" ] || [ -z "$path" ]; then
    echo "warning: $pin is missing or has no commit=/path= line; pstack was not checked"
    return 0
  fi
  cur="$vendor/pstack/current"
  if [ ! -L "$cur" ]; then
    echo "warning: pstack is not installed ($cur is missing); run $LIVE/scripts/pstack.sh"
    return 0
  fi
  target=$(readlink "$cur")
  rest=${target%"/$path"}
  sha=${rest##*/}
  if [ "$rest" = "$target" ] || [ "$sha" != "$commit" ]; then
    echo "warning: pstack current -> $target is not the pinned ${commit:0:12}; run $LIVE/scripts/pstack.sh"
  elif [ ! -d "$cur" ]; then
    echo "warning: pstack current -> $target does not exist; run $LIVE/scripts/pstack.sh"
  elif ! pstack_untampered "$rest" "$commit"; then
    echo "warning: pstack checkout $rest does not match the pin (a symlink, not a git checkout at ${commit:0:12}, or tracked files modified); run $LIVE/scripts/pstack.sh"
  else
    echo "ok: pstack ${commit:0:12} at $cur"
  fi
}
check_pstack

echo "note: settings.json is never modified; register hooks/guard.sh there by hand."
if [ "$CHANGES" -eq 0 ]; then
  echo "Summary: no changes needed."
elif [ "$DRY_RUN" -eq 1 ]; then
  echo "Summary: $CHANGES change(s) would be made (dry-run, nothing changed)."
else
  echo "Summary: $CHANGES change(s) made."
fi
if [ "$CONFLICTS" -gt 0 ]; then
  echo "install.sh: $CONFLICTS skill link(s) conflict with symlinks from elsewhere; see the messages above" >&2
  exit 1
fi
