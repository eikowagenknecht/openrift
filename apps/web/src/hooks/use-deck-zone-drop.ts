import { useDndContext, useDroppable } from "@dnd-kit/core";
import type { DeckFormat, DeckZone } from "@openrift/shared";

import type { AnyDragData, DeckDropData } from "@/components/deck/deck-dnd-context";
import { DECK_DRAG_TYPES, resolveDraggedCard } from "@/components/deck/deck-dnd-context";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { isCardAllowedInZone, isDeckZoneFullForDrag } from "@/lib/deck-builder-card";
import { asDragData } from "@/lib/dnd-data";

export function isZoneDropRejected(args: {
  dragData: AnyDragData | undefined;
  zone: DeckZone;
  allCards: DeckBuilderCard[];
  format: DeckFormat;
}): boolean {
  const { dragData, zone, allCards, format } = args;
  const draggedCard = resolveDraggedCard(dragData, allCards);
  if (draggedCard === undefined) {
    return false;
  }
  const isZoneFull = isDeckZoneFullForDrag({
    zone,
    draggedCard,
    fromZone: dragData?.type === "deck-card" ? dragData.fromZone : null,
    allCards,
    format,
  });
  return !isCardAllowedInZone(draggedCard, zone) || isZoneFull;
}

/** Never disables the droppable for a rejected drag: that drops out of collision
 * detection, so a release over it removes the card as a drop outside any zone. */
export function useDeckZoneDrop(args: {
  id: string;
  zone: DeckZone;
  allCards: DeckBuilderCard[];
  format: DeckFormat;
  disabled?: boolean;
}): {
  dropRef: (element: HTMLElement | null) => void;
  isOver: boolean;
  dropDisabled: boolean;
} {
  const { id, zone, allCards, format, disabled } = args;
  const { active } = useDndContext();
  const dragData = asDragData<AnyDragData>(active?.data.current, DECK_DRAG_TYPES);
  const dropDisabled = isZoneDropRejected({ dragData, zone, allCards, format });
  const dropData: DeckDropData = { type: "deck-zone", zone, disabled: dropDisabled };
  const { setNodeRef, isOver } = useDroppable({ id, data: dropData, disabled });
  return { dropRef: setNodeRef, isOver, dropDisabled };
}
