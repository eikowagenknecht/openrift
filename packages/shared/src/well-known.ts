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
  domain: {
    /** No gradient, displays as "No Domain", wildcard in deck domain validation. */
    COLORLESS: "Colorless",
  },
  superType: {
    /** Champion detection for zone inference and icon display. */
    CHAMPION: "Champion",
    /** Signature detection for icon display. */
    SIGNATURE: "Signature",
  },
  finish: {
    /** Default finish when unspecified. */
    NORMAL: "normal",
    /** Triggers foil overlay rendering. */
    FOIL: "foil",
  },
  artVariant: {
    /** Default art variant when null or unspecified. */
    NORMAL: "normal",
    /** Alt art display label. */
    ALTART: "altart",
    /** Overnumbered display label. */
    OVERNUMBERED: "overnumbered",
  },
  deckFormat: {
    /** Applies standard deck validation rules. */
    STANDARD: "standard",
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
