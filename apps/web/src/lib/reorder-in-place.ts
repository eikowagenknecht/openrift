/**
 * Returns a copy of `items` where every entry whose id appears in
 * `orderedIds` is replaced into the same set of slots in the new order, and
 * every other entry stays at its original position.
 *
 * Used by sidebar reorder so dragging non-inbox collections doesn't displace
 * the inbox or group-owned rows, and dragging lists in one intent doesn't
 * displace lists from other intents — the slots are the indexes the
 * reorderable rows already occupied.
 *
 * @returns A new array (or the original if nothing would change) with the
 *   reordered ids slotted in place; references to non-reordered entries are
 *   unchanged.
 */
export function reorderInPlace<T extends { id: string }>(
  items: readonly T[],
  orderedIds: readonly string[],
): T[] {
  const orderedSet = new Set(orderedIds);
  const byId = new Map<string, T>();
  const slots: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (orderedSet.has(item.id)) {
      byId.set(item.id, item);
      slots.push(i);
    }
  }
  const next = [...items];
  let slotIndex = 0;
  for (const id of orderedIds) {
    if (slotIndex >= slots.length) {
      break;
    }
    const replacement = byId.get(id);
    if (replacement) {
      next[slots[slotIndex]] = replacement;
      slotIndex++;
    }
  }
  return next;
}
