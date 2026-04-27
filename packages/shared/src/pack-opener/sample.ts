import { WellKnown } from "../well-known.js";
import {
  COMMONS_PER_PACK,
  FLEX_EPIC_RATE,
  FLEX_SLOTS_PER_PACK,
  FOIL_RARITY_WEIGHTS,
  SHOWCASE_ALTART_RATE,
  SHOWCASE_OVERNUMBERED_RATE,
  SHOWCASE_SIGNED_RATE,
  TOKEN_SLOT_ALTART_RUNE_RATE,
  TOKEN_SLOT_FOIL_RUNE_RATE,
  TOKEN_SLOT_TOKEN_RATE,
  ULTIMATE_RATE,
  UNCOMMONS_PER_PACK,
} from "./rates.js";
import type { Random } from "./rng.js";
import { pickOneUnique } from "./rng.js";
import type { PackPool, PackPrinting, PackPull, PackResult } from "./types.js";

/**
 * Weighted pick over the four foil-slot rarity buckets, falling back gracefully
 * if one of them is empty in the current pool (e.g. a set with no Epic foils).
 * @returns A printing for the foil slot.
 */
function pickFoilSlot(rng: Random, pool: PackPool, pulled: ReadonlySet<string>): PackPrinting {
  const buckets: { pool: PackPrinting[]; weight: number }[] = [
    { pool: pool.foilCommons, weight: FOIL_RARITY_WEIGHTS.common ?? 0 },
    { pool: pool.foilUncommons, weight: FOIL_RARITY_WEIGHTS.uncommon ?? 0 },
    { pool: pool.rares, weight: FOIL_RARITY_WEIGHTS.rare ?? 0 },
    { pool: pool.epics, weight: FOIL_RARITY_WEIGHTS.epic ?? 0 },
  ].filter((bucket) => bucket.pool.length > 0);

  const total = buckets.reduce((sum, bucket) => sum + bucket.weight, 0);
  let roll = rng.next() * total;
  for (const bucket of buckets) {
    roll -= bucket.weight;
    if (roll <= 0) {
      return pickOneUnique(rng, bucket.pool, pulled);
    }
  }
  const fallback = buckets.at(-1);
  if (!fallback) {
    throw new Error("pickFoilSlot called with no populated buckets");
  }
  return pickOneUnique(rng, fallback.pool, pulled);
}

/**
 * Decide which showcase/ultimate outcome (if any) replaces the foil slot. Order
 * matters: rarer outcomes are rolled first so their probability mass doesn't
 * get absorbed into a more common outcome when a pool is empty.
 * @returns The special pull, or null to fall through to a regular foil.
 */
function rollSpecialSlot(
  rng: Random,
  pool: PackPool,
  pulled: ReadonlySet<string>,
): PackPull | null {
  const roll = rng.next();
  let cursor = 0;

  cursor += pool.ultimates.length > 0 ? ULTIMATE_RATE : 0;
  if (roll < cursor) {
    return {
      slot: WellKnown.packSlot.ULTIMATE,
      printing: pickOneUnique(rng, pool.ultimates, pulled),
    };
  }

  cursor += pool.showcaseSigned.length > 0 ? SHOWCASE_SIGNED_RATE : 0;
  if (roll < cursor) {
    return {
      slot: WellKnown.packSlot.SHOWCASE,
      printing: pickOneUnique(rng, pool.showcaseSigned, pulled),
    };
  }

  cursor += pool.showcaseOvernumbered.length > 0 ? SHOWCASE_OVERNUMBERED_RATE : 0;
  if (roll < cursor) {
    return {
      slot: WellKnown.packSlot.SHOWCASE,
      printing: pickOneUnique(rng, pool.showcaseOvernumbered, pulled),
    };
  }

  cursor += pool.showcaseAltart.length > 0 ? SHOWCASE_ALTART_RATE : 0;
  if (roll < cursor) {
    return {
      slot: WellKnown.packSlot.SHOWCASE,
      printing: pickOneUnique(rng, pool.showcaseAltart, pulled),
    };
  }

  return null;
}

/**
 * Cascading roll for the token slot: alt-art Rune → foil Rune → Token → regular
 * Rune. Empty sub-pools skip their rate so probability mass falls through to
 * the next tier (matches how empty showcase pools behave in the foil slot).
 * @returns A pull for the token slot.
 */
function pickTokenSlot(rng: Random, pool: PackPool, pulled: ReadonlySet<string>): PackPull {
  const roll = rng.next();
  let cursor = 0;

  cursor += pool.altArtRunes.length > 0 ? TOKEN_SLOT_ALTART_RUNE_RATE : 0;
  if (roll < cursor) {
    return {
      slot: WellKnown.packSlot.TOKEN,
      printing: pickOneUnique(rng, pool.altArtRunes, pulled),
    };
  }

  cursor += pool.foilRunes.length > 0 ? TOKEN_SLOT_FOIL_RUNE_RATE : 0;
  if (roll < cursor) {
    return {
      slot: WellKnown.packSlot.TOKEN,
      printing: pickOneUnique(rng, pool.foilRunes, pulled),
    };
  }

  cursor += pool.tokens.length > 0 ? TOKEN_SLOT_TOKEN_RATE : 0;
  if (roll < cursor) {
    return {
      slot: WellKnown.packSlot.TOKEN,
      printing: pickOneUnique(rng, pool.tokens, pulled),
    };
  }

  return {
    slot: WellKnown.packSlot.TOKEN,
    printing: pickOneUnique(rng, pool.runes, pulled),
  };
}

/**
 * Open a single booster pack from the given pool. Real packs never contain the
 * same printing twice, so each pull is constrained to printings not already in
 * the pack — the second flex slot can't repeat the first flex's Rare, etc. A
 * regular Common and its foil version are different printings and may coexist.
 * @returns A PackResult with all 14 pulls, in slot order.
 */
export function openPack(pool: PackPool, rng: Random): PackResult {
  const pulls: PackPull[] = [];
  const pulled = new Set<string>();
  const push = (pull: PackPull): void => {
    pulls.push(pull);
    pulled.add(pull.printing.id);
  };

  for (let i = 0; i < COMMONS_PER_PACK; i++) {
    push({
      slot: WellKnown.packSlot.COMMON,
      printing: pickOneUnique(rng, pool.commons, pulled),
    });
  }
  for (let i = 0; i < UNCOMMONS_PER_PACK; i++) {
    push({
      slot: WellKnown.packSlot.UNCOMMON,
      printing: pickOneUnique(rng, pool.uncommons, pulled),
    });
  }
  for (let i = 0; i < FLEX_SLOTS_PER_PACK; i++) {
    const isEpic = pool.epics.length > 0 && rng.next() < FLEX_EPIC_RATE;
    const bucket = isEpic ? pool.epics : pool.rares;
    push({ slot: WellKnown.packSlot.FLEX, printing: pickOneUnique(rng, bucket, pulled) });
  }

  const special = rollSpecialSlot(rng, pool, pulled);
  push(special ?? { slot: WellKnown.packSlot.FOIL, printing: pickFoilSlot(rng, pool, pulled) });

  push(pickTokenSlot(rng, pool, pulled));

  return { pulls };
}

/**
 * Open N packs from the same pool.
 * @returns An array of PackResults, one per pack.
 */
export function openPacks(pool: PackPool, rng: Random, n: number): PackResult[] {
  const results: PackResult[] = [];
  for (let i = 0; i < n; i++) {
    results.push(openPack(pool, rng));
  }
  return results;
}
