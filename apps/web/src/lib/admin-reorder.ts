/**
 * Swaps the row at `index` with its neighbour in `direction` and returns the full
 * key list in the new order, ready to hand to a reorder mutation. Shared by the
 * admin tables whose rows move one step at a time via the up/down buttons.
 *
 * @returns The reordered keys, or null when the move would leave the list.
 */
export function swapForReorder<T>(
  items: T[],
  index: number,
  direction: -1 | 1,
  getKey: (item: T) => string,
): string[] | null {
  const targetIndex = index + direction;
  if (index < 0 || index >= items.length || targetIndex < 0 || targetIndex >= items.length) {
    return null;
  }
  const keys = items.map((item) => getKey(item));
  [keys[index], keys[targetIndex]] = [keys[targetIndex], keys[index]];
  return keys;
}
