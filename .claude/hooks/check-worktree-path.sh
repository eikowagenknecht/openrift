#!/bin/bash
# PreToolUse hook for Edit|Write|NotebookEdit.
#
# When Claude is working inside a worktree (CWD under .claude/worktrees/<wt>/),
# block tool calls that pass an absolute file_path pointing back at the main
# repo. Those calls bypass the worktree and silently mutate main. The fix is
# to use a relative path or the worktree's absolute path.
#
# Allowed: relative paths, absolute paths inside any worktree, absolute paths
# outside the repo entirely. Denied: absolute paths under the main repo that
# are not under .claude/worktrees/.
#
# If CWD is the main repo itself (not a worktree), this hook is a no-op —
# the user may legitimately be editing main.

set -euo pipefail

REPO_ROOT="/home/eiko/repos/openrift"
WORKTREE_ROOT="${REPO_ROOT}/.claude/worktrees/"

INPUT=$(cat)

extract() {
  printf '%s' "$INPUT" | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E "s/\"$1\"[[:space:]]*:[[:space:]]*\"//;s/\"$//" || true
}

CWD=$(extract cwd)
FILE_PATH=$(extract file_path)
if [ -z "$FILE_PATH" ]; then
  FILE_PATH=$(extract notebook_path)
fi

# Only enforce when CWD is inside a worktree.
case "$CWD" in
  "${WORKTREE_ROOT}"*) ;;
  *) exit 0 ;;
esac

# Only inspect absolute paths — relative paths resolve against CWD (the worktree).
case "$FILE_PATH" in
  /*) ;;
  *) exit 0 ;;
esac

# Allow paths inside any worktree.
case "$FILE_PATH" in
  "${WORKTREE_ROOT}"*) exit 0 ;;
esac

# Allow paths outside the main repo entirely.
case "$FILE_PATH" in
  "${REPO_ROOT}/"*) ;;
  *) exit 0 ;;
esac

# In a worktree, absolute file_path points at main repo, not at any worktree. Block.
RELATIVE="${FILE_PATH#${REPO_ROOT}/}"
WORKTREE_PATH="${CWD%/}/${RELATIVE}"

cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"WORKTREE PATH CHECK FAILED: file_path '${FILE_PATH}' points at the main repo, but CWD is the worktree '${CWD}'. Use a relative path ('${RELATIVE}') or the worktree's absolute path ('${WORKTREE_PATH}') instead."}}
EOF
exit 0
