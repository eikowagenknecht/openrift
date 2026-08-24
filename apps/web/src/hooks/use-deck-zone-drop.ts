import { useDndContext, useDroppable } from "@dnd-kit/core";
import type { DeckFormat, DeckZone } from "@openrift/shared";

import type { AnyDragData, DeckDropData } from "@/components/deck/deck-dnd-context";
import { DECK_DRAG_TYPES, resolveDraggedCard } from "@/components/deck/deck-dnd-context";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { isCardAllowedInZone, isDeckZoneFullForDrag } from "@/lib/deck-builder-card";
import { asDragData } from "@/lib/dnd-data";

/**
 * Whether a zone must reject the card currently being dragged: an incompatible
 * type, or a zone already full for this drag (copy limit, battlefield dedupe,
 * the 12-rune cap). Nothing being dragged, or a drag whose card can't be
 * resolved against the deck, is never a rejection.
 * @returns True when a drop on this zone has to be a no-op.
 */
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

/**
 * Registers a deck zone as a drop target, shared by the sidebar's zone sections
 * and the overview's zone tiles so the two reject the same drags.
 *
 * The zone stays registered even when it rejects the dragged card: a disabled
 * droppable leaves collision detection, and a release over it would then read
 * as "dropped outside a zone", which REMOVES a copy (see handleDragEnd). The
 * rejection travels in `dropData.disabled` instead, and callers gate their own
 * highlight on the returned `dropDisabled`.
 *
 * `disabled` is the separate, real thing: a read-only surface takes no drops at
 * all.
 *
 * @returns The droppable ref, whether a drag is over it, and the rejection.
 */
export function useDeckZoneDrop(args: {
  /** Droppable id — unique per surface, since both mount the same zones. */
  id: string;
  zone: DeckZone;
  allCards: DeckBuilderCard[];
  format: DeckFormat;
  /** Read-only surfaces register nothing. */
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
