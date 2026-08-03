import type { Printing } from "@openrift/shared";

import type { CardViewerItem } from "@/components/card-viewer-types";
import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { useGridSelectionStore } from "@/stores/grid-selection-store";

import type { CardDragData } from "./dnd-types";

interface DragSelectionArgs {
  mode: "browse" | "select";
  selected: Set<string>;
  items: CardViewerItem[];
  stackByItemId: Map<string, StackedEntry>;
  stacked: boolean;
}

/** Fan + count for a select-mode drag overlay. */
interface DragSelectionSummary {
  /** Up to three unique printings whose copies are selected, in items order. */
  printings: Printing[];
  /**
   * Number of selected tiles in the current view's unit — distinct printings in
   * cards/printings view, individual copies in copies view. This is what the
   * overlay labels ("3 printings"), not the underlying copy count.
   */
  count: number;
}

/**
 * Walks `items` + `selected` to build the drag-overlay fan (first three unique
 * printings whose copies are selected) and to count how many tiles the
 * selection spans. Pure so the grid can recompute it on selection changes and
 * the overlay can read a stable result from {@link useDragPreviewStore}.
 * @returns The fanned printings and the selected-tile count.
 */
export function computeDragSelectionSummary({
  mode,
  selected,
  items,
  stackByItemId,
  stacked,
}: DragSelectionArgs): DragSelectionSummary {
  if (mode !== "select" || selected.size === 0) {
    return { printings: [], count: 0 };
  }
  const printings: Printing[] = [];
  const seen = new Set<string>();
  let count = 0;
  for (const item of items) {
    const stack = stackByItemId.get(item.id);
    if (!stack) {
      continue;
    }
    const hasSelectedCopy = stacked
      ? stack.copyIds.some((id) => selected.has(id))
      : selected.has(item.id);
    if (!hasSelectedCopy) {
      continue;
    }
    count++;
    if (printings.length < 3 && !seen.has(item.printing.id)) {
      seen.add(item.printing.id);
      printings.push(item.printing);
    }
  }
  return { printings, count };
}

/**
 * Singular noun for the unit the active collection view selects.
 * @returns "card", "printing", or "copy".
 */
export function dragSelectionNoun(view: "cards" | "printings" | "copies"): string {
  return view === "cards" ? "card" : view === "copies" ? "copy" : "printing";
}

/**
 * Resolves a card drag's copy IDs at grab/drop time. A tile that's part of an
 * active multi-selection carries `fromSelection: true` rather than a frozen
 * `copyIds` list: already-selected grid cells don't re-render when more cards
 * join the selection, so a list baked in at render time would only carry that
 * one tile's copies. Reading the live selection store here makes a select-mode
 * drag move the whole selection.
 * @returns The drag data, with `copyIds` swapped for the live selection when
 *   the drag originated from a multi-selection.
 */
export function resolveSelectionDrag(data: CardDragData): CardDragData {
  if (!data.fromSelection) {
    return data;
  }
  return { ...data, copyIds: [...useGridSelectionStore.getState().selected] };
}

/**
 * Narrows a card drag's copy ids to what the drop should carry. A stack drag
 * takes one copy by default, the whole stack when Shift is held, and `n` copies
 * when a digit key 2-9 is held during the drag. Drags that aren't stacks (a
 * single copy, or a hand-built select-mode selection) always carry every
 * dragged copy — the user picked that set themselves, so there is nothing to
 * trim. Both drop targets go through this, so dropping on a collection and
 * dropping on a sidebar list read the same modifier the same way.
 * @returns The copy ids the drop should act on.
 */
export function resolveDropCopyIds(
  data: Pick<CardDragData, "copyIds" | "isStackDrag">,
  modifier: "all" | number | null,
): string[] {
  if (!data.isStackDrag || modifier === "all") {
    return data.copyIds;
  }
  return data.copyIds.slice(0, typeof modifier === "number" ? modifier : 1);
}
