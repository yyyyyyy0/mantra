# shellcheck shell=bash
# Helpers shared by install.sh and deploy.sh. Sourced, never executed.

# Print the account's home directory as recorded in the user database, which
# $HOME cannot fake. Absolute id path: a PATH shim must not change the answer.
mantra_true_home() {
  local id_bin u h
  for id_bin in /usr/bin/id /bin/id; do
    [ -x "$id_bin" ] && break
    id_bin=''
  done
  [ -n "$id_bin" ] || return 1
  u=$("$id_bin" -un 2>/dev/null) || return 1
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

# True when the (canonical) path $1 is under a temp root.
mantra_is_temp_path() {
  local p=$1 r c
  for r in "${TMPDIR:-}" /tmp /private/tmp /var/folders /private/var/folders; do
    { [ -n "$r" ] && [ -d "$r" ]; } || continue
    c=$(mantra_canon "$r")
    [ "$c" != "/" ] || continue
    case "$p" in
      "$c"/*) return 0 ;;
    esac
  done
  return 1
}

# When $HOME is the account's real home (from the user database), the live
# clone must be <that home>/.mantra/live; any other MANTRA_LIVE is refused.
# MANTRA_TEST_REAL_HOME can only ADD enforcement for a second home (tests and
# rehearsals); it never relaxes the rule for the true home. If the user
# database cannot be read, the rule fails closed unless HOME is under a temp
# root. A temp HOME is otherwise not restricted.
# Usage: mantra_check_real_home_rule <script> <live path>
mantra_check_real_home_rule() {
  local who=$1 live_raw=$2 home_c true_home true_c override_c want_home='' live_c want_c
  home_c=$(mantra_canon "$HOME")
  if true_home=$(mantra_true_home); then
    true_c=$(mantra_canon "$true_home")
    if [ "$home_c" = "$true_c" ]; then
      want_home=$true_c
    fi
  elif ! mantra_is_temp_path "$home_c"; then
    echo "$who: refusing: cannot read the account home directory, and HOME ($home_c) is not under a temp dir" >&2
    return 1
  fi
  if [ -z "$want_home" ] && [ -n "${MANTRA_TEST_REAL_HOME:-}" ]; then
    override_c=$(mantra_canon "$MANTRA_TEST_REAL_HOME")
    if [ "$home_c" = "$override_c" ]; then
      want_home=$override_c
    fi
  fi
  [ -n "$want_home" ] || return 0
  live_c=$(mantra_canon "$live_raw")
  want_c=$(mantra_canon "$want_home/.mantra/live")
  if [ "$live_c" != "$want_c" ]; then
    echo "$who: refusing: HOME is the real home ($want_home), so the live clone must be" >&2
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
