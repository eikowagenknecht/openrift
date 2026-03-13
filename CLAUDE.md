# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. For full project documentation, see `docs/`.

## Project Overview

OpenRift is a card collection browser for the Riftbound trading card game. It's a Turborepo monorepo with a React frontend (`apps/web`), a Hono API server (`apps/api`), and a shared types/logic package (`packages/shared`), backed by PostgreSQL. See `docs/architecture.md` for infrastructure details.

## Commands

```bash
# Development
bun dev:web          # Start the web app dev server (Vite)
bun dev:api          # Start the API server (Hono, needs DATABASE_URL)
bun dev              # Start all apps in dev mode

# Database
bun db:migrate       # Run migrations (reads DATABASE_URL from .env)
bun db:rollback      # Roll back the last migration
bun make-admin -- <email>  # Grant admin role to a user
docker exec openrift-db-1 psql -U openrift -c "SQL"  # Run a one-off query

# Build
bun run build        # Build all packages (Turbo, runs shared first)

# Lint & Format
bun lint             # Full lint (builds first, then oxlint + oxfmt)
bun lint:oxlint      # Run oxlint with --fix
bun lint:oxfmt       # Run oxfmt on apps/ and packages/

# Single app/package
bun run --cwd apps/web dev
bun run --cwd packages/shared build
```

For dev setup, see `docs/development.md`. For deployment, see `docs/deployment.md`.

## Key Patterns

- `useCardFilters` hook syncs all filter state to URL query strings (shareable URLs)
- `useCards` hook fetches cards and prices via React Query
- `CardBrowser` is the main container — composes `FilterBar`, `ActiveFilters`, `CardGrid`, `CardDetail`
- Card grid uses `@tanstack/react-virtual` for virtualized scrolling
- `@/` alias maps to `apps/web/src/`

## Conventions

- **React Compiler** is enabled — do not add `useMemo`, `useCallback`, or `React.memo` in new code.
- **Commits:** Conventional Commits enforced by commitlint (`feat:`, `fix:`, `refactor:`, etc.)
- **TypeScript:** Strict mode, `noUnusedLocals`, `noUnusedParameters` enabled
- **Styling:** Tailwind utility classes with CSS variables for theming (light/dark). Use `cn()` from `@/lib/utils` for conditional class merging.
- **Linting:** oxlint (primary) + oxfmt. Always lint before committing (`bun lint`). To suppress a rule, use `oxlint-disable` comments (not `eslint-disable`) with a reason: `// oxlint-disable-next-line rule/name -- reason`.
- **shadcn/ui components:** Components in `apps/web/src/components/ui/` are scaffolded from shadcn's `base-nova` style. Add new ones via `bunx shadcn@latest add <name>`. When customizing a scaffolded component, add a `// custom: <reason>` comment on every changed/added line. This makes it easy to re-scaffold and diff to re-apply customizations. Never modify scaffolded code without a comment.
- **Card types:** `Card`, `CardType`, `CardVariant`, `Rarity`, `Domain`, `CardFilters`, `SortOption` — all defined in `packages/shared/src/types.ts`

See `docs/contributing.md` for full conventions.

## File Locking (Multi-Agent Coordination)

Multiple Claude Code sessions may run in parallel in this repo. To avoid conflicts, use file-based locks before editing any file.

**Lock directory:** `.claude-locks/`

**Protocol:**

1. **Before editing a file**, check if `.claude-locks/<encoded-path>.lock` exists (encode by replacing `/` with `__`, e.g., `apps/web/src/foo.tsx` → `apps__web__src__foo.tsx.lock`).
2. **If locked**, DO NOT edit that file. Tell the user it's locked and what task holds it. Wait for the user to decide.
3. **If unlocked**, create the lock file before editing. The lock file content should be a short description of your task.
4. **When done** with your task (or when the user says to), remove all your lock files.

```bash
# Check for a lock
cat .claude-locks/apps__web__src__foo.tsx.lock 2>/dev/null

# Acquire a lock
echo "Refactoring profile page" > .claude-locks/apps__web__src__foo.tsx.lock

# Release a lock
rm .claude-locks/apps__web__src__foo.tsx.lock

# Release all your locks when done
rm .claude-locks/*.lock 2>/dev/null
```

**Rules:**

- Always check before editing. Never skip this.
- If you need a file that's locked, don't ask the user — just recheck the lock every 60 seconds until it clears, then proceed. Mention once that you're waiting.
- Lock files older than 5 minutes can be assumed stale and overwritten. If your task takes longer, re-touch the lock file periodically to keep it fresh.
- Never `git stash` or discard changes in files you don't own or where another agent is working on. This can cause data loss!
- **Scoped lint/test:** When other agents may be working in parallel, do NOT run `bun lint` or `bun run test` globally — it will pick up other agents' incomplete work and fail. Instead, lint and test only the files you touched:

```bash
# Lint only your files
bunx oxlint file1.ts file2.ts
bunx oxfmt file1.ts file2.ts

# Run only relevant test files
bun run --cwd apps/web vitest run src/path/to/relevant.test.ts
bun run --cwd apps/api vitest run src/path/to/relevant.test.ts
```

## Changelog

`apps/web/src/CHANGELOG.md` is shown to users in the "What's new" panel. After completing `feat:` or `fix:` work, you MUST add an entry there (unless it's a chore/refactor that users won't notice or already has an entry). This helps us communicate improvements to users and track changes over time.

**Format:**

```plaintext
## YYYY-MM-DD

- feat: Short description in plain language — what it does for the user
- fix: Short description of what was broken and is now fixed
```

**Tone:** Natural and direct. No jargon. Short enough to scan. E.g.:

- `feat: Cards are grouped by set, with the set name staying visible as you scroll`
- `fix: App updates now show up faster on iOS`

It must always read as a proper sentence, not a fragment. Avoid starting with "Added" or "Added the ability to" — just say what the feature does for the user. For fixes, briefly describe what was broken and how it's now fixed.

Group multiple entries under the same date. Add new entries at the top, no matter the type. Don't add entries for: chore, refactor, perf, ci, docs, or internal fixes that users won't notice.
