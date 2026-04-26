/**
 * Well-known reference table slugs.
 *
 * These match rows in the database reference tables (card_types, domains, etc.)
 * that application logic depends on. The tables can have MORE rows — these are
 * just the ones the code has special-case logic for.
 *
 * At API startup, a validator checks that every slug listed here exists in its
 * reference table. If a row is missing, the server refuses to start.
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
} as const;

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
