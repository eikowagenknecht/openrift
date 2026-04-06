Finalize work in a worktree — run checks, add changelog, and mark as ready to merge.

## Prerequisites

Must be on a worktree branch, not main. If on main, abort and tell the user to use `/commit-main` instead.

## Steps

1. **Commit any uncommitted work** using the `/commit all yolo` flow (stage everything, commit without approval — the merge confirmation in step 5 is the real gate).

2. **Changelog check.** Look at all commits on this branch (`git log main..HEAD`). If any are `feat:` or `fix:`, check whether `apps/web/src/CHANGELOG.md` already has a corresponding entry. If not, add one (following the rules in CLAUDE.md) and commit it.

3. **Run checks** (build, lint, unit tests — **no integration tests or knip**, they run post-merge). Run: `bun run build && bun run lint:oxlint && bun run lint:oxfmt && bun run test`. If it fails, fix the issues, commit the fixes, and re-run until it passes. Do not skip this step.

4. **Rebase onto main.** While still in the worktree, rebase the branch so the squash-merge will be a clean fast-forward:
   - `git rebase main` — this works because worktrees share refs with the main repo, so `main` is always the current local main ref.
   - If the rebase has conflicts, resolve them and continue. If you truly cannot resolve a conflict, abort (`git rebase --abort`) and tell the user.
   - Note: Do NOT use `git fetch . main:main` — it fails because main is checked out in the main worktree.

5. **Exit the worktree.** Use `ExitWorktree` with `action: "keep"` to return to main. Remember the branch name from step 1 — you'll need it for the merge.

6. **Squash-merge into main.** Run the full `/merge` flow from here (gather context, draft message, present plan, wait for confirmation, execute merge, clean up). Do NOT invoke `/merge` as a separate skill — execute its steps inline.
