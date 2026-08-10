/**
 * Moves the entry at `from` to `to`, shifting the entries in between.
 *
 * Returns `null` rather than a copy when the move would change nothing — an
 * out-of-range index, or a drop back onto the source. Callers use that to skip
 * a pointless server round trip, so "no change" has to be distinguishable from
 * "same order by coincidence".
 *
 * @returns A new array with the entry moved, or `null` when nothing would move.
 */
export function moveToIndex<T>(items: readonly T[], from: number, to: number): T[] | null {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length ||
    !Number.isInteger(from) ||
    !Number.isInteger(to)
  ) {
    return null;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
