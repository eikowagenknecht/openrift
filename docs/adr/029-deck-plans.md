---
status: proposed
date: 2026-06-16
---

# ADR-029: Deck Plans (Strategy, Mulligan, Battlefields, Sideboard)

## Context and Problem Statement

A serious player doesn't just build a 40-card deck and a sideboard, they prepare a written plan for piloting it: the general gameplan, what to keep in the opening hand, which battlefield to take in each situation, and how to sideboard against specific opponents. Today an OpenRift deck has the raw zones for this (a `main` zone, a `sideboard` zone with max 8 cards / 3 copies, a `battlefield` zone) but no place to record _how to use them_. Players keep these notes in spreadsheets or external tools like [theMetaLab's MetaForge sideboard plans](https://www.themetalab.gg/metaforge/sideboard-plans).

We want to attach an **optional** deck plan to a deck, edited in the deck builder and rendered read-only on the public shared deck page. It must be purely additive: a deck with no plan looks and behaves exactly as it does today.

A deck plan has two layers:

- **Deck plan** (one per deck): general strategy notes, mulligan priority (with an optional going-first / going-second split), and a battlefield choice per scenario (Game 1, going first, going second).
- **Matchup plans** (zero or more per deck): the opponent (an optional linked card of any type plus a free-text label), matchup notes, and the sideboard swaps (cards in / out).

The decision is how to model the matchup (the app has no archetype taxonomy), how to constrain the in/out swaps and the battlefield choices, how strict validation is, and where the plan lives and is seen.

## Decision Drivers

- **Optional and additive.** A plan must never get in the way of building a deck. A deck without a plan is unchanged.
- **Reuse the existing zones.** The deck already has `main`, `sideboard`, and `battlefield` zones in `deck_cards`. A swap moves a copy from maindeck to bench and back; a battlefield choice picks one card from the battlefield zone. Plans reference the deck's own cards rather than inventing a parallel store.
- **Catalog integration is the value-add** (same principle as ADR-014). Every card named in a plan (swapped cards, the opponent card, the chosen battlefields) links to its catalog page and can show a thumbnail or ownership overlay.
- **Lightweight taxonomy.** The app deliberately has no archetype/matchup taxonomy (ADR-014 deferred it). A matchup is identified by an optional catalog card (any type) plus a free-text label, not by a new archetype table. The card is what gives catalog integration; the label covers everything a card can't (archetypes, domains, "whatever-decks").
- **Public + shareable, read-only.** The plan renders on the existing unauthenticated `decks/share/{token}` page, consistent with how shared decks already work. Crawlable, no auth.
- **Soft validation.** Sideboarding is disciplined (out of maindeck, in from bench) and a battlefield should come from the deck, but planners draft asymmetric or aspirational notes on purpose. Guide correctness with warnings, never block a save.

## Considered Options

For the **data model**:

- **Relational satellite tables.** A 1:1 `deck_plans` row for the deck-level fields, plus a `deck_matchup_plans` table (one row per matchup) and a `deck_matchup_swaps` table (the in/out card rows), all cascading off `decks`. Card references are real FKs to `cards`.
- **JSONB column on `decks`.** Store the whole plan structure as `plan jsonb`, following the `format_config` precedent.
- **Reuse `deck_cards` with plan-scoped zones.** Encode swaps and battlefield picks as extra `deck_cards` rows under synthetic zones.

For **opponent identity**: free-text label only / pick a **Legend** card + free-text subtitle / an optional card of **any** type plus a free-text label (at least one required) / link to another OpenRift deck.

For **swap constraints**: disciplined (out from maindeck, in from sideboard) / any card / deck cards only.

For **mulligan priority**: free text (optional first/second split) / a ranked card list / both.

For **battlefields**: one card per scenario from the deck's battlefield zone / free text per scenario / a single free-text note.

## Decision Outcome

Chosen data model: **relational satellite tables** (`deck_plans` + `deck_matchup_plans` + `deck_matchup_swaps`), because the card-bearing parts (swaps, battlefields, the opponent card) should join cleanly to the catalog and to the deck's own `deck_cards`, and the public page renders them as a structured list. JSONB would make every render a parse and forfeit card FK integrity; overloading `deck_cards` zones would corrupt deck-size math and the zone reference table.

Chosen scope and rules, from the product decisions:

- **Deck-level fields live on a 1:1 `deck_plans` row**, created lazily the first time a plan is saved:
  - **General strategy:** free text.
  - **Mulligan priority:** free text, with an optional split so going first and going second can carry different notes. When the user does not split, one shared note applies.
  - **Battlefields:** one battlefield per scenario (Game 1, going first, going second), each chosen from the deck's `battlefield` zone. Each scenario is independent and optional.
- **Matchup plans:** zero or more per deck. Each is identified by an **optional catalog card of any type** plus a **free-text label**, with at least one of the two required. A linked card supplies the icon and a catalog link and is the primary name (a Legend like "Diana", a single card like "Aurora", a domain signpost); the label carries archetypes ("Aggro", "Control"), domains, or a build name ("Scorn of the Moon"), and stands alone when no card fits. No archetype table. Matchups are displayed in a user-controllable order; two may share an opponent (no uniqueness constraint).
- **Matchup notes:** one free-text note per matchup.
- **Disciplined swaps:** the `out` picker offers cards in the deck's maindeck zones; the `in` picker offers cards in the `sideboard` zone. A swap is a card, a quantity, and a direction.
- **Soft validation, never blocking.** Warn when a matchup's in-count differs from its out-count, when an `in` quantity exceeds the available sideboard copies, when an `out` quantity exceeds the maindeck copies, or when a chosen battlefield is not in the deck's battlefield zone. The user can still save.
- **Visible to the owner in the deck builder and read-only on the public shared deck page.** Not embedded in deck codes (see Will Not Be Built).

### Consequences

- Good, because the feature is invisible until used. No `deck_plans` row and no matchups means the editor shows an empty "Plan" tab and the public page renders nothing extra.
- Good, because the card-bearing fields are real FKs to `cards`, so every swapped card, the linked opponent card, and each chosen battlefield links to the catalog and reuses the existing thumbnail, ownership, and card-detail wiring.
- Good, because plans are decoupled from deck-size and format validation. They reference cards but do not change `deck_cards`, so legality checks, deck math, and the existing `replaceCards` flow stay untouched.
- Good, because validation is computed at read time against the live deck. If the deck changes (a card leaves the sideboard, a battlefield is swapped out), the affected field simply surfaces a warning instead of needing a migration or cascade fix-up.
- Bad, because a plan can drift out of sync with the deck (you remove the bench card a matchup brings in, or the battlefield a scenario names). Accepted: the soft-validation warning is the intended signal, not a bug.
- Bad, because a free-text label is coarser than a real archetype taxonomy: it isn't normalized, so "Aggro" and "aggro" are distinct and labels can't be aggregated across decks. The optional card link absorbs the cases that map to a card, and matching ADR-014 we choose not to build archetypes yet.
- Bad, because three satellite tables add CRUD surface (repo, routes, mapper, editor UI). Mitigated by an atomic replace-style save mirroring the existing `replaceCards` pattern.

## Design Decisions

### Schema sketch

```sql
-- Deck-level plan, 1:1 with a deck, created lazily on first save.
create table deck_plans (
  id                     uuid primary key default uuidv7(),
  deck_id                uuid not null unique references decks(id) on delete cascade,
  general_strategy       text not null default '',
  mulligan_general       text not null default '',   -- used when not split by play/draw
  mulligan_first         text not null default '',    -- going first
  mulligan_second        text not null default '',    -- going second
  battlefield_g1_card_id     uuid references cards(id),   -- one battlefield per scenario, nullable
  battlefield_first_card_id  uuid references cards(id),
  battlefield_second_card_id uuid references cards(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- One matchup plan per opponent within a deck.
create table deck_matchup_plans (
  id                  uuid primary key default uuidv7(),
  deck_id             uuid not null references decks(id) on delete cascade,
  opponent_card_id    uuid references cards(id) on delete set null,  -- any type; null for a label-only matchup
  opponent_label      text not null default '',   -- archetype / domain / build name, e.g. "Aggro"
  notes               text not null default '',    -- per-matchup note
  sort_order          smallint not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- A matchup must be identifiable by at least one of card / label.
  check (opponent_card_id is not null or opponent_label <> '')
);

-- The in / out swaps for a matchup.
create table deck_matchup_swaps (
  id         uuid primary key default uuidv7(),
  plan_id    uuid not null references deck_matchup_plans(id) on delete cascade,
  card_id    uuid not null references cards(id),
  direction  text not null check (direction in ('in', 'out')),
  quantity   integer not null check (quantity > 0),
  unique (plan_id, card_id, direction)
);

create index deck_matchup_plans_deck_id_idx on deck_matchup_plans (deck_id);
create index deck_matchup_swaps_plan_id_idx  on deck_matchup_swaps (plan_id);
```

Notes:

- Matchups hang off `deck_id`, not `deck_plans.id`, so a matchup can be created without first materialising a `deck_plans` row. The "deck plan" in the UI is the composition of the optional `deck_plans` row and the deck's matchup rows; both are children of the deck.
- `opponent_card_id` is nullable and `on delete set null` (any card type, not just Legend): deleting the linked card leaves a label-only matchup rather than cascading the whole plan away. `opponent_label` is `NOT NULL DEFAULT ''`; the `check` keeps a matchup from being nameless. There is no uniqueness constraint — two matchups may share an opponent, ordered by `sort_order`. (The original migration 158 shipped a required `opponent_legend_card_id` + `subtitle` with a `(deck, legend, subtitle)` unique; migration 160 renamed/relaxed it to this shape.)
- Mulligan is three free-text columns. When the plan is not split, only `mulligan_general` is populated; when split, `mulligan_first` / `mulligan_second` carry the play/draw difference. The UI toggles which columns are shown and saved.
- Battlefields are three nullable single-card FKs, one per scenario, because in Riftbound a game uses one battlefield. The discipline (must be a battlefield the deck actually runs) is a soft, read-time check against the `battlefield` zone, not a DB constraint.
- Swaps store only `card_id` + `quantity`; the printing shown is resolved from the deck's own `deck_cards.preferred_printing_id` for that card at render time.
- New migration registered in `apps/api/src/db/migrations/index.ts`; regenerate `docs/schema.sql` in the same commit.

### Repository and API

- New repo `apps/api/src/repositories/deck-plans.ts`:
  - `getForDeck(deckId)` returns the `deck_plans` row (or null) plus the deck's matchups with nested swaps, ordered by `sort_order`.
  - `replaceForDeck(deckId, plan)` upserts the `deck_plans` row and atomically replaces matchups and swaps in one transaction, mirroring `decks.replaceCards`. Touches `decks.updated_at`.
- Authenticated routes in `apps/api/src/routes/authenticated/decks.ts`:
  - `GET /{id}/plan` for the owner.
  - `PUT /{id}/plan` to replace the whole plan (the editor saves it as a unit).
- Public read: extend `decks.findByShareToken` and the `toPublicDeck` mapper (`apps/api/src/utils/mappers.ts`) to include the plan, so the existing `decks/share/{token}` payload carries it with no new route.
- Server-side validation at the API boundary: referenced cards exist, each matchup has a card or a label (or both), the battlefield cards are battlefields, quantities are positive. The opponent card may be **any** type — no Legend constraint. The balance and availability checks (in vs out counts, copies available, battlefield-in-deck) are advisory and computed client-side against the loaded deck.

### Editor UI

- A new "Plan" tab in the deck editor (`apps/web/src/components/deck/`, e.g. `deck-plan-editor.tsx`).
- Deck-level section: a general-strategy text area; a mulligan field with a "different plan going first vs second" toggle that splits it into two; and three battlefield pickers (Game 1, going first, going second), each a select over the deck's `battlefield` zone cards. The battlefield pickers are disabled with a hint when the zone is empty.
- Matchups section: add / remove / reorder matchups. Each has an opponent-card picker (catalog search, any card type) as the prominent identity, a free-text label field beside it (at least one of the two is needed), a notes field, and two swap columns. The `out` picker is constrained to the deck's maindeck cards, the `in` picker to its sideboard cards.
- Inline soft warnings (unbalanced swaps, over-available copies, battlefield not in deck). Save is the existing atomic replace.

### Public shared deck page

- Read-only render. A "Deck Plan" block shows the strategy, mulligan (one note, or first/second), and the chosen battlefields per scenario. A "Matchups" list mirrors the reference: each matchup shows the linked card's thumbnail and name when one is set (with the label as a secondary line), or the label alone otherwise, an OUT column and an IN column of swapped cards (each linking to the catalog), and the notes. Renders nothing when the deck has no plan.

### Clone behavior

- The in-app clone paths (`decks.cloneDeck`, `cloneFromShareToken`) copy the plan alongside the deck's cards, since the plan rows are owned by the deck. (Minor; flag for confirmation during implementation.)

## Will Not Be Built (v1)

- **Plans in deck codes / text export.** Deck codes stay compact card lists; embedding prose-laden plans bloats them. Plans travel only via in-app clone and the public page.
- **Archetype taxonomy.** No `archetypes` table; opponents are an optional card plus a free-text label, consistent with ADR-014.
- **Ranked mulligan card lists.** Mulligan priority is free text in v1, not a structured card ranking.
- **Multiple battlefields per scenario.** One battlefield per scenario; no ordered fallback list.
- **Server-enforced legality.** Swap balance, copy availability, and battlefield-in-deck are advisory only.

## Deferred / Out of Scope

- **Structured mulligan priority** (a ranked, disciplined card list with thumbnails). Free text first; revisit if players want it.
- **Hard-enforced swap balance** (block on in != out). Rejected in favour of warnings; revisit if sloppy plans become a problem.
- **Versioned / dated plans.** The reference titles plans by date ("Diana – 13 June 2026"). We attach a single living plan to the deck instead; history is deferred.
- **Linking a matchup to a real OpenRift deck** as the opponent. Richer but couples plans to deck lifecycle; not in v1.

## Confirmation

- Migration applied; `docs/schema.sql` regenerated and committed together; migration registered in the barrel.
- Repo + route tests: replace-then-read round-trips a deck's plan (deck-level fields, matchups, swaps); a non-Legend opponent card and a label-only matchup both persist; the identity `check` rejects a matchup with neither a card nor a label; deleting a deck cascades the `deck_plans` row, its matchups, and their swaps.
- Web unit tests for the validation helper (balanced/unbalanced swaps, over-available copies, battlefield-in-deck, empty) and for the editor store, per the project's test requirements.
- Manual: a deck with a plan renders read-only on its public share page; a deck without one renders unchanged.

## More Information

- Reference UI: theMetaLab MetaForge sideboard plans, <https://www.themetalab.gg/metaforge/sideboard-plans>.
- Related: ADR-014 (Tournament Decks Archive) for the "reuse the `decks` infrastructure, defer archetype taxonomy" precedent, and the `sideboard` zone constraints in `packages/shared/src/deck-rules.ts` (max 8 cards, 3 copies).
