Squash-merge worktree branches into main.

## Prerequisites

Must be on the `main` branch. If on a worktree branch, abort and tell the user to use `/done` instead (which includes the merge step).

## Steps

1. **List available branches.** Run `git worktree list` and `git branch` to find worktree branches (branches starting with `worktree-`). Exclude the current branch (main).

2. **Select a branch:**
   - If `$ARGUMENTS` specifies a branch name, use that.
   - If there is exactly one worktree branch, use it automatically.
   - If there are multiple, present the list and ask the user to pick one.
   - If there are none, tell the user and abort.

3. **Gather context.** Run these in parallel:
   - `git log main..<branch> --oneline` to list all commits being merged.
   - `git diff main...<branch> --stat` to get the overall diff summary.
   - `git diff main...<branch>` to read the full diff.

4. **Draft a squash commit message.** Analyze the diff and commit history to write a single Conventional Commit message. If the work spans multiple types, use the most significant one (`feat:` > `fix:` > `refactor:` > `chore:`). The message should summarize the overall change, not list individual commits.

5. **Present the plan and wait for approval.** Use this format:

   ```
   Squash-merge `<branch>` → `main`

   <N> commits, <files changed> files (+X / -Y)

   Message: <draft commit message>

   **READY TO MERGE — CONFIRM?**
   ```

   Do not proceed until the user confirms.

6. **Execute the merge:**
   - `git merge --squash <branch>`
   - `git commit` with the approved message. Never use `--no-verify`.
   - `git status` to confirm the result.

7. **Clean up the worktree.** After the merge succeeds:
   - `git worktree remove <worktree-path>` to remove the worktree directory. The path comes from step 1's `git worktree list` output.
   - `git branch -D <branch>` to delete the merged branch.
   - If either command fails, warn the user but do not abort — the merge itself already succeeded.

8. **Report the result.** Show the final commit hash and a one-line summary. Confirm the worktree and branch were cleaned up (or note if cleanup failed).
