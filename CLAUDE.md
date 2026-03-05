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
