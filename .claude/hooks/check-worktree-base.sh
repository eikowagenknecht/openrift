#!/bin/bash
# PreToolUse hook for EnterWorktree: ensure HEAD is on local main before
# creating a worktree so we never accidentally branch from origin/main or
# a stale detached HEAD.

set -euo pipefail

# Read stdin (required) and extract cwd with grep/sed (no jq dependency)
INPUT=$(cat)
REPO_DIR=$(echo "$INPUT" | grep -o '"cwd":"[^"]*"' | sed 's/"cwd":"//;s/"$//')
if [ -z "$REPO_DIR" ]; then
  exit 0
fi

cd "$REPO_DIR"

# What branch is HEAD on?
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "DETACHED")

if [ "$CURRENT_BRANCH" != "main" ]; then
  cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"WORKTREE BASE CHECK FAILED: HEAD is on '${CURRENT_BRANCH}', not 'main'. Switch to local main before creating a worktree."}}
EOF
  exit 0
fi

# HEAD is on main. Show divergence info so Claude always sees the state.
LOCAL=$(git rev-parse main 2>/dev/null)
REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "unknown")
AHEAD=$(git rev-list --count origin/main..main 2>/dev/null || echo "?")

if [ "$AHEAD" != "0" ] && [ "$AHEAD" != "?" ]; then
  cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"WORKTREE BASE INFO: Local main (${LOCAL:0:8}) is ${AHEAD} commits ahead of origin/main (${REMOTE:0:8}). Branching from local main, which is correct."}}
EOF
else
  cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"WORKTREE BASE INFO: Local main and origin/main are in sync at ${LOCAL:0:8}."}}
EOF
fi

exit 0
