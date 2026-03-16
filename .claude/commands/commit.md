---
model: sonnet
---

Create git commits for the current changes.

## Scope

Based on `$ARGUMENTS`:

- **Empty (default):** Only commit changes that are part of the current task. Inspect `git status` and `git diff` to determine which files are relevant. Exclude files that look unrelated to the work done in this conversation.
- **`all`:** Commit everything — all staged, unstaged, and untracked files.
- **`yolo`:** Same as default scope, but skip the approval step — present the table and immediately execute the commits without waiting for confirmation.

## Steps

1. Run `git status` and `git diff` (staged + unstaged) **in parallel** to understand all current changes.
2. **Determine scope and commit plan.** Based on the argument (see above), decide which files to include. For default mode, inspect diffs to figure out what's related — don't assume only your own edits exist. Include changes from other agents on the same task; exclude unrelated dirty files and work from other agents on different tasks. If changes span logically distinct units, split into multiple commits in dependency order. Each commit should be self-contained.
3. **Changelog check:** If any planned commit is `feat:` or `fix:`, check whether `apps/web/src/CHANGELOG.md` already has a corresponding entry. If not, add one (following the rules in CLAUDE.md and MEMORY.md) and include it in the relevant commit.
4. **Lint only touched files** — run `bunx oxlint <files>` and `bunx oxfmt <files>` on just the files being committed (never `bun lint` — it rebuilds everything). Fix any failures.
5. **Present the plan and wait for approval.** Use this EXACT format (no deviations):

   ```
   | # | Message | Files | +/- |
   |---|---------|-------|-----|
   | 1 | feat: add dark mode toggle | 3 | +45 / -12 |
   | 2 | test: dark mode toggle tests | 1 | +80 / -0 |

   Excluded: `src/unrelated.ts` (not part of this task)

   Changelog:
   - feat: Dark mode is now available from the settings menu
   - fix: Theme no longer resets on page reload

   **READY TO COMMIT (+125 / -12) — CONFIRM?**
   ```

   - The `+/-` column shows per-commit totals (sum of `git diff --stat` for those files).
   - The bold line at the bottom shows the grand total across all commits.
   - Omit the "Excluded" line if nothing is excluded.
   - Always show the "Changelog" section. If no entries are needed, write `Changelog: none`.
   - List each changelog entry on its own line, prefixed with `feat:` or `fix:` to match the commit type. These are the exact lines that will be written to `apps/web/src/CHANGELOG.md`.
   - Do not proceed until the user confirms (unless `yolo` mode — then skip straight to step 6).

6. **Execute the commits.** For each: `git add` the specific files, write a Conventional Commit message, never use `--no-verify`. Always stage whole files — never use `git add -p`. If a file contains changes for multiple commits, include it in whichever commit it fits best.
7. Run `git status` to confirm the result.
