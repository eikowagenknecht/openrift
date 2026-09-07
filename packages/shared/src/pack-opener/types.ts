export interface PackPrinting {
  id: string;
  cardId: string;
  cardName: string;
  cardSlug: string;
  cardTypes: string[];
  cardSuperTypes: string[];
  tags: string[];
  rarity: string;
  finish: string;
  artVariant: string;
  isSigned: boolean;
  isOvernumbered: boolean;
  language: string;
  shortCode: string;
  publicCode: string;
  setSlug: string;
}

type PackSlot = "common" | "uncommon" | "flex" | "foil" | "token" | "showcase" | "ultimate";

export interface PackPull {
  slot: PackSlot;
  printing: PackPrinting;
}

export interface PackResult {
  pulls: PackPull[];
}

/**
 * Empty slots have their probability mass absorbed into adjacent slots by
 * the opener (see `sample.ts`).
 */
export interface PackPool {
  commons: PackPrinting[];
  uncommons: PackPrinting[];
  rares: PackPrinting[];
  epics: PackPrinting[];
  foilCommons: PackPrinting[];
  foilUncommons: PackPrinting[];
  runes: PackPrinting[];
  foilRunes: PackPrinting[];
  altArtRunes: PackPrinting[];
  tokens: PackPrinting[];
  showcaseAltart: PackPrinting[];
  showcaseOvernumbered: PackPrinting[];
  showcaseSigned: PackPrinting[];
  ultimates: PackPrinting[];
}

export function isPoolOpenable(pool: PackPool): boolean {
  return (
    pool.commons.length > 0 &&
    pool.uncommons.length > 0 &&
    pool.rares.length > 0 &&
    pool.epics.length > 0 &&
    pool.foilCommons.length > 0 &&
    pool.foilUncommons.length > 0 &&
    pool.runes.length > 0
  );
}
