import { WellKnown } from "../well-known.js";
import type { PackPool, PackPrinting } from "./types.js";

/**
 * Partition a flat list of booster-eligible printings into per-slot pools.
 * Callers should pre-filter out printings with any markers (promos, regional,
 * etc.) and pick a single language before calling this — this function does
 * not apply those filters.
 * @returns The printings grouped into slot-specific pools.
 */
export function buildPool(printings: readonly PackPrinting[]): PackPool {
  const normalArt = WellKnown.artVariant.NORMAL;
  const altart = WellKnown.artVariant.ALTART;
  const overnumbered = WellKnown.artVariant.OVERNUMBERED;
  const ultimate = WellKnown.artVariant.ULTIMATE;
  const normalFinish = WellKnown.finish.NORMAL;
  const foilFinish = WellKnown.finish.FOIL;
  const runeType = WellKnown.cardType.RUNE;
  const tokenSuper = WellKnown.superType.TOKEN;

  const pool: PackPool = {
    commons: [],
    uncommons: [],
    rares: [],
    epics: [],
    foilCommons: [],
    foilUncommons: [],
    runes: [],
    foilRunes: [],
    altArtRunes: [],
    tokens: [],
    showcaseAltart: [],
    showcaseOvernumbered: [],
    showcaseSigned: [],
    ultimates: [],
  };

  for (const p of printings) {
    if (p.artVariant === ultimate) {
      pool.ultimates.push(p);
      continue;
    }
    if (p.rarity === WellKnown.rarity.SHOWCASE) {
      if (p.isSigned) {
        pool.showcaseSigned.push(p);
      } else if (p.artVariant === altart) {
        pool.showcaseAltart.push(p);
      } else if (p.artVariant === overnumbered) {
        pool.showcaseOvernumbered.push(p);
      }
      // Plain non-signed Showcase with art=normal is an edge case; ignore it.
      continue;
    }
    if (p.isSigned) {
      continue;
    }
    // Token-supertype cards (Sprite, Recruit) belong in the token slot, not the
    // common/uncommon slots. Riot pulls them from the token slot in real packs.
    if (p.cardSuperTypes.includes(tokenSuper)) {
      if (p.finish === normalFinish && p.artVariant === normalArt) {
        pool.tokens.push(p);
      }
      continue;
    }
    if (p.cardType === runeType) {
      if (p.finish === normalFinish && p.artVariant === normalArt) {
        pool.runes.push(p);
      } else if (p.finish === foilFinish && p.artVariant === normalArt) {
        pool.foilRunes.push(p);
      } else if (p.finish === normalFinish && p.artVariant === altart) {
        pool.altArtRunes.push(p);
      }
      continue;
    }
    if (p.artVariant !== normalArt) {
      continue;
    }
    if (p.finish === normalFinish) {
      if (p.rarity === WellKnown.rarity.COMMON) {
        pool.commons.push(p);
      } else if (p.rarity === WellKnown.rarity.UNCOMMON) {
        pool.uncommons.push(p);
      }
      continue;
    }
    if (p.finish === foilFinish) {
      if (p.rarity === WellKnown.rarity.COMMON) {
        pool.foilCommons.push(p);
      } else if (p.rarity === WellKnown.rarity.UNCOMMON) {
        pool.foilUncommons.push(p);
      } else if (p.rarity === WellKnown.rarity.RARE) {
        pool.rares.push(p);
      } else if (p.rarity === WellKnown.rarity.EPIC) {
        pool.epics.push(p);
      }
    }
  }

  return pool;
}
