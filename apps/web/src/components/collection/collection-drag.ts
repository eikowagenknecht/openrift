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
  printings: Printing[];
  count: number;
}

/**
 * Walks `items` + `selected` to build the drag-overlay fan (first three unique
 * printings whose copies are selected) and to count how many tiles the
 * selection spans.
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

export function dragSelectionNoun(view: "cards" | "printings" | "copies"): string {
  return view === "cards" ? "card" : view === "copies" ? "copy" : "printing";
}

/**
 * A tile in an active multi-selection carries `fromSelection: true`, not a frozen
 * `copyIds`, since already-selected cells don't re-render as the selection grows.
 */
export function resolveSelectionDrag(data: CardDragData): CardDragData {
  if (!data.fromSelection) {
    return data;
  }
  return { ...data, copyIds: [...useGridSelectionStore.getState().selected] };
}

/**
 * A stack drag takes one copy by default, the whole stack on Shift, or `n`
 * copies on digit key 2-9. Non-stack drags always carry every dragged copy.
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
