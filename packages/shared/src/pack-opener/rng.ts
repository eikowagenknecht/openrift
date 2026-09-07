// next() must return a uniform float in [0, 1).
export interface Random {
  next: () => number;
}

export const mathRandom: Random = {
  next: () => Math.random(),
};

const UINT32_MODULUS = 2 ** 32;

function toUint32(n: number): number {
  return ((n % UINT32_MODULUS) + UINT32_MODULUS) % UINT32_MODULUS;
}

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

// Falls back to the full list when excluding leaves nothing: guards sparse test pools, real sets always have far more printings than slots.
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
