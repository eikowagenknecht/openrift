# Contributing

## Code Style

- **Imports** — use `@/` path alias in `apps/web` instead of relative parent imports (`../`).
- **Shared package imports** — `@openrift/shared` has no barrel. Import from the leaf module that declares the symbol (`@openrift/shared/deck-rules`, `@openrift/shared/types/api/decks`); every `src/*.ts` file is exported through the `./*` pattern in its package.json. The only aggregate entries are `./contracts` (the API's router input) and `./deck-codecs`. Do not add an index file to re-export siblings, and do not re-export a shared symbol from an app module.
- **Styling** — Tailwind utility classes with `cn()` from `@/lib/utils` for conditional class merging.
- **React Compiler** — auto-memoizes everything. Do not add `useMemo`, `useCallback`, or `React.memo`.
- **Page chrome and card browsers** — page widths, top bars, sticky stacking, and the shared card-browser pieces are documented in [ui-composition.md](./ui-composition.md).
- **Index access** — `noUncheckedIndexedAccess` is on in every package, so `arr[i]` and `record[key]` are `T | undefined`. In source, resolve it honestly: iterate with `for...of` or `.map()` instead of indexing, guard and throw or return early where the value must exist, or give the record a key union so the lookup is total. A `??` default is right only when a default is the actual behaviour. Never `!` in source (lint bans it); test files may use it. Enum label maps are data-driven and stay string-keyed: read them through `enumLabel(labels.<group>, slug)` from `@openrift/shared`, which is the one place a missing label falls back to the slug. Never index a label map directly and never add a second fallback.

## Web module layout

`apps/web/src` is layered, and imports only point down: `lib` < `stores` < `hooks` < `components` < `routes`. Type imports count. oxlint enforces the order per directory through the `no-restricted-imports` overrides in `.oxlintrc.json`, so a `lib/` module cannot import a type from a hook and a component cannot import a route's `Route` object.

- **`lib/`**: pure logic and the types it needs. Nothing from React, nothing from a store, no server functions.
- **`stores/`**: Zustand stores. A pure predicate or constant a store exports for others (`isLocalDeckId`) lives in `lib/` and the store imports it.
- **`hooks/`**: React hooks, server functions and query options. A React context a hook consumes lives here; the provider component stays in `components/`.
- **`components/`**: UI. The route object comes from `getRouteApi("/path")`, search-param types from `lib/`.
- **`routes/`**: route definitions only: `createFileRoute` with its `validateSearch`, loaders, `head` and a one-line `component`. The page body is a component under `components/<domain>/`, and lint fails a route file over 300 lines.

When the rule fires, move the definition down to the layer that needs it and update every importer. Never leave a re-export behind as a shim, and never move a module up just to silence the rule unless it belongs there (a `lib/` module that writes to a store is a store action, not lib).

## React Compiler

The compiler is enabled in `infer` mode. `use`-prefixed functions that don't call hooks are silently skipped; add a `"use memo"` directive to force compilation.

**Bailouts fail the build.** When the compiler can't lower a component or hook it skips the whole file, which then ships with no memoization at all. The eslint `react-compiler` rule does not report these (it stays quiet on the compiler's `Todo` category), so `apps/web/vite.config.ts` collects every `CompileError` / `CompileSkip` and throws at `buildEnd` unless the file is listed in `ALLOWED_COMPILER_BAILOUTS` there. The only accepted entry is `lib/virtualizer-fresh.ts` (`"use no memo"` on purpose). Add to that list only when the cause is outside your control, with the reason inline. Constructs that bail, all with plain rewrites:

- **Anything branching inside a `try`/`catch` body**: a ternary, `&&` / `||` / `??`, an optional call (`onDone?.()`), an optional chain, or a `for...of` loop. Resolve the branch into a local before the `try`, use an `if` statement (those are fine), or move a loop into a plain async helper outside the component. In a `catch`, feed the thrown value to a module-level helper (`errorText(error, "Save failed")`) rather than an inline `error instanceof Error ? ... : ...`.
- **A `finally` clause.** Duplicate the cleanup on the success and failure paths. Examples in `pairings-view.tsx` and `admin-table.tsx`.
- **A function declared after the component's `return`.** Hoisting makes it work at runtime, but the compiler bails on the unreachable declaration. Move it above the `return`.
- **Calling a function declared later in the same body.** Declare it before its first use.

**`.map()` closures over changing parent state.** When a `.map()` callback reads parent state that changes during interaction, the compiler can't keep the iteration result cached: its cache key includes the closure deps, so every row re-runs on each parent update even though props look stable. The fix is architectural. Keep the changing state out of the parent's closure with a Zustand store and per-row selector subscriptions: each row reads only its own slice, the parent's `.map()` callback closes only over stable refs, the compiler caches the result, and the reconciler bails on unchanged rows. Example: `apps/web/src/stores/rules-fold-store.ts` plus the `RuleRow` subscriptions in `apps/web/src/components/rules/rules-page.tsx`.

**TanStack Virtual.** Always go through `useWindowVirtualizerFresh` from `apps/web/src/lib/virtualizer-fresh.ts`, never `useWindowVirtualizer` directly. A naively compiled virtualizer renders empty forever, because the compiler memoizes `getVirtualItems()` / `getTotalSize()` against the stable virtualizer ref (upstream issue TanStack/virtual#736). The wrapper carries `"use no memo"` and returns pre-read `{ virtualizer, virtualItems, totalSize }` so call sites don't re-trip the memoization. Keep `overflow-anchor: none` on the scroll container (it lives on `html, body` in `apps/web/src/index.css` for the window-scrolled surfaces).

**dnd-kit.** Destructure `useSortable` / `useDraggable` / `useDroppable` returns into locals before JSX. Member access on the return object in render (`{...sortable.listeners}`) makes the compiler bail with a refs-during-render error, visible only in the dev console. Pattern: `apps/web/src/components/collection/draggable-card.tsx`.

## TanStack Table

The app uses v9, where features are opt-in. Register only what a table uses via `tableFeatures()`, and reuse an existing set: `adminCardTableFeatures` (exported from `apps/web/src/components/admin/admin-card-table-shared.tsx`) covers sorting plus global filtering, and `admin-table.tsx` keeps a private sorting-only set. Types lead with `TFeatures`: `ColumnDef<typeof features, Row>`, `Table<TFeatures, TData>`, `Column<TFeatures, TData, TValue>`. Two things that bite: `row.getVisibleCells()` belongs to `columnVisibilityFeature`, so use `row.getAllCells()` when that feature isn't registered (if you ever add column hiding, switch back to `getVisibleCells()` in the same change, because `getHeaderGroups()` filters by visibility on its own and the headers would otherwise shrink while the cells don't), and `columnDef.sortingFn` is now `sortFn`. The package ships its own skills under `node_modules/@tanstack/react-table/skills/` (notably `migrate-v8-to-v9`), which are more accurate than the website guide.

## SSR-unsafe hooks

`@tanstack/react-db`'s `useLiveQuery` calls `useSyncExternalStore` without a server snapshot, which makes React revert the subtree to client rendering during SSR. Gate any consumer (directly or transitively, e.g. `useOwnedCount`, `useDeckBuildingCounts`) behind `useHydrated()` from `@/hooks/use-hydrated`. For routes whose entire payload depends on the data, gate the component mount (`if (!hydrated) return null;`), see `apps/web/src/routes/_app/cards.lazy.tsx`. For SSR-meaningful pages where crawlers should see the rest of the content, use a client-only bridge child that lifts the data up via state, see `apps/web/src/routes/_app/promos_.$language.lazy.tsx`. Always use `useHydrated`; there is no parallel `useState` + `useEffect` variant.

## Mutation errors

The QueryClient's default mutation `onError` (`apps/web/src/lib/query-client.ts`) owns the error toast, the stale-bundle reload and the 401 session refetch for every mutation, via the exported `reportMutationError` in that same file. A call site must not add its own `toast.error` in a `catch`: write `catch { /* Reported by the global mutation error toast. */ }` and keep only the state resets. Declaring `onError` in a `useMutation` call replaces that default (react-query merges mutation options shallowly), so a handler that rolls an optimistic update back must call `reportMutationError(error, queryClient)` itself, or the change reverts with nothing telling the user why. Callbacks passed per call (`mutate(vars, { onError })`) run in addition to the default, so those must not toast either: the call site's generic string and the default's server message would both appear. Two call-site toasts stay legitimate, each with a comment saying why: a partial-progress warning after a batched loop ("Import failed. Some cards may have been added.") and a per-item label when one iteration of a loop failed. Non-mutation async (clipboard, PDF/image download, `localStorage` quota) never reaches the global handler and toasts normally.

## Database access

All queries go through repository functions in `apps/api/src/modules/<domain>/repositories/`. Routes and services never touch `db` / Kysely directly; add a method to the appropriate repository. Route handlers reach repos via `c.get("repos")`.

PostgreSQL stores timestamps with microsecond precision, JavaScript `Date` with milliseconds. When comparing a `Date` against a `timestamptz` column (cursor pagination, for example), wrap the column in `date_trunc('milliseconds', ...)`. Without this, equality checks silently fail.

## API module layout

`apps/api/src/modules/<domain>/` holds one directory per domain (`catalog`, `candidates`, `marketplace`, `collections`, `decks`, `lists`, `groups`, `tournaments`, `meta`, `stage`, `scan`, `chat`, `users`, `system`), and inside a module every file belongs to one of four homes. There is no `utils/` directory — it existed alongside `lib/` with no rule separating them, the two drifted, and it was folded into `lib/`.

- **`repositories/`** — all database access. Routes and services reach it through `c.get("repos")`; nothing else may touch `db` / Kysely.
- **`services/`** — orchestration that has side effects or owns a workflow: sending mail, writing images to disk, running a job, ingesting a provider feed.
- **`lib/`** — everything shared that isn't a repository or a service. A `lib/` module may take `Repos` and await reads (`loadGroupForMember`, `expandRuleListCounts`, `loadMarkerAndChannelMaps`); the line is side effects and workflow ownership, not whether it touches the database.
- **`routes/`** — the HTTP surface, one file per contract module, named `<area>-<name>.ts` for `public`, `authenticated` and `admin`. Logic worth testing on its own moves down into `lib/`.

Each module's `wiring.ts` declares its slice of `Repos` and `Services` and the factory that builds it; `apps/api/src/deps.ts` only composes the modules. Code that no single domain owns stays at the top level: `src/lib/` (cursor codec, error helpers, share tokens) and `src/repositories/query-helpers.ts`. A new file goes into the module that owns the table or contract it serves; a file that serves two modules goes into the one that owns the data, and the other reaches it through `Repos` or an import.

Imports point down: `db` < `repositories` < `lib` < `services` < `routes`. The one two-way edge is `lib` and `repositories`: `lib/` may take `Repos`, and a repository may import a pure `lib/` helper. oxlint enforces the rest through the overrides in `apps/api/.oxlintrc.json`: routes import repository types but never repository values, services and `lib/` never import from `routes/`, `lib/` never imports a service, and only `repositories/` imports `db`. A request schema both a route and a service need lives in the shared contract. A helper both need lives in `lib/`. Test files are exempt so integration tests can seed through repository modules.

Row-to-response mapping is called a **presenter**, and it lives in `lib/<domain>-presenters.ts` — one module per domain (`collection`, `copy`, `deck`, `list`, `printing`, `product`, `deck-check`, `tournament`). Do not name these `mappers` or `*-response`, and do not park one in a service because that's where its first caller happened to be. Presenters are pure and get a sibling `*-presenters.test.ts`; the one exception is a presenter that needs a repo read to compose a detail response (`buildEntryDetail`), which stays in the domain's presenter module rather than moving to `services/`.

## Displaying card names

A Riftbound Legend is stored under its epithet (`Emperor of the Sands`) with the champion in a tag (`Azir`), but players call it `Azir, Emperor of the Sands`. **`legendDisplayName` in `packages/shared/src/utils.ts` is the only place that composes that label.** It takes `{ name, types, tags }`; a deck row spells those fields `cardName` / `cardTypes` / `tags`, so reshape at the call site rather than adding a second entry point. `compareCardDisplayName` is the sort comparator over the same rule.

Three rules follow from that:

- **Every user-facing name goes through it.** Grids, tables, detail pages, aria-labels, toasts, the tab title and og tags, deck and collection share images, the Discord embeds, the chat lookup line, PDFs, and the deck, list and Cardmarket exports. A surface that renders `card.name` directly is a bug, and it is how `/decks` grouped by legend under `Emperor of the Sands` while every tile beside it said `Azir`.
- **Sorting uses the display name too.** Sorting on the stored name filed Azir under E while the label read A. `sortCards` precomputes the labels rather than composing inside the comparator.
- **Admin is the exception.** Admin surfaces edit the canonical `cards.name`, so they show it raw: the card tables, the card and printing editors, ingest and candidate review, and the marketplace mapping pickers.

A Legend is named for a bare epithet, so a comma inside one qualifies the print run rather than separating two halves of a name: four cards have faces reading `Dark Child, Starter`. `legendDisplayName` cuts there, giving `Annie, Dark Child`, because nobody says that half aloud. **`cards.name` keeps the qualifier** — it is printed on the card, so the catalogue has to match it, and that is also why `n:starter` still finds these. A champion **unit** is the opposite case (`Garen, Crownguard` is the whole name) and is untouched, because the rule only applies to Legends.

Where a name is denormalized out of SQL, select `types` and `tags` beside it and compose in TypeScript. Do not write the rule into a query or a generated column, which would make it two definitions that can drift.

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

## Comments

The default is no comment. A comment exists only when it states something the code cannot say:

- **A non-derivable constraint or invariant** — ordering requirements, locking rationale, anything a correct-looking edit would silently break.
- **An external quirk** — a browser or library bug, ideally with the condition under which the workaround (and the comment) can be removed.
- **A deliberate non-action** — "this field is left untouched on purpose", where the omission would otherwise read as a bug.

Everything else gets deleted, not improved: comments restating the code, section banners, diff narration ("now handles null"), and provenance markers ("Regression:", audit or ADR/migration numbers outside migration files) — git history owns provenance. Before writing a comment, ask what rename, extraction, or test title would make it unnecessary. In tests, intent belongs in the `it()` title and grouping in `describe` blocks. JSDoc follows the same bar: no boilerplate `@param`/`@returns` tags; a JSDoc survives only as a summary carrying real information, usually one line. Functional comments are exempt: `oxlint-disable` reasons, `// custom:` shadcn markers, `"use memo"`/`"use no memo"` directives.

The three kinds above are the only ones. In practice the bar gets stretched, so these limits are hard:

- **Length.** A comment is at most two lines. A module header is at most five. Anything longer is an ADR, a doc page, or the commit body.
- **Fields, enum members, constants: no comment.** The exception is a unit or a wire format (`/** ISO 3166-1 alpha-2 */`, `/** ms */`). `slug: string` does not need `/** The set's slug, which is what the URL carries. */`.
- **Exports get a one-line JSDoc only when the name cannot carry the meaning.** If the summary would restate the name, leave it off.
- **Design and product rationale never goes in code.** Why a default is what it is, why a row is rendered one way and not another, what "a reader" expects: that is an ADR if one exists, else the commit message. Code carries constraints, not arguments.
- **A behaviour covered by a test is documented by the test title.** Do not also describe it in a comment, and never write "pinned by a test".
- **Rationale tells.** A comment containing "rather than", "instead of", "reads as", "which is what", "so a reader", "the whole point", or "worth" is an argument for a decision, not a constraint. Delete it or reduce it to the constraint.

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
| `dateLeafParts`       | `AUG` / `15`                                          | The calendar-leaf tile for an instant, on the viewer's clock.                |
| `dateLeafPartsUtc`    | `AUG` / `15`                                          | The same tile for a day that belongs to an event, not to the viewer.         |
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

**Area** is exactly one tag from this list, spelled as written: `Cards` (browser, search, card detail), `Collection` (owning cards, wishlists/tradelists, import/export), `Decks`, `Groups` (friend groups, sharing, activity feed), `Trades`, `Tournaments`, `Rules`, `Packs`, `Products` (the sealed-products catalog), `Designer`, `Meta` (the meta archive: events, standings, decklists), `Account`, `App`. Use `App` for anything cross-cutting (performance, theming, navigation, offline, release updates).

**Highlights vs Other** — Highlights are what a user would actually care about on that release: new surfaces, visible behavior changes, fixes to something painful. Polish, wording tweaks, and edge cases go under Other. There is no quota; a quiet release can have none, and a date may have only one of the two sections.

**Writing the entry:**

- The title is a noun phrase, not a sentence. Never start with "Added" or "Added the ability to".
- The body is one sentence, around 100 characters, ending in a period. It adds the fact the title doesn't already carry — not a feature tour.
- Keep the body free of em dashes so the divider stays the only one on the line.
- Say what the change does for the user. Cut presentational detail (hover behavior, exact positions, color names) unless the visual itself is the fix.
- For fixes, say briefly what was broken and how it now behaves.
- Fold closely related changes into one entry. Several tweaks to the same feature are one bullet, and a feat plus its follow-up fix collapse into the feat.

Older dates use a flat `- feat: sentence` form with no sections. The parser still renders those (as Other), so leave them alone and use the current format going forward.
