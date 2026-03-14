# Contributing

## Code Style

- **Imports** — use `@/` path alias in `apps/web` instead of relative parent imports (`../`).
- **Styling** — Tailwind utility classes with `cn()` from `@/lib/utils` for conditional class merging.
- **React Compiler** — auto-memoizes everything. Do not add `useMemo`, `useCallback`, or `React.memo`.

## shadcn/ui Components

Components in `apps/web/src/components/ui/` are scaffolded from shadcn's `base-nova` style (built on Base UI, not Radix). Add new ones with:

```bash
bunx shadcn@latest add <component-name>
```

When customizing a scaffolded component, add a `// custom: <reason>` comment on every changed or added line. This makes it easy to re-scaffold with `--overwrite` and diff to re-apply customizations.

## Linting

We use **oxlint** (not ESLint). When suppressing a lint rule, use `oxlint-disable` comments — not `eslint-disable`:

```ts
// oxlint-disable-next-line import/first -- must import after vi.mock
import { useCardFilters } from "./use-card-filters";
```

Always include a `-- reason` after the rule name to explain the suppression.

## Testing

Tests use `bun:test` (API, shared) and `vitest` (web). Run all tests via `bun run test` (goes through Turbo).

**Unit vs. integration tests** — any test that needs a live database (or other external service) must use a `*.integration.test.ts` filename. The `test` scripts exclude these files so they never run in CI. Run them locally with `bun run test:integration`.

Regular unit tests (`*.test.ts`) must never depend on external services — mock everything via `mock.module`. Note that bun's `mock.module` does not always intercept transitive imports (e.g. the CRUD factory's `db` import) — if a test hits the real DB, it belongs in an integration file.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint (`feat:`, `fix:`, `refactor:`, `chore:`, etc.).

## Changelog

`apps/web/src/CHANGELOG.md` is shown to users in the "What's new" panel. Add an entry after `feat:` or `fix:` work (skip for chores/refactors users won't notice).

```plaintext
## YYYY-MM-DD

- feat: You can now flip the sort order with a toggle
- fix: A gap that appeared below the header when scrolling is now gone
```

Every entry must be a proper sentence. Never start with "Added" — just say what the feature does. For fixes, describe what was broken and how it's now fixed.
