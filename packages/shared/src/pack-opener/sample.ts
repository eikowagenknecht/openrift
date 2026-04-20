import {
  COMMONS_PER_PACK,
  FLEX_EPIC_RATE,
  FLEX_SLOTS_PER_PACK,
  FOIL_RARITY_WEIGHTS,
  SHOWCASE_ALTART_RATE,
  SHOWCASE_OVERNUMBERED_RATE,
  SHOWCASE_SIGNED_RATE,
  ULTIMATE_RATE,
  UNCOMMONS_PER_PACK,
} from "./rates.js";
import type { Random } from "./rng.js";
import { pickOne } from "./rng.js";
import type { PackPool, PackPrinting, PackPull, PackResult } from "./types.js";

/**
 * Weighted pick over the four foil-slot rarity buckets, falling back gracefully
 * if one of them is empty in the current pool (e.g. a set with no Epic foils).
 * @returns A printing for the foil slot.
 */
function pickFoilSlot(rng: Random, pool: PackPool): PackPrinting {
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
      return pickOne(rng, bucket.pool);
    }
  }
  const fallback = buckets.at(-1);
  if (!fallback) {
    throw new Error("pickFoilSlot called with no populated buckets");
  }
  return pickOne(rng, fallback.pool);
}

/**
 * Decide which showcase/ultimate outcome (if any) replaces the foil slot. Order
 * matters: rarer outcomes are rolled first so their probability mass doesn't
 * get absorbed into a more common outcome when a pool is empty.
 * @returns The special pull, or null to fall through to a regular foil.
 */
function rollSpecialSlot(rng: Random, pool: PackPool): PackPull | null {
  const roll = rng.next();
  let cursor = 0;

  cursor += pool.ultimates.length > 0 ? ULTIMATE_RATE : 0;
  if (roll < cursor) {
    return { slot: "ultimate", printing: pickOne(rng, pool.ultimates) };
  }

  cursor += pool.showcaseSigned.length > 0 ? SHOWCASE_SIGNED_RATE : 0;
  if (roll < cursor) {
    return { slot: "showcase", printing: pickOne(rng, pool.showcaseSigned) };
  }

  cursor += pool.showcaseOvernumbered.length > 0 ? SHOWCASE_OVERNUMBERED_RATE : 0;
  if (roll < cursor) {
    return { slot: "showcase", printing: pickOne(rng, pool.showcaseOvernumbered) };
  }

  cursor += pool.showcaseAltart.length > 0 ? SHOWCASE_ALTART_RATE : 0;
  if (roll < cursor) {
    return { slot: "showcase", printing: pickOne(rng, pool.showcaseAltart) };
  }

  return null;
}

/**
 * Open a single booster pack from the given pool.
 * @returns A PackResult with all 13 pulls, in slot order.
 */
export function openPack(pool: PackPool, rng: Random): PackResult {
  const pulls: PackPull[] = [];

  for (let i = 0; i < COMMONS_PER_PACK; i++) {
    pulls.push({ slot: "common", printing: pickOne(rng, pool.commons) });
  }
  for (let i = 0; i < UNCOMMONS_PER_PACK; i++) {
    pulls.push({ slot: "uncommon", printing: pickOne(rng, pool.uncommons) });
  }
  for (let i = 0; i < FLEX_SLOTS_PER_PACK; i++) {
    const isEpic = pool.epics.length > 0 && rng.next() < FLEX_EPIC_RATE;
    const bucket = isEpic ? pool.epics : pool.rares;
    pulls.push({ slot: "flex", printing: pickOne(rng, bucket) });
  }

  const special = rollSpecialSlot(rng, pool);
  pulls.push(special ?? { slot: "foil", printing: pickFoilSlot(rng, pool) });

  pulls.push({ slot: "rune", printing: pickOne(rng, pool.runes) });

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
