---
status: accepted
date: 2026-05-27
---

# ADR-017: Trade Preferences on Shared Lists

## Context and Problem Statement

ADR-013 introduced friend groups with opt-in list sharing and a live match view. The match view today says only "Alice has this card you want." It says nothing about how Alice wants to be compensated, what currency she works in, or whether she's only interested in card-for-card swaps. Two users see a match, open Discord, and the very first message is always "what do you want for it?" — a question the data already implicitly knows the shape of (price-watching preference, currency, whether cash is even on the table) and that we make people re-type for every match.

We want to attach trading intent to lists so the match view shows enough to skip that round-trip: a stated price reference (e.g. "Cardmarket lowest", "TCGplayer lowest", "Cardtrader Zero", or an absolute amount) and a stated trade-type appetite (cards / money / both). Both sides — the wisher and the trader — carry their own preferences so each match row reads "Alice will pay TCG lowest, accepts both" vs "You want CM lowest, cards only" and the negotiation starts with information already in the same place as the card.

**Out of scope for this ADR:** any kind of automatic price calculation against our stored marketplace prices. Our pricing snapshot conflates languages (e.g. EN and ZH lumped under the same Cardmarket product row), so an "actual" number derived from `marketplace_product_prices` would be misleading. The user-stated preference is an intent label, not a number we compute. Where a label is naturally clickable ("CM lowest"), it links out to the marketplace product page so the user looks up the real number themselves.

## Decision Drivers

- Trade negotiation today restarts from zero every match; we want to compress that first round-trip.
- Matching itself stays simple — current card-identity match logic (ADR-013) is good enough; preferences are display-only.
- Our stored marketplace prices are not language-accurate; the feature must not pretend they are.
- Most users will set defaults once per list and rarely deviate; the system needs to honor the common case without forcing per-row data entry.
- Some users _will_ need to override per card (one foil priced individually, the rest by CM lowest); ignoring that case would make the defaults a lie.

## Considered Options

- **Match-side scoring or filtering** — drop incompatible matches (e.g. money-only vs cards-only), or rank by compatibility. Rejected: matching logic complexity goes up, and "incompatibility" is rarely absolute (two people who said "cards" might still trade for cash if the right offer appears).
- **Per-list preferences only** — one price/trade-type per list, no per-entry overrides. Rejected: real lists have outliers (the foil, the chase card) priced differently from the bulk.
- **Per-entry preferences only** — every entry carries its own preference, no list-level default. Rejected: forces N inputs for the common case where one default covers everything.
- **List default + per-entry override** (chosen).
- **Per-group-share overrides** — same list shows different terms to different groups. Rejected for v1: speculative complexity. The user can mirror a list and share differently if needed.
- **Computed prices from `marketplace_product_prices`** — show users a resolved EUR/USD number on each match row. Rejected: language-conflated prices would mislead; users would trust the number and skip the marketplace check.

## Decision Outcome

Chosen option: **List default + per-entry override, both sides carry preferences, matching is unchanged and the values are display-only.**

The match view becomes informational. Two new fact bundles flow through the match query for each row — the wish side's preference and the trade side's preference — and the UI renders them next to the card. Marketplace presets render as clickable links to the marketplace product page (for printing/copy-grain entries) or a marketplace search URL (for any-printing wishes). Absolute prices render as plain text with currency. Unset preferences render as nothing — the row carries no signal, just the card, same as today.

### Consequences

- Good — match rows carry enough context to start a negotiation. The "what do you want for it?" round-trip dies.
- Good — list defaults cover ~all of a typical list; per-entry override exists for the outliers without forcing it.
- Good — matching logic is untouched, so the perf surface and SQL stay identical to ADR-013.
- Good — currency stays at list level only. A list is one transaction context; one currency is correct for nearly all cases.
- Bad — adds four columns to `lists`, three to `list_entries`. Mitigated by all being nullable with a clear "no preference" semantics.
- Bad — preference labels can drift from on-marketplace reality (CM raises prices, user's "CM lowest" intent unchanged). Acceptable: the label is the intent, not the number; the linked page is the source of truth.
- Bad — currency mismatches (one side EUR, other USD) are user-visible but not auto-resolved. Acceptable for v1; if it becomes a real friction we can add a hover-time conversion later.

## Design Decisions

### Scope: wish and trade only

Preferences are added only to `intent IN ('wish', 'trade')` lists. `organize` lists are not in the match view (ADR-013) and don't represent a trading position; preferences there would be meaningless. A CHECK constraint blocks non-NULL preference columns on `organize` lists.

### Price preference enum (`price_pref`)

Four explicit values plus NULL (the default, meaning "no preference stated, hash out personally"):

- `cm_lowest` — Cardmarket lowest. Rendered as a link to the matched printing's Cardmarket product page.
- `tcg_lowest` — TCGplayer lowest. Rendered as a link to the TCGplayer product page.
- `ct_zero` — Cardtrader Zero (cheapest among Zero-eligible sellers). Rendered as a link to the Cardtrader card page.
- `absolute` — A fixed number in the list's currency. Companion column `price_absolute_cents` (positive integer) is required iff `price_pref = 'absolute'`.

A CHECK constraint enforces `(price_pref = 'absolute') = (price_absolute_cents IS NOT NULL)`.

The semantic of "the price" is intentionally one-field: a wish saying "TCG lowest" means "I'll pay TCG lowest"; a trade saying "TCG lowest" means "I want TCG lowest". No `min`/`max`, no range. If two users state the same reference, the implication is "we agree on the reference; the actual number is whatever the marketplace says today."

### Trade-type enum (`trade_type`)

Three explicit values plus NULL (default, "no preference stated"):

- `cards` — On the trade side: "I want cards in return." On the wish side: "I'll pay in cards."
- `money` — On the trade side: "I want cash." On the wish side: "I'll pay cash."
- `both` — Open to either.

The match query does not filter on this. It is a hint, not a constraint. Two users marked `cards` see each other; one marked `money` and one marked `cards` also see each other — they just see each other's stated preferences and can decide whether to engage.

### Currency (`currency`) — list-level only

`currency IN ('EUR', 'USD')`, nullable. Only meaningful when at least one entry has `price_pref = 'absolute'`; for marketplace presets the currency is implied by the marketplace and the column is ignored. A CHECK constraint enforces that if any list-level or entry-level `price_pref = 'absolute'`, the list's `currency` is set.

No per-entry currency override. A list is treated as one transaction context.

The default currency for a new list is read from the user's preferences (new field `user_preferences.data.defaultCurrency`, falls back to `'EUR'` when unset). Users with neither a preference nor a list setting get EUR.

### Per-list default + per-entry override

- `lists.default_price_pref`, `lists.default_price_absolute_cents`, `lists.default_trade_type` carry the list's defaults. All NULL = "no defaults; nothing inherits."
- `list_entries.price_pref`, `list_entries.price_absolute_cents`, `list_entries.trade_type` carry per-entry overrides. NULL on an entry means "use the list default" (which may itself be NULL → no preference).

The effective preference at any row is `COALESCE(entry.x, list.default_x)`. Repository read paths resolve this at the query level so consumers see a single resolved value.

### Match view is unchanged; row payload grows

The query in `friend-group-matches.ts` (`othersHaveYourWants` / `othersWantYourHaves`) stays as-is at the joining level. What changes is the SELECT — we add the wish-side list default + entry override, and the trade-side list default + entry override, both resolved via COALESCE. The match row type gains two bundles (`wishPref` and `tradePref`), each containing `pricePref`, `priceAbsoluteCents`, `tradeType`, and `currency` (currency comes from the respective list).

No new joins beyond what's already there: the existing query already joins both lists. We just project extra columns.

### Match-row link behavior

Marketplace preset labels link out using `apps/web/src/lib/marketplace-meta.ts`. For each side:

- **Trade side** is always `kind='copy'` → a specific printing → the marketplace product URL resolves cleanly via `marketplace_product_variants`.
- **Wish side** with `kind='printing'` → same; printing-specific URL.
- **Wish side** with `kind='card'` (any printing) → no canonical product to link. We use a marketplace search URL keyed off the card name. This lands the user on a results page; the trade-side link still resolves to the actual product.

Absolute prices render as `"4 EUR"` / `"5 USD"`, plain text. NULL renders as nothing — no badge, no "—".

### UI placement

- **List create/edit modal**: a new "Trade preferences" section appears when the selected intent is `wish` or `trade`. It contains currency (select), default price-pref (select with a conditional EUR/USD amount input when `absolute`), and default trade-type (select). On `organize` lists the section is hidden and any submitted values are dropped.
- **Per-entry inline pill**: each entry row in the list editor shows a single small pill with the effective preference (e.g. `CM lowest · cards`, `4 EUR · money`, `list default`, or empty if neither list nor entry have one). Clicking the pill opens a popover with the same three controls plus a "Reset to list default" action.
- **Shared-list browse**: the same pill is rendered on the rows when viewing someone else's shared list. It is read-only (no popover) on the viewer side.
- **Match row**: each side's resolved preference is rendered as a small line beneath the counterparty name, with marketplace presets as external links.

### Schema sketch

```sql
ALTER TABLE lists
  ADD COLUMN default_price_pref text,
  ADD COLUMN default_price_absolute_cents integer,
  ADD COLUMN default_trade_type text,
  ADD COLUMN currency text;

ALTER TABLE lists
  ADD CONSTRAINT chk_lists_default_price_pref
    CHECK (default_price_pref IS NULL OR
           default_price_pref IN ('cm_lowest','tcg_lowest','ct_zero','absolute')),
  ADD CONSTRAINT chk_lists_default_trade_type
    CHECK (default_trade_type IS NULL OR
           default_trade_type IN ('cards','money','both')),
  ADD CONSTRAINT chk_lists_currency
    CHECK (currency IS NULL OR currency IN ('EUR','USD')),
  ADD CONSTRAINT chk_lists_absolute_shape
    CHECK ((default_price_pref = 'absolute') =
           (default_price_absolute_cents IS NOT NULL)),
  ADD CONSTRAINT chk_lists_absolute_positive
    CHECK (default_price_absolute_cents IS NULL OR
           default_price_absolute_cents > 0),
  ADD CONSTRAINT chk_lists_prefs_only_on_trade_intents
    CHECK (intent IN ('wish','trade') OR
           (default_price_pref IS NULL AND
            default_price_absolute_cents IS NULL AND
            default_trade_type IS NULL AND
            currency IS NULL));

ALTER TABLE list_entries
  ADD COLUMN price_pref text,
  ADD COLUMN price_absolute_cents integer,
  ADD COLUMN trade_type text;

ALTER TABLE list_entries
  ADD CONSTRAINT chk_list_entries_price_pref
    CHECK (price_pref IS NULL OR
           price_pref IN ('cm_lowest','tcg_lowest','ct_zero','absolute')),
  ADD CONSTRAINT chk_list_entries_trade_type
    CHECK (trade_type IS NULL OR
           trade_type IN ('cards','money','both')),
  ADD CONSTRAINT chk_list_entries_absolute_shape
    CHECK ((price_pref = 'absolute') = (price_absolute_cents IS NOT NULL)),
  ADD CONSTRAINT chk_list_entries_absolute_positive
    CHECK (price_absolute_cents IS NULL OR price_absolute_cents > 0);
```

No backfill — existing rows get NULL across the board, which is the "no preference" state. Existing match rows render exactly as they do today; preferences appear only as users start filling them in.

The `user_preferences.data` JSONB gains a `defaultCurrency?: 'EUR' | 'USD'` key. No migration; absence reads as `'EUR'`.

## Will Not Be Built

- **Auto-resolved prices on match rows.** We never show a EUR/USD number computed from `marketplace_product_prices` for a marketplace-preset preference. The stored prices conflate languages and would mislead.
- **Match filtering or scoring by preference compatibility.** Matches stay card-identity-only. Preferences are display.
- **Currency conversion.** A EUR-priced trade and a USD-priced wish appear side by side, untranslated. If the friction is real, revisit.
- **Card-for-card balanced bundles.** No multi-card pairing math. `trade_type = 'cards'` is a label, not a constraint solver.
- **Per-group-share preferences.** A list has one set of defaults that ride along to every group it's shared with.
- **Per-entry currency overrides.** Currency stays list-scoped.
- **A separate "preference rotation" or "freshness" tracking** (e.g. "Alice last updated her trade prefs 6 months ago"). Out of scope.

## Confirmation

Integration tests cover:

- The CHECK constraints: invalid enum values, mismatched `(price_pref = 'absolute', price_absolute_cents)` shapes, and preference columns set on `intent='organize'` lists all reject.
- A wish-list entry inherits list defaults when its own override columns are NULL.
- An override on an entry beats the list default for that entry only.
- The match endpoint returns resolved (`COALESCE`-applied) preferences on both sides of each row.

Component tests cover:

- The list create/edit modal preference section is hidden for `organize` lists and shown for `wish` / `trade`.
- The `TradePreferencePill` shows the effective preference (entry override else list default else "no preference") and its popover writes back to the entry.
- The match row card renders marketplace presets as anchor tags with `marketplace-meta.ts`-generated `href`s, absolute prices as text, and renders nothing for NULL preferences.

## More Information

- ADR-005 — Collection tracking data model. Establishes `lists` / `list_entries` and the `intent` × `kind` matrix.
- ADR-013 — Friend Groups for Trading Discovery. Establishes the match view this ADR enriches.
- `apps/web/src/lib/marketplace-meta.ts` — URL templates used by the match row preference links.
