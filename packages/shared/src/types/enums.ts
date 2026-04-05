// ── Game data enums ─────────────────────────────────────────────────────────
// These types are backed by reference tables in the database. The valid values
// are managed via the admin UI — these string unions represent the currently
// known set. When adding a value, INSERT a row in the reference table (no
// migration needed). See WellKnown in well-known.ts for values that have
// special application logic.

/** Backed by `card_types` reference table. */
export type CardType = "Legend" | "Unit" | "Rune" | "Spell" | "Gear" | "Battlefield" | "Other";

/** Backed by `rarities` reference table. */
export type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Showcase";

/** Backed by `domains` reference table. */
export type Domain = "Fury" | "Calm" | "Mind" | "Body" | "Chaos" | "Order" | "Colorless";

/** Backed by `super_types` reference table. */
export type SuperType = "Basic" | "Champion" | "Signature" | "Token";

export type CardFace = "front" | "back";

/** Backed by `art_variants` reference table. */
export type ArtVariant = "normal" | "altart" | "overnumbered";

/** Backed by `finishes` reference table. */
export type Finish = "normal" | "foil";

// ── Display-order arrays ────────────────────────────────────────────────────
// These define the canonical client-side sort order. They mirror the
// `sort_order` column in each reference table and are used as fallback
// ordering for comparePrintings() and filter UIs. The /api/enums endpoint
// is the authoritative source; these are kept for shared code that runs
// without an API connection (e.g. import parsers, offline sorting).

export const DOMAIN_ORDER: readonly Domain[] = [
  "Fury",
  "Calm",
  "Mind",
  "Body",
  "Chaos",
  "Order",
  "Colorless",
] as const;

export const RARITY_ORDER: readonly Rarity[] = [
  "Common",
  "Uncommon",
  "Rare",
  "Epic",
  "Showcase",
] as const;

export const ART_VARIANT_ORDER: readonly ArtVariant[] = [
  "normal",
  "altart",
  "overnumbered",
] as const;

export const FINISH_ORDER: readonly Finish[] = ["normal", "foil"] as const;

export const CARD_TYPE_ORDER: readonly CardType[] = [
  "Legend",
  "Unit",
  "Rune",
  "Spell",
  "Gear",
  "Battlefield",
  "Other",
] as const;

export const SUPER_TYPE_ORDER: readonly SuperType[] = [
  "Basic",
  "Champion",
  "Signature",
  "Token",
] as const;

// ── Application-level enums ─────────────────────────────────────────────────
// These are structural to the app and stay hardcoded — adding a value always
// requires code changes.

export type ActivityAction = "added" | "removed" | "moved";

/** Backed by `deck_formats` reference table. */
export type DeckFormat = "standard" | "freeform";

/** Backed by `deck_zones` reference table. */
export type DeckZone =
  | "main"
  | "sideboard"
  | "legend"
  | "champion"
  | "runes"
  | "battlefield"
  | "overflow";
