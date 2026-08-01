---
status: accepted
date: 2026-06-28
---

# ADR-034: Dynamic List Rules

## Context and Problem Statement

ADR-005 promised that wish lists and trade lists would come in both manual and rule-generated (dynamic) flavors, with rules stored as "a saved JSONB filter definition evaluated at query time" and "the exact rule schema … defined as Zod types in `packages/shared` at implementation time." That never happened: a `rules jsonb` placeholder existed on the pre-unification `wish_lists` / `trade_lists` tables, but migration `132-unified-lists.ts` dropped it when it merged them into `lists`, and it was never re-added. Today only manual entries exist (`list_entries`). There is no rule storage, schema, evaluator, or UI.

The product owner now wants dynamic lists, scoped to four concrete use cases:

1. A **trade** list of every copy in one specific collection (a physical trade binder).
2. A **wish** list for a complete playset of every existing card.
3. A **wish** list of one of every English printing of _non-standard_ cards, excluding metal / metal-deluxe finishes and signed printings, minus a few manually-chosen exclusions.
4. A **trade** list of every common/uncommon non-foiled card the owner has more than two playsets of.

This ADR was scoped in a question-driven design session with the product owner (2026-06-28). It supersedes the dynamic-rules portions of ADR-005 (the "Dynamic rules" paragraphs under _Wish Lists_ and _Trade Lists_). Everything else in ADR-005 stands. The session resolved the v1 scope to be maximal: full backend, dynamic lists participate in friend-group trade matching, negation lives in the shared filter language, and a complete rule-editor UI ships. The "Implementation specification" below is written so a fresh reader can build it end-to-end. It is normative.

> **Amendment (2026-06-30, during implementation).** Two extensions were approved beyond the single-rule design originally drafted below. The spec sections that follow have been updated to match what shipped.
>
> 1. **A list carries an _array_ of rules** (`rules jsonb`, `NOT NULL DEFAULT '[]'`) rather than one nullable `rule` column. Wish lists may stack several rules (capped at `MAX_LIST_RULES = 10`). Trade lists are capped at one by the route layer. Every rule's output unions into the same deduped result. The shared evaluator gains an array wrapper `evaluateListRules`. This moves the old _Out of scope_ "Multiple rules per list" item into v1.
> 2. **Wish rules gain an optional `netOwned` flag** that subtracts the owner's owned copies and emits only the positive shortfall, so "a playset of every card" can mean "…of every card I don't already own." It falls back to the full target when owned copies are unavailable.

> **Amendment 2 (2026-07-06).** Trade lists may now carry several rules too (same `MAX_LIST_RULES` ceiling), and every list gets a `rule_combine` mode (migration 190, `lists.rule_combine text NULL`) naming how overlapping rule outputs reconcile. NULL means the intent's default, so existing lists follow the new defaults without a backfill. The spec sections below have been updated to match.
>
> 1. **Wish modes:** `sum` (default) adds overlapping rules' quantities; `max` keeps the old highest-rule-wins behavior. This changes existing multi-rule wish lists from max to sum, a deliberate product decision. Owned netting happens after combination: plain and `netOwned` targets accumulate in separate buckets and the owned count subtracts from the net bucket once, so two summed `netOwned` rules share one owned pool.
> 2. **Trade modes:** `protect` (default) offers a copy only when no rule that matches it kept it, so stacking rules can only widen protection. `count-sum` / `count-max` combine the per-card keep counts into one total and keep the nicest that-many across the union of matched copies. The old behavior (union of offers, which silently overrode any other rule's keep) is gone; it is exactly why trade lists were capped at one rule.
> 3. **Keep-priority ladder change:** the deck-availability tier is removed, and standard-vs-special (`isStandardPrinting`) becomes the top tier, so a special copy (marked, signed, alt art, premium finish) is kept over a plain one even across rarities. Below it: rarity, finish, art variant, signed, then `canonicalRank` / copy id. No dedicated marker or distribution-channel tier; a marked copy already counts as special at the top tier.

> **Amendment 3 (2026-07-08).** Card-kind wish rules are filter-aware end to end. Previously the filters only decided which cards enter the list: the resulting card want matched any printing of the card in group trade matching, and `netOwned` counted any owned copy toward the target. Both now respect the filters.
>
> 1. **Acceptable printings in matching:** each rule-produced card entry carries the union of the contributing rules' matched printing ids (`VirtualEntry.acceptablePrintingIds`, surviving `expandList` on rule-only entries). The group matcher rejects a supply copy whose printing is outside the set. A manual entry on the same card lifts the restriction, so manual card wants keep matching any printing. Printing-kind demand is unaffected, its key is already exact.
> 2. **Filter-aware netting:** `netOwned` subtracts only owned copies whose printing one of the `netOwned` rules matched, so an owned copy outside the filters (excluded art variant, other language) no longer fills the want. Printing-kind netting already keyed per printing and is unchanged.

> **Amendment 4 (2026-08-01).** Organize lists carry rules too. The original "rules are allowed only on `wish` and `trade` lists" (§1 below) rested on the discriminant `kind: "wish" | "trade"` reading as an intent. It is not one: it names the rule's _shape_, and a shape follows the list's **kind**, not its intent. Card and printing lists take the demand shape (match the catalog, want N of each match); copy lists take the supply shape (select owned copies, hold back N per card, emit the surplus). `chk_lists_intent_kind` pins wish to card/printing and trade to copy, so for those two the kind-based rule is exactly the intent-based one it replaces, but organize lists span all three kinds and therefore already have a well-defined shape for each.
>
> 1. **Gate moved from intent to kind.** Migration 218 drops `chk_lists_rules_intent`; shape validation stays app-level. `ruleCombineMatchesIntent` → `ruleCombineMatchesKind`, `defaultRuleCombine(intent)` → `defaultRuleCombine(kind)`, plus a new `ruleKindForListKind(kind)` that the create schema and the PATCH route both validate against. The persisted `"wish"` / `"trade"` discriminant values are unchanged, so no data migration.
> 2. **Nothing else moved.** The evaluator (`evaluateListRules`), `expandList`, and the repo expansion path already keyed off `listKind` and `rules.length`, never intent, so they needed no change. Organize lists don't enter trade matching, so §III is untouched.
> 3. **Personal copies only.** An organize copy list may hold group-shared copies added by hand (`personalOnly = false` on the manual-add routes), but a rule only ever draws on the owner's own copies, exactly like a trade rule — `ownedRowsForUser` is the single copy source on both the server and the editor preview. Widening it would need a group-visibility-aware copy query and a separate decision about what the anonymous public-share path may expand, so it is deferred.
> 4. **Wording, not math, differs per intent.** The keep/offer split has nothing to offer on an organize list, so the same control reads as "leave out the nicest N per card, include the rest" there (`apps/web/src/lib/rule-wording.ts` holds the per-intent copy, `rulePresetsFor` the per-intent presets). `keepPerCard: 0`, the default, includes every matching copy.

## Decision Drivers

- All four use cases must be expressible. They span every `intent` × `kind` combo a list can take.
- Don't invent a second filter language: reuse `CardFilters` + `filterCards` (`packages/shared`), which are isomorphic (run on Bun and in the browser).
- Dynamic lists read private inventory (copies, collections) and must still work for public shares (ADR-018) and inside trade matching (ADR-013/017/019).
- "Playset" is per-card: `getPlaysetSize(cardType, keywords)` returns 1 (legends / Shield keyword) or 3.
- Dynamic lists must never go stale.

## Considered Options

- Predicate language: **A.** bespoke JSONB DSL · **B.** reuse `CardFilters`, extended.
- Evaluation timing: **C.** materialize rows · **D.** lazy at read time.
- Runtime: **E.** client-only · **F.** server-side at read time + client-side editor preview.

## Decision Outcome

We choose B + D + F, at maximal scope (matching included, negation in the shared language, full UI).

- **B:** a rule is a `CardFilters` plus thin mode math (target quantity / keep-threshold / exclusions). `CardFilters` gains negation (per-dimension exclude) and a derived `isStandard` flag; both also benefit the card browser.
- **D:** lazy evaluation, nothing materialized, so results are always current and there is no write-time fan-out.
- **F:** a single server-side authority (`expandList`) expands rules wherever entries are materialized. The same `packages/shared` evaluator re-runs client-side for instant editor preview.

### Consequences

- Good: one predicate language, one evaluator, one "standard" definition shared by the rule editor and the card browser.
- Good: lazy reads never go stale; no materialized rows to reconcile.
- Good: server-side expansion works for public shares without leaking inventory.
- Bad: `CardFilters` changes ripple to every consumer (URL schema, `filterCards`, `getAvailableFilters`, `computeFilterCounts`, the filter UI, every default-filters constructor).
- Bad: friend-group matching moves from a single SQL join to app-level expansion, the highest-risk task here. It must preserve visibility, reservation filtering, and trade-pref coalescing exactly.
- Bad: read-time evaluation puts catalog + copy assembly on list-read paths. Acceptable at current scale (ADR-009: ~664 cards), revisit at the ADR-009 thresholds.

## Resolved design decisions (conceptual)

### 1. `intent` × `kind` already encodes the mode

The existing `lists.intent` ∈ {wish, trade, organize} and `lists.kind` ∈ {card, printing, copy}, gated by `chk_lists_intent_kind`, already partition the space. A rule produces virtual entries of the list's own kind:

| Use case                         | intent + kind   | Mode                                   |
| -------------------------------- | --------------- | -------------------------------------- |
| 1 binder                         | trade + copy    | supply: select owned copies            |
| 2 playset of every card          | wish + card     | demand: qty per card                   |
| 3 one of every matching printing | wish + printing | demand: qty per printing               |
| 4 surplus commons/uncommons      | trade + copy    | supply: copies beyond a keep-threshold |

Every intent may carry rules; the list's **kind** picks the shape (amendment 4). Card and printing lists take the demand shape, copy lists the supply shape, so an organize list of any kind is covered by the same two shapes the table above already uses.

### 2. Definition of a "standard" printing

`isStandardPrinting(printing)` returns true iff all hold (confirmed by the product owner):

- `artVariant === "normal"`, and
- `isSigned === false`, and
- not promo (`markers.length === 0`), and
- finish is standard **for the rarity**:
  - `metal` / `metal-deluxe` → never standard, any rarity;
  - rarity ∈ {common, uncommon} → standard finish is `normal` only;
  - rarity ∈ {rare, epic, showcase} (and any other non-low rarity) → standard finish is `normal` or `foil`.

Current vocab: finishes `normal | foil | metal | metal-deluxe`; rarities `common | uncommon | rare | epic | showcase`. The low-rarity set lives in `well-known.ts` so it stays correct as the vocab grows.

### 3. Storage & merge

One JSONB `rules` column on `lists` (an array, `NOT NULL DEFAULT '[]'`), app-validated. Wish and trade lists may both carry several rules (≤ `MAX_LIST_RULES`), combined per the list's `rule_combine` mode (Amendment 2). A list may carry rules and manual `list_entries`. The rendered list is `manual ∪ (combined rule output)`, deduped (§Impl 4). When a manual entry and a rule collide on the same card/printing, their quantities add: the manual entry keeps its own row, `id`, and trade override and stays independently editable, while the rule contributes on top (so "I always want 1 of this, plus a playset from the rule" reads as 4, not 3). Overlapping wish rules combine per the mode (`sum` default, `max` optional) inside `evaluateListRules`, before `expandList`. Copies union by `copyId` (one physical card can't be wanted twice). Cross-list additive stacking (ADR-005 shopping list) is unchanged.

### 4. Evaluation & sharing

`evaluateListRule` / `evaluateListRules` (pure, in `packages/shared`) + `expandList` (the union authority) run server-side wherever entries are materialized, fed catalog rows and the list owner's copies from repositories, so a public viewer receives concrete entries, never the rules or the owner's collection. The same functions run client-side in the editor for live preview. Nothing is materialized.

---

# Implementation specification (normative)

Build in this order. Each step is independently testable: (I) shared core → (II) API expansion → (III) matcher rework → (IV) web filter language → (V) rule-editor UI. Follow all repo conventions (repositories-only DB access, exact-pinned deps, tests for every store/hook/lib, oxlint/oxfmt, changelog entry, migration barrel + schema regen).

## I. `packages/shared` core

### I.1 `isStandardPrinting`

- New `packages/shared/src/standard.ts`: `export function isStandardPrinting(printing: Printing): boolean` implementing §2. Export from `packages/shared/src/index.ts`.
- In `packages/shared/src/well-known.ts` add `export const LOW_RARITIES: ReadonlySet<Rarity> = new Set(["common", "uncommon"]);`
- Tests `standard.test.ts`: every rarity × every finish × signed × promo × non-normal art (boundary matrix).

### I.2 Extend `CardFilters` with negation + `isStandard`

In `packages/shared/src/types/search.ts`, add to `CardFilters`:

```ts
  // Negation companions. A row is rejected if it matches ANY excluded value.
  // Scalar dims (sets, languages, rarities, types, artVariants, finishes): value ∈ exclude.
  // Array dims (superTypes, domains, markerSlugs, distributionChannelSlugs, customTagSlugs):
  //   the row's array ∩ exclude ≠ ∅.
  setsExclude: string[];
  languagesExclude: string[];
  raritiesExclude: Rarity[];
  typesExclude: CardType[];
  superTypesExclude: SuperType[];
  domainsExclude: Domain[];
  artVariantsExclude: ArtVariant[];
  finishesExclude: Finish[];
  markerSlugsExclude: string[];
  distributionChannelSlugsExclude: string[];
  customTagSlugsExclude: string[];
  // Derived tri-state. null = no constraint; true = standard only; false = non-standard only.
  isStandard: boolean | null;
```

Make `CardFilters` the single source of truth via a Zod schema (needed anyway for rule validation, §I.4): add `cardFiltersSchema` to `packages/shared/src/schemas` and replace the hand-written interface with `export type CardFilters = z.infer<typeof cardFiltersSchema>`. The inferred type is structurally identical, so existing imports are unaffected. Provide `export const EMPTY_CARD_FILTERS: CardFilters` (all arrays `[]`, ranges `{min:null,max:null}`, flags `null`, `search:""`, `searchScope: DEFAULT_SEARCH_SCOPE`) and use it everywhere a blank filter is constructed.

### I.3 Honor the new fields in `filters.ts`

- `filterCards` (line ~302): for each multi-select, after the existing include check add an exclude check per the comment semantics above. Add `&& matchesFlag(filters.isStandard, isStandardPrinting(printing))`.
- `getAvailableFilters` (line ~425, interface ~356): add `hasNonStandard: boolean` (= `printings.some((p) => !isStandardPrinting(p))`) so the UI can gate the toggle; mirror `hasSigned`.
- `FilterCounts` (~506) + `computeFilterCounts` (~614): add `flags.standard` and a `FLAG_DEFS` entry `{ key: "standard", filterField: "isStandard" }`. When faceting a dimension, omit both its include and its exclude (consistent with the current "ignore this dimension" rule). Other dimensions' excludes are applied.
- Update `filters.test.ts` for negation (each dim) and `isStandard` (true/false/null), plus exclude-overrides-include interaction.

## II. Database + API expansion

### II.1 Migration

- New migration (next sequential number) adding `ALTER TABLE lists ADD COLUMN rules jsonb NOT NULL DEFAULT '[]'::jsonb;` plus `CHECK ((jsonb_array_length(rules) = 0) OR (intent IN ('wish','trade')))`. Shape validation (and the trade-list one-rule cap) is app-level Zod (the DB only gates intent).
- Register it in `apps/api/src/db/migrations/index.ts` (barrel), without which it is silently skipped.
- Ask the user before running `bun db:migrate` (shared DB). After applying, regenerate `docs/schema.sql` via `bun db:schema` and commit it in the same change.

### II.2 Rule types + Zod (`packages/shared`)

`packages/shared/src/types/list-rule.ts`:

```ts
export type RuleQuantity =
  | { mode: "fixed"; n: number } // n >= 0
  | { mode: "playset"; multiplier: number }; // multiplier >= 1

export interface WishRule {
  kind: "wish";
  filter: CardFilters;
  quantity: RuleQuantity; // desired per matched card/printing
  excludeIds: string[]; // card_ids (list.kind=card) or printing_ids (list.kind=printing)
  netOwned?: boolean; // subtract the owner's owned copies; emit only the positive shortfall
}
export interface TradeRule {
  kind: "trade";
  filter: CardFilters;
  collectionIds: string[] | null; // null = all owned collections; else restrict source
  keepPerCard: RuleQuantity; // keep N per card; trade surplus. {mode:"fixed",n:0} = trade all
  excludeCopyIds: string[];
}
export type ListRule = WishRule | TradeRule;
```

Add `listRuleSchema = z.discriminatedUnion("kind", [wishRuleSchema, tradeRuleSchema])` to `packages/shared/src/contracts/lists.ts` (reusing `cardFiltersSchema`), then wrap it as `listRulesSchema = z.array(listRuleSchema).max(MAX_LIST_RULES)` with `MAX_LIST_RULES = 10`. The route layer must reject any rule whose `kind !== list.intent`, and reject a `ruleCombine` mode that does not belong to the list intent (Amendment 2).

### II.3 Evaluator (`packages/shared`)

`packages/shared/src/list-rule-eval.ts`:

```ts
export interface OwnedCopyRow {
  copyId: string;
  printingId: string;
  cardId: string;
  collectionId: string;
  reserved: boolean;
}
export interface RuleEvalContext {
  catalog: Printing[];
  ownedCopies?: OwnedCopyRow[];
}
export interface VirtualEntry {
  kind: "card" | "printing" | "copy";
  cardId?: string;
  printingId?: string;
  copyId?: string;
  quantity: number;
  reserved?: boolean; // reserved annotation on copy entries
}
export function evaluateListRule(
  rule: ListRule,
  listKind: "card" | "printing" | "copy",
  ctx: RuleEvalContext,
): VirtualEntry[];
```

- `evaluateListRules(rules, listKind, ctx)` maps `evaluateListRule` over the array and concatenates. The union/dedup across rules happens in `expandList`.
- `resolveQuantity(q, card)`: `fixed → max(0, q.n)`; `playset → getPlaysetSize(card.type, card.keywords) * q.multiplier`.
- **Wish, listKind="printing":** `matched = filterCards(ctx.catalog, rule.filter)`. For each `p` with `p.id ∉ excludeIds`, emit `{kind:"printing", printingId:p.id, quantity: resolveQuantity(rule.quantity, p.card)}`.
- **Wish, listKind="card":** group `matched` by `cardId`. For each `cardId ∉ excludeIds`, emit `{kind:"card", cardId, quantity: resolveQuantity(rule.quantity, card)}`.
- **Wish `netOwned`:** when set, subtract the owner's owned count from each emitted quantity (per `printingId` for printing-kind, per `cardId` for card-kind) and drop entries whose remaining `quantity <= 0`. Copies reserved by a live (outgoing) trade are excluded from the owned count. They're about to leave the collection, so they must not suppress the shortfall (incoming copies aren't in the owner's collection yet, so they never reach the set). Falls back to the full target when `ctx.ownedCopies` is absent.
- **Trade (listKind="copy"):** require `ownedCopies`. `passing = new Set(filterCards(ctx.catalog, rule.filter).map(p => p.id))`. Candidates = copies where `(rule.collectionIds === null || collectionIds.includes(c.collectionId))` and `passing.has(c.printingId)` and `c.copyId ∉ excludeCopyIds`. Group by `cardId`. `keepN = resolveQuantity(rule.keepPerCard, card)`. Sort each group keep-first by the keep-priority ladder (standard-vs-special, then rarity / finish / art variant / signed against the reference orders, then `canonicalRank`, then copy id; Amendment 2), and emit `{kind:"copy", copyId, quantity:1, reserved}` for copies after the first `keepN`. With several rules the per-rule splits combine per the trade mode (`protect` default, `count-sum`, `count-max`; Amendment 2). Reserved copies stay in the pool and are emitted with `reserved:true`. Consumers filter/annotate them (matching excludes reserved; display shows status), mirroring today's `copyEntryQuery` behavior.
- Tests `list-rule-eval.test.ts`: each of UC1–UC4 plus empty results, exclusions, playset-1 vs playset-3 cards, keep=0, reserved handling, collection scoping.

### II.4 `expandList` (union authority, `packages/shared`)

```ts
export type EntrySource = "manual" | "rule" | "both";
export interface ExpandedEntry extends VirtualEntry {
  id: string | null;
  source: EntrySource; /* + trade prefs */
}
export function expandList(
  list: {
    intent: ListIntent;
    kind: ListKind;
    rules: ListRule[];
    defaultPricePref;
    defaultPriceAbsoluteCents;
    defaultTradeType;
  },
  manualEntries: ManualEntryRow[],
  ruleEntries: VirtualEntry[],
): ExpandedEntry[];
```

- Dedup key: copy lists by `copyId`; card/printing lists by `cardId`/`printingId`.
- Conflict: card/printing quantity = `manualQuantity + ruleContribution`, where `ruleContribution` arrives pre-combined per key from `evaluateListRules` (Amendment 2); `source = "both"`. The rule part is reported separately as `ruleQuantity` so the manual part (`quantity − ruleQuantity`) stays editable. Copies: union; manual wins (keeps its `id` + per-entry trade override); `source = "both"` if also rule-produced.
- Manual entries keep their real `list_entries.id` and own trade prefs. Rule-only entries get `id: null`, `source:"rule"`, and inherit the list's trade defaults.
- Tests for every conflict/merge case.

### II.5 API contract changes (`packages/shared/src/contracts/lists.ts`)

- `createListSchema` + `updateListSchema`: add `rules: listRulesSchema.optional()` (defaults to `[]`). `listRulesSchema` itself caps the array at `MAX_LIST_RULES` (10). Each rule is a full-catalog `filterCards` pass at read time (incl. the anonymous public-share path), so the count is bounded. Further refinements: reject when any `rule.kind !== ruleKindForListKind(kind)`, and when `ruleCombine` doesn't belong to the kind (amendments 2 and 4). The "no rules on organize" and "at most one trade rule" refinements the original draft called for are both gone (amendments 2 and 4).
- `listResponseSchema`: keep `entryCount` as the manual count and add `hasRule: boolean` (true when the list carries any rules). (List summaries are NOT expanded, see II.7.)
- `listDetailResponseSchema`: the `list` object gains `rules: ListRule[]` (so the editor can load them). `entries` are the expanded set.
- `listEntryDetailResponseSchema`: `id` becomes nullable. Add `source: "manual" | "rule" | "both"`. Rule entries (`id: null`) are not individually editable/deletable. The UI offers only "exclude" on them.

### II.6 Repository + service wiring (`apps/api`)

- **Server catalog provider:** add a repo method to assemble the full `Printing[]` server-side (reuse the assembly already feeding the public catalog route, `assembleCatalogPrintings` in `apps/api/src/services/catalog-assembly.ts`). The assembly is memoized process-wide and content-addressed by `createCatalogPrintingsCache`: each read first runs a cheap `catalogContentVersion()` probe (`count(*)` + `max(updated_at)` over the tables that feed the `Printing[]`, ~5ms), reuses the cached catalog while the token is unchanged, and reassembles the instant an admin edit rolls it. This keeps reads both cheap (no rebuild per request) and always fresh (no staleness window), which matters because expansion runs inline on every list read, including the uncached anonymous public-share path. (Earlier drafts said "cache per-request." A single process-wide content-addressed memo is strictly better: same freshness, far less work.)
- **Owner copies:** add `copiesRepo.ownedRowsForUser(userId): OwnedCopyRow[]` joining `copies → collections → cards` and the reservation set (`cardTradeCopies`, as `copyEntryQuery` does). New repo method (none exists today).
- **`lists.entriesWithDetails()` (lists.ts:390) and `lists.entriesWithDetailsAnon()` (line 399):** before enrichment, if `list.rules` is non-empty, call `evaluateListRules` (owner = the list's `user_id`, even in the Anon path) then `expandList`, and enrich the resulting `ExpandedEntry[]` through the existing `cardEntryQuery` / `printingEntryQuery` / `copyEntryQuery` joins (now keyed off the expanded ids). Carry `source` + nullable `id` through. These two methods cover GET /lists/{id}, public share (`public/lists.ts`), group shared list (`friend-groups.ts:702`), bundle list (`public/user-share.ts:63`), and all three share-image routes. No other detail path needs changes.

### II.7 Read-path checklist (must all be handled)

1. `entriesWithDetails` / `entriesWithDetailsAnon` → expand (II.6). ✅ covers detail + shares + images + bundle.
2. **Trade matcher** `friend-group-matches.ts` (`othersHaveYourWants` :107, `othersWantYourHaves` :117, `recentIncomingMatchesForFeed` :128) → rework (§III). ⚠ highest risk.
3. **Count surfaces** `lists.listForUser` (:143), `userShares.listsForOwner` (:88), `friendGroups.listShareableForUserInGroup` (:626): do not expand. Return manual `entryCount` + `hasRule`. The UI shows a "rule" indicator. (Avoids expanding every list on dashboards.)

## III. Matcher rework (highest risk)

The matcher must see rule-expanded entries. Move the three `friend-group-matches.ts` methods from one big SQL join to app-level expansion:

1. Load the visible shared lists in the group (the existing `friendGroupListShares → lists` visibility query), for both the viewer's wish lists and counterparties' trade lists (and the mirror for `othersWantYourHaves`).
2. For each such list, load manual entries + its `rules`, then `evaluateListRules` + `expandList`. Load the catalog once. Load each trade-list owner's `ownedRowsForUser` (and each `netOwned` wish-list owner's, since their demand nets against their inventory).
3. Match in TypeScript, preserving every current invariant: group/share visibility, exclusion of copies `reserved` by live trades, trade-pref coalescing (`entry override ?? list default`), copy→printing→card resolution, and the existing dedup for the activity feed.
4. Output the same `MatchRow[]` / `IncomingMatchFeedRow[]` shapes so routes (`friend-groups.ts:687/743`) and the web hooks are unchanged.

Tests: port the existing matcher integration tests unchanged (they must still pass), then add cases where a counterparty's trade list and/or the viewer's wish list is dynamic, including reserved-copy exclusion and collection-scoped trade rules.

## IV. Web filter language (negation + standard in the card browser)

- `apps/web/src/lib/search-schemas.ts`: add `standard: boolFlag()` and an exclude param per multi-select (e.g. `setsEx`, `languagesEx`, `raritiesEx`, `typesEx`, `superTypesEx`, `domainsEx`, `artVariantsEx`, `finishesEx`, `markersEx`, `channelsEx`, `customTagsEx`) using `stringArray()`. Map them in `toFilterState`/`useFilterValues` to the new `CardFilters` fields. Update `EMPTY_CARD_FILTERS` usage and any default-filters/test factory.
- Filter UI (`apps/web/src/components/cards/…` left pane / facets): add an exclude affordance to each multi-select facet (e.g. include/exclude toggle per option) and a tri-state "Standard only / Non-standard / any" control gated on `availableFilters.hasNonStandard`. Wire counts via `filterCounts.flags.standard`.

## V. Rule-editor UI (full)

- **Where:** `apps/web/src/components/list/list-page.tsx` + route `apps/web/src/routes/_app/_authenticated/collections/lists/$listId.tsx`. Add a "Dynamic rule" panel: enable/disable, filter editor, quantity/keep control, collection scope (trade only), exclusions manager, live preview, save.
- **Filter editor:** extract the card-browser facet list into a controlled `<RuleFilterEditor value={CardFilters} onChange availableFilters />` (same facet components as `BrowserLeftPane`, but bound to local state instead of URL search params). The negation + standard controls from §IV appear here too.
- **Quantity / keep:** radio `Fixed (number)` vs `Playset (×N)` → `RuleQuantity`. Trade lists label it "Keep per card"; `0` = trade all.
- **Collection scope (trade):** multiselect of the user's collections; default "all" (`null`).
- **Exclusions:** an "exclude" action on each previewed card/printing/copy appends to `excludeIds`/`excludeCopyIds`; show removable chips of current exclusions.
- **Live preview:** run `evaluateListRule` client-side over the loaded catalog (`useCatalog`) + the user's copies (collection store) and render the would-be entries instantly, before save.
- **Persistence:** PATCH `/lists/{id}` with `rules` (and allow on create). On load, the detail response carries `list.rules`.
- **Editor state** is a Zustand store → requires `*.test.ts` with `createStoreResetter` (repo convention). Rule entries (`source:"rule"`, `id:null`) render read-only with only an "exclude" affordance. Manual entries keep edit/remove.

## VI. Cross-cutting

- **Tests:** unit (`isStandardPrinting`, `filterCards` negation/standard, `evaluateListRule` UC1–UC4 + edges, `expandList` merges, editor store); API integration (expansion in both repo methods, public share, reworked matcher incl. ported existing tests); a regression test proving a dynamic trade list participates in matching (fails before, passes after). Integration tests run from main after merge, not in the worktree.
- **Changelog:** add `feat(Collection):` Highlights entries for dynamic wish lists and dynamic trade lists.
- **Lint/build:** `bun lint`; verify with `turbo run build --filter=api` + `bun run --cwd apps/web typecheck` (tsgo) per the team's local typecheck note.

## Out of scope / deferred

- **General boolean expression trees** (nested AND/OR/NOT): per-dimension include/exclude + `isStandard`, combined with several rules per list (each rule's matches union), suffice. (Multiple rules per list shipped in v1, see the amendment above; stacking is union-only, with no cross-rule boolean nesting.)
- **Condition / acquisition-cost predicates:** blocked on the per-copy metadata deferred in ADR-005. They become `CardFilters` dimensions when those columns land.
- **Materialized/cached rule output:** revisit only at the ADR-009 dataset thresholds.
- **Expanded counts on list summaries:** summaries show manual count + `hasRule`. Full counts appear on detail.

## More Information

- Supersedes the "Dynamic rules" paragraphs of ADR-005 (manual lists, virtual deck-requirement source, and union/merge semantics there are unchanged).
- Builds on ADR-009 (`CardFilters`, `filterCards`) and ADR-018 (share bundle). The matching requirement comes from ADR-013 / 017 / 019.
- Touchpoints: `packages/shared/src/types/search.ts`, `packages/shared/src/filters.ts`, `packages/shared/src/standard.ts` (new), `packages/shared/src/list-rule-eval.ts` (new), `packages/shared/src/types/list-rule.ts` (new), `packages/shared/src/contracts/lists.ts`, `packages/shared/src/playset.ts`, `packages/shared/src/well-known.ts`; `apps/api/src/repositories/lists.ts`, `apps/api/src/repositories/copies.ts`, `apps/api/src/repositories/canonical-printings.ts`, `apps/api/src/repositories/friend-group-matches.ts`, `apps/api/src/routes/authenticated/lists.ts`; `apps/web/src/lib/search-schemas.ts`, `apps/web/src/components/list/list-page.tsx`, `apps/web/src/components/cards/` (filter facets); the `lists` table in `docs/schema.sql`.
