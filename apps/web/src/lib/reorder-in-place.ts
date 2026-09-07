// Reorders only the entries whose id is in `orderedIds`, keeping them within
// the set of slots those entries already occupied; other entries don't move.
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
