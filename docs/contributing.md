# Contributing

## Code Style

- **Imports** — use `@/` path alias in `apps/web` instead of relative parent imports (`../`).
- **Styling** — Tailwind utility classes with `cn()` from `@/lib/utils` for conditional class merging.
- **React Compiler** — auto-memoizes everything. Do not add `useMemo`, `useCallback`, or `React.memo`.

## API module layout

`apps/api/src` has exactly four homes for non-route code, and every file belongs to one of them. There is no `utils/` directory — it existed alongside `lib/` with no rule separating them, the two drifted, and it was folded into `lib/`.

- **`repositories/`** — all database access. Routes and services reach it through `c.get("repos")`; nothing else may touch `db` / Kysely.
- **`services/`** — orchestration that has side effects or owns a workflow: sending mail, writing images to disk, running a job, ingesting a provider feed.
- **`lib/`** — everything shared that isn't a repository or a service. A `lib/` module may take `Repos` and await reads (`loadGroupForMember`, `expandRuleListCounts`, `loadMarkerAndChannelMaps`); the line is side effects and workflow ownership, not whether it touches the database.
- **`routes/`** — the HTTP surface. Logic worth testing on its own moves down into `lib/`.

Row-to-response mapping is called a **presenter**, and it lives in `lib/<domain>-presenters.ts` — one module per domain (`collection`, `copy`, `deck`, `list`, `printing`, `product`, `deck-check`, `tournament`). Do not name these `mappers` or `*-response`, and do not park one in a service because that's where its first caller happened to be. Presenters are pure and get a sibling `*-presenters.test.ts`; the one exception is a presenter that needs a repo read to compose a detail response (`buildEntryDetail`), which stays in the domain's presenter module rather than moving to `services/`.

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

All workspaces use `vitest`. Run all tests via `bun run test` (goes through Turbo).

**Unit vs. integration tests** — any test that needs a live database (or other external service) must use a `*.integration.test.ts` filename. The `test` scripts exclude these files so they never run in CI. Run them locally with `bun run test:integration`.

Regular unit tests (`*.test.ts`) must never depend on external services — mock everything via `vi.mock()`. If a test hits the real DB, it belongs in an integration file.

## Persisted Zustand Stores

Never pass `version`/`migrate` to `persist()`. Users run stale cached bundles after a deploy, and an older bundle (implicit version 0, no migrate) that rehydrates a newer-versioned blob discards the whole blob — the exact data loss versioning looks like it prevents (rationale: `apps/web/src/stores/local-decks-store.ts`).

Absorb shape changes in a defensive `merge` that validates each field and falls back to defaults. For a genuinely breaking change, branch on a `schemaVersion` field inside the persisted state (handled by `merge`), or rotate to a new storage key with a one-time migration from the old key. Enforced by `apps/web/src/stores/persist-no-version.test.ts`.

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
