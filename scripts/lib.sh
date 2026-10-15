# shellcheck shell=bash
# Helpers shared by install.sh and deploy.sh. Sourced, never executed.

# Print the account's home directory as recorded in the user database, which
# $HOME cannot fake. MANTRA_TEST_REAL_HOME replaces the lookup; it exists only
# so tests can simulate "running against the real home" with a temp HOME.
mantra_real_home() {
  local u h
  if [ -n "${MANTRA_TEST_REAL_HOME:-}" ]; then
    printf '%s' "$MANTRA_TEST_REAL_HOME"
    return 0
  fi
  u=$(id -un 2>/dev/null) || return 1
  case "$u" in
    '' | *[!A-Za-z0-9._-]*) return 1 ;;
  esac
  h=$(eval "printf '%s' ~$u" 2>/dev/null) || return 1
  case "$h" in
    /*) printf '%s' "$h" ;;
    *) return 1 ;;
  esac
}

# Print an absolute, symlink-free form of $1. The last component may not exist.
mantra_canon() {
  local p=$1 d b
  case "$p" in
    /*) ;;
    *) p="$PWD/$p" ;;
  esac
  p=${p%/}
  if [ -d "$p" ]; then
    (cd "$p" && pwd -P)
    return
  fi
  d=$(dirname "$p")
  b=$(basename "$p")
  if [ -d "$d" ]; then
    printf '%s/%s\n' "$(cd "$d" && pwd -P)" "$b"
  else
    printf '%s\n' "$p"
  fi
}

# When $HOME is the account's real home, the live clone must be
# <real home>/.mantra/live; any other MANTRA_LIVE is refused. A temp HOME
# (tests, rehearsals) is not restricted. Usage: mantra_check_real_home_rule <script> <live path>
mantra_check_real_home_rule() {
  local who=$1 live_raw=$2 real_home home_c real_c live_c want_c
  if ! real_home=$(mantra_real_home); then
    echo "$who: warning: cannot read the account home directory; real-HOME rule not enforced" >&2
    return 0
  fi
  home_c=$(mantra_canon "$HOME")
  real_c=$(mantra_canon "$real_home")
  [ "$home_c" = "$real_c" ] || return 0
  live_c=$(mantra_canon "$live_raw")
  want_c=$(mantra_canon "$real_c/.mantra/live")
  if [ "$live_c" != "$want_c" ]; then
    echo "$who: refusing: HOME is the real home ($real_c), so the live clone must be" >&2
    echo "  $want_c  (MANTRA_LIVE points at $live_c)" >&2
    return 1
  fi
}

# A linked worktree has a .git *file*; the live config must come from a full clone.
mantra_check_not_worktree() {
  local who=$1 live=$2
  if [ -f "$live/.git" ]; then
    echo "$who: refusing: $live is a linked git worktree (.git is a file); use a dedicated clone" >&2
    return 1
  fi
}
