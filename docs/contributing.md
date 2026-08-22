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

## Matching card names

There are exactly two ways to compare card names, and picking the wrong one is how the same query used to return different cards on different surfaces.

**Search** answers "what did the user mean?" and lives in `packages/shared/src/search-fold.ts` plus `card-search.ts`. `foldForSearch` normalizes away everything that carries no meaning (accents, ligatures, dash variants, apostrophes and quotes); `squashForSearch` additionally removes every separator, and is for short identifier-like values only — never rules or flavor text, where squashing joins words across boundaries and invents matches.

Three entry points sit on top of that fold, and nothing else should hand-roll a fourth:

- `searchCards(index, query, limit)` — ranked, for pickers, palettes, the Discord bot and the chat lookup.
- `resolveCard(index, name)` — one written name to one card, for importers and deck check. Returns `matched` only when exactly one card reaches the strongest tier any card reaches; a tie is `ambiguous` and belongs in front of the user. There is deliberately no approximate matching.
- `matchesCardQuery(query, values)` — an unranked boolean, for a table's global filter or a plain `.filter()`. Never write `name.toLowerCase().includes(query)`: the catalogue stores `Doran’s Shield`, so a typed `Doran's` finds nothing.

A card is indexed under its canonical name plus `SearchableCard.altNames`, which every surface builds with `cardSearchAltNames` — the colloquial Legend form (`"Azir, Emperor of the Sands"`), a printing's localized `printedName`, and the curated `card_name_aliases` keys where the server has them. Server-side, `services/card-lookup-index.ts` holds one memoized index for the whole API, so a name that resolves in chat resolves the same way in deck check.

**Identity** answers the different question "are these two rows the same card?" and is `normalizeNameForIdentity` in `utils.ts`, mirrored in SQL as the `norm_name` columns. Use it for dedup, grouping and storage keys, never for matching user input. It deliberately does **not** fold accents, because NFKD merges letters that are distinct in some scripts (Cyrillic `й` decomposes to `и`) and a collision in a uniqueness key is a bug. Search wants the opposite. One function used to serve both, search inherited the no-folding compromise, and reaching for the identity key to match typed text brings that back.

## jsonb columns

**Pass the value, never `JSON.stringify` it.** postgres.js picks a bound parameter's serializer from the type Postgres describes for it, and for a jsonb parameter that serializer is already `JSON.stringify`. Hand it the value (`{ a: 1 }`, `[1, 2]`, `null`) and the column gets the right structure; hand it JSON _text_ and the text is encoded a second time, landing as a jsonb **string scalar** (`"{\"a\":1}"` where the column should hold `{"a": 1}`). Reads follow the same rule, so a jsonb column returns a string only when a string is genuinely what it holds. There is no serialization helper to reach for, and no `parseJsonb` on the way back — both existed, both are gone, and reintroducing either would be reintroducing the bug.

That double encoding was the longest-lived data bug in this repo. It corrupted nine columns (every `job_runs.result`, every `user_preferences.data`, every `pods.penalty_breakdown`, and more) and stayed invisible for months because a defensive `JSON.parse` on every read repaired the shape before any caller could notice. Where SQL had to look inside a blob, the workaround was written into the query instead of the bug being found: `(data #>> '{}')::jsonb` in the preferences lookups, a `jsonb_typeof` CASE in the meta-candidate scan. Migration 244 unwrapped the data and removed the workarounds.

Two guards keep it fixed, and a new jsonb column needs both:

1. **Type the column as its parsed shape on the write side too** in `apps/api/src/db/tables.ts` — plain `T`, or `ColumnType<T, T | undefined, T>` when the column has a DB default. Never `ColumnType<T, string, string>`: that shape is what _required_ the broken `JSON.stringify` at every call site, and it is why the one column typed honestly (`admin_events.oldValues`) was corrupted through an `as never` instead.
2. **Add a `jsonb_typeof` CHECK constraint** in the migration that creates the column (`CHECK (col IS NULL OR jsonb_typeof(col) = 'object')`, or `'array'`). The types are bypassable with a cast or a raw `sql` fragment; the constraint is not. `apps/api/src/db/jsonb-columns.integration.test.ts` fails if a jsonb column ships without one, and also fails if any column anywhere holds a string scalar.

The one exemption is `job_runs.result`, whose shape is each job's own and has no single answer; it is listed in that test's `SHAPE_EXEMPT`.

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

## Dates and times

Every date the app shows is ISO 8601 and comes from `packages/shared/src/format-date.ts`. Nothing else formats a date: `no-restricted-properties` in `.oxlintrc.json` fails the build on `toLocaleDateString` / `toLocaleTimeString` anywhere under `apps/web/src` or `packages/shared/src`. (Number formatting is untouched, so `count.toLocaleString()` is still fine.)

The module builds every form from plain `Date` getters and never touches `Intl`, so there is no locale to pin and no way for a date to render differently on the server than in the browser. That whole class of React #418 hydration mismatch is gone by construction.

| Function              | Output                                                | Use for                                                                      |
| --------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `formatDay`           | `2026-08-15`                                          | A calendar day, in UTC. The default for anything dated.                      |
| `formatMonth`         | `2026-08`                                             | A month, in UTC.                                                             |
| `formatDayTime`       | `2026-08-15 23:59`                                    | An instant in UTC, for admin and ops surfaces.                               |
| `formatDayLocal`      | `2026-08-15`                                          | The day an instant fell on for **this viewer**.                              |
| `formatTimeLocal`     | `14:30`                                               | Time of day for this viewer, under a day heading.                            |
| `formatDayTimeLocal`  | `2026-08-15 14:30`                                    | An instant on the viewer's own clock.                                        |
| `formatRelativeTime`  | `3h ago` / `in 3h`                                    | A gap from now, either direction. `{ seconds }` and `{ compound }` widen it. |
| `formatRelativeDay`   | `Yesterday` … `2026-01-15`                            | A day relative to today, falling back to `formatDay`.                        |
| `dateLeafParts`       | `AUG` / `15`                                          | The calendar-leaf tile.                                                      |
| `formatReleasePeriod` | `2026-08-15` / `2026-08` / `2026-Q2` / `2026` / `TBA` | A set release, at whatever precision is known.                               |

Two rules decide which one you want:

- **A calendar day is always the UTC day.** A day has no timezone of its own, so the app picks one and states it. `formatDayLocal` is the exception, for when the day is the viewer's own (grouping an activity feed into days as they lived them) rather than a property of the data.
- **An instant renders in UTC for ops, and on the viewer's clock for players.** Admin tables use `formatDayTime`, where the reader knows the server is UTC. Anything a player reads as a wall clock (a submission deadline, a tournament start) uses `formatDayTimeLocal`, because being two hours wrong about a deadline is a real bug.

The `…Local` functions depend on where the code runs, so they are only safe on `ssr: "data-only"` routes. On a server-rendered route they mismatch on hydration for every visitor outside UTC.

Date entry is separate and unchanged: always the `DatePicker` from `@/components/ui/date-picker`, never a raw `<input type="date">`, with a validated `HH:mm` text input for the time part (the native time input renders in the OS clock format and cannot be forced to 24h).

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
