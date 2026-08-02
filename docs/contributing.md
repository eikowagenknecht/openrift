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

We use **oxlint** as the primary linter, plus ESLint for the React Compiler rules that oxlint doesn't cover. When suppressing an oxlint rule, use `oxlint-disable` comments — not `eslint-disable`:

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

## Dependencies

Pin exact versions everywhere — no `^`, no `~`. `syncpack lint` enforces this on commit.

The root `overrides` block is separate: each entry collapses two copies of a package into one, and only works while it matches the version the repo depends on directly. `bun scripts/check-override-pins.ts` (also on commit) fails when one drifts. The `//` keys next to each override explain why it exists.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint (`feat:`, `fix:`, `refactor:`, `chore:`, etc.).

## Changelog

`apps/web/src/CHANGELOG.md` is shown to users in the "What's new" panel. Add an entry after `feat:` or `fix:` work. Skip it for chores, refactors, perf, CI, docs, admin-only features, and internal fixes users won't notice.

Each date splits into `### Highlights` and `### Other`. The panel shows Highlights expanded and collapses Other behind a "N more changes" toggle, and the Discord webhook posts the same split.

```plaintext
## YYYY-MM-DD

### Highlights

- feat(Collection): **Inline tradelist removal** — each card now has a remove button right on the card, no right-click menu needed.
- fix(Rules): **Duplicate rule warnings** — a card under several printings no longer triggers the same warning twice.

### Other

- feat(Tournaments): **Sort deck-check cards by energy** — orders each zone by energy cost, then power, then name.
- fix(Groups): **Activity-feed icon sizes** — member avatars now line up with the other event icons.
```

An entry is `type(Area):`, then a bold title of 3–6 words, then an em dash with a space on each side, then one plain sentence. Group `feat:` entries above `fix:` entries within each section, newest date at the top.

**Area** is exactly one tag from this list, spelled as written: `Cards`, `Collection`, `Decks`, `Groups`, `Trades`, `Tournaments`, `Rules`, `Packs`, `Products`, `Designer`, `Account`, `App`. Use `App` for anything cross-cutting (performance, theming, navigation, offline).

**Highlights vs Other** — Highlights are what a user would actually care about on that release: new surfaces, visible behavior changes, fixes to something painful. Polish, wording tweaks, and edge cases go under Other. There is no quota; a quiet release can have none, and a date may have only one of the two sections.

**Writing the entry:**

- The title is a noun phrase, not a sentence. Never start with "Added" or "Added the ability to".
- The body is one sentence, around 100 characters, ending in a period. It adds the fact the title doesn't already carry — not a feature tour.
- Keep the body free of em dashes so the divider stays the only one on the line.
- Say what the change does for the user. Cut presentational detail (hover behavior, exact positions, color names) unless the visual itself is the fix.
- For fixes, say briefly what was broken and how it now behaves.
- Fold closely related changes into one entry. Several tweaks to the same feature are one bullet, and a feat plus its follow-up fix collapse into the feat.

Older dates use a flat `- feat: sentence` form with no sections. The parser still renders those (as Other), so leave them alone and use the current format going forward.
