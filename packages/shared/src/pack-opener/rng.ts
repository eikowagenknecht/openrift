/**
 * Minimal RNG interface used by the pack opener. `next()` must return a uniform
 * float in [0, 1). Swap in `Math.random` for real play; swap in a seeded RNG
 * for deterministic tests.
 */
export interface Random {
  next(): number;
}

export const mathRandom: Random = {
  next: () => Math.random(),
};

const UINT32_MODULUS = 2 ** 32;

function toUint32(n: number): number {
  return ((n % UINT32_MODULUS) + UINT32_MODULUS) % UINT32_MODULUS;
}

/**
 * Mulberry32: tiny, fast, seedable PRNG. Good enough for tests, not crypto.
 * Accepts a 32-bit seed; produces a repeatable sequence for the same seed.
 * @returns A seeded Random that yields a deterministic uniform sequence.
 */
export function mulberry32(seed: number): Random {
  let state = toUint32(seed);
  return {
    next(): number {
      // oxlint-disable-next-line unicorn/numeric-separators-style -- Mulberry32 constant, keeping it in its canonical hex form
      state = toUint32(state + 0x6d2b79f5);
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return toUint32(t ^ (t >>> 14)) / UINT32_MODULUS;
    },
  };
}

/**
 * Pick an element uniformly at random from a non-empty array.
 * @returns One of the items, chosen uniformly.
 */
function pickOne<T>(rng: Random, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("pickOne called with empty array");
  }
  const item = items[Math.floor(rng.next() * items.length)];
  if (item === undefined) {
    throw new Error("pickOne drew an out-of-bounds index");
  }
  return item;
}

/**
 * Pick an element uniformly from a non-empty array, excluding any whose `id` is
 * already in `excluded`. If filtering leaves nothing (a sparse pool with fewer
 * unique printings than slots), fall back to picking from the full list — real
 * sets always have far more printings than slots, this guards tiny test pools.
 * @returns One of the items, preferring one not in `excluded`.
 */
export function pickOneUnique<T extends { id: string }>(
  rng: Random,
  items: readonly T[],
  excluded: ReadonlySet<string>,
): T {
  if (items.length === 0) {
    throw new Error("pickOneUnique called with empty array");
  }
  const eligible = items.filter((item) => !excluded.has(item.id));
  return pickOne(rng, eligible.length > 0 ? eligible : items);
}
