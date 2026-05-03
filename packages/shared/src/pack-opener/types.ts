/**
 * Minimal printing shape consumed by the pack opener. The API flattens the full
 * Printing row into this when serving the pool for a set+language.
 */
export interface PackPrinting {
  id: string;
  cardId: string;
  cardName: string;
  cardSlug: string;
  cardType: string;
  cardSuperTypes: string[];
  rarity: string;
  finish: string;
  artVariant: string;
  isSigned: boolean;
  language: string;
  shortCode: string;
  publicCode: string;
  setSlug: string;
}

/**
 * Which slot in a pack produced the pull. Used for grouping the reveal UI and
 * for the stats panel (e.g. "1 flex slot was an Epic"). The token slot holds
 * either a Rune (most of the time) or a Token-supertype card like Sprite.
 */
type PackSlot = "common" | "uncommon" | "flex" | "foil" | "token" | "showcase" | "ultimate";

export interface PackPull {
  slot: PackSlot;
  printing: PackPrinting;
}

export interface PackResult {
  pulls: PackPull[];
}

/**
 * Pool of printings partitioned by role. Each array may be empty — the opener
 * skips slots that have no eligible printings and absorbs the probability mass
 * back into adjacent slots (see `sample.ts`).
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

/**
 * True when every required slot has at least one printing. Sets missing any of
 * common/uncommon/rare/epic/foilCommon/foilUncommon/rune shouldn't be openable.
 * Token, foilRune, altArtRune, showcase, and ultimate pools may be empty; the
 * opener handles that gracefully.
 * @returns True if the set has a complete pool and can be opened.
 */
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
