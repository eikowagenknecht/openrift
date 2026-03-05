Find any commits since the last changelog date in `apps/web/src/CHANGELOG.md` that need changelog entries and add them.

1. Read the changelog to find the most recent date heading.
2. Run `git log` since that date to find all commits.
3. Filter for user-facing `feat:` and `fix:` commits only. Skip chore, refactor, perf, test, docs, ci, style, and internal fixes users won't notice.
4. Cross-reference against existing entries to avoid duplicates.
5. Draft entries following the rules in CLAUDE.md and MEMORY.md, then ask me to confirm before writing.
