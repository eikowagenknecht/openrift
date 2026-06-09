/**
 * Fisher-Yates shuffle seeded by a numeric value so the result is
 * deterministic for the same seed + input, but varies across seeds. Uses a
 * mulberry32 PRNG; the bitwise ops intentionally coerce to int32/uint32.
 *
 * @returns A shuffled copy of `items`, or an empty array if input is empty.
 */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  if (items.length === 0) {
    return [];
  }
  const result = [...items];
  let state = Math.trunc(seed * 2_654_435_761);
  for (let index = result.length - 1; index > 0; index--) {
    // oxlint-disable-next-line unicorn/prefer-math-trunc -- int32 coercion required for PRNG
    state = (state + 0x6d_2b_79_f5) | 0;
    let temp = Math.imul(state ^ (state >>> 15), 1 | state);
    temp ^= temp + Math.imul(temp ^ (temp >>> 7), 61 | temp);
    // oxlint-disable-next-line unicorn/prefer-math-trunc -- uint32 coercion required for PRNG
    const random = ((temp ^ (temp >>> 14)) >>> 0) / 4_294_967_296;
    const swapIndex = Math.floor(random * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
