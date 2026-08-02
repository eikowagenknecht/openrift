/**
 * Whether a collection card/stack counts as selected. In "copies" view the
 * cell's own copy id (`itemId`) must be in the set; in stacked views (cards /
 * printings) every one of the card's effective copy ids must be. An empty
 * copy-id list is never selected — it guards unowned library cards, whose
 * `.every()` would otherwise vacuously return true.
 *
 * Shared by the grid cell's checkbox, the table row wrapper, and the
 * right-click action menu so all three agree on what "this card is selected"
 * means.
 *
 * @returns True when the card should render as selected.
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
 * Walks the display-order range between the last-clicked tile and the
 * shift-clicked one, accumulating the selectable ids each tile stands for.
 *
 * Shared by the /collections grid (where one tile can stand for many copy ids)
 * and the list-entry browser (one tile = one entry id); the per-tile mapping is
 * the only thing that differs, so callers pass it as `idsForItem`.
 *
 * A null return means there is no range to extend — either nothing was clicked
 * before, or the anchor is no longer in `items` (it was filtered or paged
 * away). Callers fall back to toggling the clicked tile on its own.
 *
 * @returns The ids to add to the selection, or null when the caller should toggle the single clicked tile instead.
 */
export function computeShiftRange<T extends { id: string }>(params: {
  items: readonly T[];
  /** The anchor tile, from `getLastSelectedItemId()`. */
  lastSelectedItemId: string | null;
  /** The shift-clicked tile. */
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
  for (let idx = lo; idx <= hi; idx++) {
    rangeIds.push(...idsForItem(items[idx]));
  }
  return rangeIds;
}

export interface ContextActionTarget {
  /** Copy IDs the action should operate on. */
  copyIds: string[];
  /**
   * When non-null, narrow the visible selection to these ids before acting.
   * Null leaves the selection (and select mode) untouched.
   */
  narrowSelectionTo: string[] | null;
}

/**
 * Decides what a /collections right-click action targets:
 *  - Card is part of the current multi-selection → act on the whole selection,
 *    leave it untouched.
 *  - Select mode, card not selected → narrow the selection to just this card
 *    (matches desktop right-click), then act on it.
 *  - Browse mode → act on just this card without touching select mode.
 *
 * @returns The copy ids to act on and whether to narrow the selection first.
 */
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
