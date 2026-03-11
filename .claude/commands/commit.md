Create git commits for the current changes.

## Scope

Based on `$ARGUMENTS`:

- **Empty (default):** Only commit changes that are part of the current task. Inspect `git status` and `git diff` to determine which files are relevant. Exclude files that look unrelated to the work done in this conversation. Present which files you'll include and which you'll skip (and why) — ask for confirmation before proceeding.
- **`all`:** Commit everything — all staged, unstaged, and untracked files.

## Steps

1. Run `git status` and `git diff` (both staged and unstaged) to understand all current changes.
2. Run `git log --oneline -10` to match the repository's commit message style.
3. **Determine scope:** Based on the argument (see above), decide which files to include. For default mode, inspect the diff content to figure out what's related — don't assume only your own edits exist. Changes from other agents working on the same task should be included; unrelated dirty files should not.
4. **Group into logical commits:** If changes span logically distinct units (e.g. a refactor + a new feature, API changes + tests, a bug fix + a separate cleanup), split them into **multiple commits** in logical dependency order. Each commit should be a self-contained, meaningful unit. A single file may contain changes belonging to different commits — use `git add -p` or write temporary patch files to stage only the relevant hunks when needed.
5. **Draft a commit plan:** Present the plan before executing:
   - How many commits, in what order
   - Which files (or partial hunks within files) go in each commit
   - Any files being excluded (default mode) and why
6. **Changelog check:** If any planned commit is `feat:` or `fix:`, check whether `apps/web/src/CHANGELOG.md` already has a corresponding entry. If not, add one (following the rules in CLAUDE.md and MEMORY.md) and include the changelog file in the relevant commit.
7. **Wait for approval of the plan.** Do not proceed until I confirm which files go in which commits. Commit messages do NOT need approval — write good Conventional Commit messages and just use them.
8. **Run `bun lint`** on the files being committed. If it fails, fix the issues and re-check. Never skip linting.
9. **Execute the commits** in order. For each commit:
   - `git add` only the specific files (or specific hunks via `git add -p` / patch files) for that commit
   - Write a concise Conventional Commit message (`feat:`, `fix:`, `refactor:`, etc.)
   - Never use `--no-verify`
10. Run `git status` after all commits to confirm a clean state (or show what's left uncommitted in default mode).
