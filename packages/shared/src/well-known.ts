import type { Rarity } from "./types/enums.js";

/**
 * Most categories here mirror rows in DB reference tables (validated at API
 * startup against `is_well_known = true`); `setType` and `packSlot` are pure
 * application enums with no backing table.
 */
export const WellKnown = {
  cardType: {
    LEGEND: "legend",
    RUNE: "rune",
    BATTLEFIELD: "battlefield",
    UNIT: "unit",
    GEAR: "gear",
  },
  keyword: {
    UNIQUE: "Unique",
  },
  domain: {
    COLORLESS: "colorless",
  },
  superType: {
    BASIC: "basic",
    CHAMPION: "champion",
    SIGNATURE: "signature",
    TOKEN: "token",
  },
  language: {
    EN: "EN",
    SC: "SC",
  },
  finish: {
    NORMAL: "normal",
    FOIL: "foil",
    METAL: "metal",
    METAL_DELUXE: "metal-deluxe",
  },
  artVariant: {
    NORMAL: "normal",
    ALTART: "altart",
    ULTIMATE: "ultimate",
  },
  cardSize: {
    STANDARD: "standard",
    OVERSIZED: "oversized",
  },
  rarity: {
    COMMON: "common",
    UNCOMMON: "uncommon",
    RARE: "rare",
    EPIC: "epic",
    SHOWCASE: "showcase",
  },
  deckFormat: {
    CONSTRUCTED: "constructed",
    FREEFORM: "freeform",
    CUSTOM_REGION: "custom-region",
  },
  banFormat: {
    CONSTRUCTED: "standard",
    TWO_V_TWO: "2v2",
  },
  deckZone: {
    MAIN: "main",
    SIDEBOARD: "sideboard",
    LEGEND: "legend",
    CHAMPION: "champion",
    RUNES: "runes",
    BATTLEFIELD: "battlefield",
    OVERFLOW: "overflow",
  },
  setType: {
    MAIN: "main",
    SUPPLEMENTAL: "supplemental",
  },
  packSlot: {
    COMMON: "common",
    UNCOMMON: "uncommon",
    FLEX: "flex",
    FOIL: "foil",
    TOKEN: "token",
    SHOWCASE: "showcase",
    ULTIMATE: "ultimate",
  },
} as const;

/**
 * Maps a renamed `languages.code` to its current value, for stale external
 * references (localStorage filters, saved `/promos/<code>` links, old CSVs).
 */
export const RENAMED_LANGUAGES: Record<string, string> = {
  ZH: WellKnown.language.SC,
};

const RARITIES_ALWAYS_FOIL: readonly string[] = [
  WellKnown.rarity.RARE,
  WellKnown.rarity.EPIC,
  WellKnown.rarity.SHOWCASE,
];

export const LOW_RARITIES: ReadonlySet<Rarity> = new Set([
  WellKnown.rarity.COMMON,
  WellKnown.rarity.UNCOMMON,
]);

/** Import sources normalize rarity to lowercase, so the comparison folds case. */
export function isAlwaysFoilRarity(rarity: string): boolean {
  const normalized = rarity.toLowerCase();
  return RARITIES_ALWAYS_FOIL.some((value) => value.toLowerCase() === normalized);
}

/**
 * TCG, Cardmarket and CardTrader staging rows only carry `normal`/`foil`, so a
 * metal or metal-deluxe printing's marketplace variant must store `foil` to join.
 */
export function marketplaceFinish(dbFinish: string): string {
  if (dbFinish === WellKnown.finish.METAL || dbFinish === WellKnown.finish.METAL_DELUXE) {
    return WellKnown.finish.FOIL;
  }
  return dbFinish;
}

export function isBaseBanFormat(formatId: string): boolean {
  return formatId === WellKnown.banFormat.CONSTRUCTED;
}
