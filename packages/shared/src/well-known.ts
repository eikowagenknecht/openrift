import type { Rarity } from "./types/enums.js";

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
    LEGEND: "legend",
    /** Zone inference: Rune cards go to the "runes" zone. */
    RUNE: "rune",
    /** Zone inference: Battlefield cards go to the "battlefield" zone; landscape orientation. */
    BATTLEFIELD: "battlefield",
    /** Champion icon detection for Unit cards. */
    UNIT: "unit",
    /** Placeholder art renders Gear's energy cost in a diamond badge. */
    GEAR: "gear",
  },
  keyword: {
    /** Cards with this keyword cap at 1 copy in a deck (used by playset filter). */
    UNIQUE: "Unique",
  },
  domain: {
    /** No gradient, displays as "No Domain", wildcard in deck domain validation. */
    COLORLESS: "colorless",
  },
  superType: {
    /** The domain Runes' supertype; hidden from the supertype filter list and the "has any supertype" presence predicate. */
    BASIC: "basic",
    /** Champion detection for zone inference and icon display. */
    CHAMPION: "champion",
    /** Signature detection for icon display. */
    SIGNATURE: "signature",
    /** Pack opener: routes the card to the token slot, not the regular common/uncommon slot. */
    TOKEN: "token",
  },
  /**
   * Riot's printed language codes, not ISO 639-1 — `SC` is what the physical
   * cards carry for Simplified Chinese (ISO would be `zh`). Keyed by `code`
   * rather than `slug` in the `languages` table.
   */
  language: {
    /**
     * The catalog's default language. Printings default to it, canonical
     * printing selection ranks it first, and the Cardmarket / TCGplayer price
     * feeds are assumed to be it (neither exposes a language).
     */
    EN: "EN",
    /** Simplified Chinese. CardTrader's `zh-CN` and Cardmarket's id 6 map here. */
    SC: "SC",
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
  cardSize: {
    /** Default physical size. Every printing is standard unless flagged oversized. */
    STANDARD: "standard",
    /** Physically larger print of an otherwise identical card. */
    OVERSIZED: "oversized",
  },
  rarity: {
    COMMON: "common",
    UNCOMMON: "uncommon",
    /** Always foil-finish (drives import-time finish inference). */
    RARE: "rare",
    /** Always foil-finish (drives import-time finish inference). */
    EPIC: "epic",
    /** Always foil-finish (drives import-time finish inference); also routed to the showcase pack slot. */
    SHOWCASE: "showcase",
  },
  deckFormat: {
    /** Applies constructed deck validation rules. */
    CONSTRUCTED: "constructed",
    /** Skips all deck validation. */
    FREEFORM: "freeform",
    /**
     * Constructed minus domain rules, plus a tag-membership rule. Every card
     * must carry at least one of the chosen region tags (custom_tags.slug,
     * category=`region`) — multiple regions OR-match, so a deck locked to
     * ["bandle-city", "neutral"] accepts cards tagged with either. The
     * chosen slugs live in `format_config.tagSlugs`.
     */
    CUSTOM_REGION: "custom-region",
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
 * Language codes retired by a rename, mapped to their replacement.
 *
 * A rename of `languages.code` cascades through the FKs, and migration 204
 * backfills the tables that lack one. Everything outside the database keeps the
 * old code: localStorage-persisted filters, saved `/promos/<code>` links, CSVs
 * exported before the rename. Each of those fails silently (an empty grid, a
 * dropped marketplace filter, an unmatched import row), so the boundaries remap
 * on read instead of rejecting.
 *
 * Entries are safe to drop once the stale copies have aged out.
 */
export const RENAMED_LANGUAGES: Record<string, string> = {
  /** Riot prints `SC` for Simplified Chinese; `ZH` spanned both scripts. */
  ZH: WellKnown.language.SC,
};

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
 * Low rarities (common / uncommon) whose plain version is `normal`-finish only
 * — foil copies of these are premium, not standard. Lives here (rather than
 * inline in {@link isStandardPrinting}) so the "standard printing" definition
 * stays correct as the rarity vocabulary grows. See ADR-034.
 */
export const LOW_RARITIES: ReadonlySet<Rarity> = new Set([
  WellKnown.rarity.COMMON,
  WellKnown.rarity.UNCOMMON,
]);

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
