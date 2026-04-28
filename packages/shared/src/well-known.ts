/**
 * Well-known taxonomy values that application logic depends on.
 *
 * Most categories (`cardType`, `domain`, `rarity`, etc.) match rows in DB
 * reference tables. The tables can have MORE rows — these are just the ones
 * the code has special-case logic for. At API startup, a validator checks
 * that every slug listed here exists in its reference table with
 * `is_well_known = true`.
 *
 * A few categories (`setType`, `packSlot`) are pure application enums that
 * aren't backed by reference tables — they live here too so all taxonomy
 * constants have one home.
 */
export const WellKnown = {
  cardType: {
    /** Zone inference: Legend cards go to the "legend" zone. */
    LEGEND: "Legend",
    /** Zone inference: Rune cards go to the "runes" zone. */
    RUNE: "Rune",
    /** Zone inference: Battlefield cards go to the "battlefield" zone; landscape orientation. */
    BATTLEFIELD: "Battlefield",
    /** Champion icon detection for Unit cards. */
    UNIT: "Unit",
  },
  keyword: {
    /** Cards with this keyword cap at 1 copy in a deck (used by playset filter). */
    UNIQUE: "Unique",
  },
  domain: {
    /** No gradient, displays as "No Domain", wildcard in deck domain validation. */
    COLORLESS: "Colorless",
  },
  superType: {
    /** Champion detection for zone inference and icon display. */
    CHAMPION: "Champion",
    /** Signature detection for icon display. */
    SIGNATURE: "Signature",
    /** Pack opener: routes the card to the token slot, not the regular common/uncommon slot. */
    TOKEN: "Token",
  },
  finish: {
    /** Default finish when unspecified. */
    NORMAL: "normal",
    /** Triggers foil overlay rendering. */
    FOIL: "foil",
    /** Metallic premium finish. */
    METAL: "metal",
    /** Deluxe metallic premium finish. */
    METAL_DELUXE: "metal-deluxe",
  },
  artVariant: {
    /** Default art variant when null or unspecified. */
    NORMAL: "normal",
    /** Alt art display label. */
    ALTART: "altart",
    /** Overnumbered display label. */
    OVERNUMBERED: "overnumbered",
    /** Rarest tier, appears in <0.1% of packs. Only exists in sets that have one (e.g. UNL Baron Nashor). */
    ULTIMATE: "ultimate",
  },
  rarity: {
    COMMON: "Common",
    UNCOMMON: "Uncommon",
    /** Always foil-finish (drives import-time finish inference). */
    RARE: "Rare",
    /** Always foil-finish (drives import-time finish inference). */
    EPIC: "Epic",
    /** Always foil-finish (drives import-time finish inference); also routed to the showcase pack slot. */
    SHOWCASE: "Showcase",
  },
  deckFormat: {
    /** Applies constructed deck validation rules. */
    CONSTRUCTED: "constructed",
    /** Skips all deck validation. */
    FREEFORM: "freeform",
  },
  deckZone: {
    /** Default zone for most cards. */
    MAIN: "main",
    /** Sideboard zone. */
    SIDEBOARD: "sideboard",
    /** Legend cards zone. */
    LEGEND: "legend",
    /** Champion cards zone. */
    CHAMPION: "champion",
    /** Rune cards zone. */
    RUNES: "runes",
    /** Battlefield cards zone. */
    BATTLEFIELD: "battlefield",
    /** Auto-zone for excess cards. */
    OVERFLOW: "overflow",
  },
  /**
   * Backed by the `set_type` Postgres ENUM, not a reference table — no DB validation.
   * Adding a value requires a migration to alter the enum.
   */
  setType: {
    MAIN: "main",
    SUPPLEMENTAL: "supplemental",
  },
  /**
   * Pack-opener slot identifiers. Pure application enum — no DB representation.
   */
  packSlot: {
    COMMON: "common",
    UNCOMMON: "uncommon",
    /** Rare or Epic, weighted roll. */
    FLEX: "flex",
    /** Foil common/uncommon, replaced by `showcase` or `ultimate` on a special roll. */
    FOIL: "foil",
    /** Rune (most pulls) or Token-supertype card. */
    TOKEN: "token",
    /** Alt-art / overnumbered / signed showcase pull. */
    SHOWCASE: "showcase",
    /** Rarest tier (<0.1%); only in sets with an Ultimate printing. */
    ULTIMATE: "ultimate",
  },
} as const;

/**
 * Rarities that are always printed with a foil finish — used by import parsers
 * to infer the finish when the source CSV doesn't disambiguate.
 */
const RARITIES_ALWAYS_FOIL: readonly string[] = [
  WellKnown.rarity.RARE,
  WellKnown.rarity.EPIC,
  WellKnown.rarity.SHOWCASE,
];

/**
 * Case-insensitive check against {@link RARITIES_ALWAYS_FOIL}. Import sources
 * normalize rarity to lowercase before matching, so the comparison folds case.
 * @returns True when the rarity is one that's always printed in foil.
 */
export function isAlwaysFoilRarity(rarity: string): boolean {
  const normalized = rarity.toLowerCase();
  return RARITIES_ALWAYS_FOIL.some((value) => value.toLowerCase() === normalized);
}

/**
 * Map a DB finish to the marketplace's coarser view of it.
 *
 * TCG, Cardmarket and CardTrader only emit `normal` or `foil` staging rows —
 * neither "metal" nor "metal-deluxe" is a concept any of them expose. A metal
 * printing's prices live in the same staging rows as a plain foil one, so the
 * `marketplace_product_variants.finish` column must store `foil` to join
 * against staging, even when the printing itself is `metal` / `metal-deluxe`.
 * @returns `foil` for metal/metal-deluxe inputs; all other values pass through unchanged.
 */
export function marketplaceFinish(dbFinish: string): string {
  if (dbFinish === WellKnown.finish.METAL || dbFinish === WellKnown.finish.METAL_DELUXE) {
    return WellKnown.finish.FOIL;
  }
  return dbFinish;
}
