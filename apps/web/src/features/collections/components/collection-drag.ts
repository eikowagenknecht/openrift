import { useGridSelectionStore } from "@/features/cards/stores/grid-selection-store";

import type { CardDragData } from "./dnd-types";

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
