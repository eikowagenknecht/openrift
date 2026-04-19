// ── Game data enums ─────────────────────────────────────────────────────────
// These types are backed by reference tables in the database. Valid values are
// managed via the admin UI — adding a value requires only an INSERT into the
// reference table (no code change). See WellKnown in well-known.ts for values
// that have special application logic (compile-time safety).

/** Backed by `card_types` reference table. */
// oxlint-disable-next-line typescript-eslint/ban-types -- open string type for DB-driven enum values
export type CardType = string & Record<never, never>;

/** Backed by `rarities` reference table. */
// oxlint-disable-next-line typescript-eslint/ban-types -- open string type for DB-driven enum values
export type Rarity = string & Record<never, never>;

/** Backed by `domains` reference table. */
// oxlint-disable-next-line typescript-eslint/ban-types -- open string type for DB-driven enum values
export type Domain = string & Record<never, never>;

/** Backed by `super_types` reference table. */
// oxlint-disable-next-line typescript-eslint/ban-types -- open string type for DB-driven enum values
export type SuperType = string & Record<never, never>;

export type CardFace = "front" | "back";

/** Backed by `art_variants` reference table. */
// oxlint-disable-next-line typescript-eslint/ban-types -- open string type for DB-driven enum values
export type ArtVariant = string & Record<never, never>;

/** Backed by `finishes` reference table. */
// oxlint-disable-next-line typescript-eslint/ban-types -- open string type for DB-driven enum values
export type Finish = string & Record<never, never>;

// ── Enum orders ─────────────────────────────────────────────────────────────
// Sort orders for reference-table enums. The /api/enums endpoint is the
// authoritative source at runtime; DEFAULT_ENUM_ORDERS provides fallback
// ordering for shared code that runs without an API connection (e.g. import
// parsers, offline sorting).

/** Sort-order configuration for all reference-table enums. */
export interface EnumOrders {
  finishes: readonly string[];
  rarities: readonly string[];
  domains: readonly string[];
  cardTypes: readonly string[];
  superTypes: readonly string[];
  artVariants: readonly string[];
}

/** Fallback sort orders matching the initial database seed. */
export const DEFAULT_ENUM_ORDERS: EnumOrders = {
  domains: ["Fury", "Calm", "Mind", "Body", "Chaos", "Order", "Colorless"],
  rarities: ["Common", "Uncommon", "Rare", "Epic", "Showcase"],
  artVariants: ["normal", "altart", "overnumbered"],
  finishes: ["normal", "foil", "metal", "metal-deluxe"],
  cardTypes: ["Legend", "Unit", "Rune", "Spell", "Gear", "Battlefield", "Other"],
  superTypes: ["Basic", "Champion", "Signature", "Token"],
};

// ── Application-level enums ─────────────────────────────────────────────────
// These are structural to the app and stay hardcoded — adding a value always
// requires code changes.

export type SetType = "main" | "supplemental";

export type ActivityAction = "added" | "removed" | "moved";

/** Backed by `deck_formats` reference table. */
export type DeckFormat = "constructed" | "freeform";

/** Backed by `deck_zones` reference table. */
export type DeckZone =
  | "main"
  | "sideboard"
  | "legend"
  | "champion"
  | "runes"
  | "battlefield"
  | "overflow";
