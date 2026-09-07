/**
 * An empty copy-id list is never selected: it guards unowned library cards,
 * whose `.every()` would otherwise vacuously return true.
 */
export function isStackSelected(
  stacked: boolean,
  itemId: string,
  copyIds: readonly string[],
  selected: ReadonlySet<string>,
): boolean {
  if (!stacked) {
    return selected.has(itemId);
  }
  return copyIds.length > 0 && copyIds.every((id) => selected.has(id));
}

/**
 * Returns null when there is no range to extend: nothing was clicked before,
 * or the anchor isn't in `items`.
 */
export function computeShiftRange<T extends { id: string }>(params: {
  items: readonly T[];
  lastSelectedItemId: string | null;
  itemId: string;
  idsForItem: (item: T) => readonly string[];
}): string[] | null {
  const { items, lastSelectedItemId, itemId, idsForItem } = params;
  const startIdx =
    lastSelectedItemId === null ? -1 : items.findIndex((item) => item.id === lastSelectedItemId);
  const endIdx = items.findIndex((item) => item.id === itemId);
  if (startIdx === -1 || endIdx === -1) {
    return null;
  }
  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  const rangeIds: string[] = [];
  for (const item of items.slice(lo, hi + 1)) {
    rangeIds.push(...idsForItem(item));
  }
  return rangeIds;
}

export interface ContextActionTarget {
  copyIds: string[];
  narrowSelectionTo: string[] | null;
}

export function resolveContextActionTarget(params: {
  mode: "browse" | "select";
  stacked: boolean;
  itemId: string;
  cardCopyIds: string[];
  selected: ReadonlySet<string>;
}): ContextActionTarget {
  const { mode, stacked, itemId, cardCopyIds, selected } = params;
  const actsOnSelection =
    mode === "select" &&
    selected.size > 0 &&
    isStackSelected(stacked, itemId, cardCopyIds, selected);
  if (actsOnSelection) {
    return { copyIds: [...selected], narrowSelectionTo: null };
  }
  if (mode === "select") {
    return { copyIds: cardCopyIds, narrowSelectionTo: cardCopyIds };
  }
  return { copyIds: cardCopyIds, narrowSelectionTo: null };
}
