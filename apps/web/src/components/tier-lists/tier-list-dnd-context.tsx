import type { CollisionDetection, DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import type { Card, Printing } from "@openrift/shared";
import type { ReactNode } from "react";
import { useState } from "react";

import { DndScrollWatcher } from "@/components/dnd-scroll-watcher";
import { TierCardTile } from "@/components/tier-lists/tier-card-tile";
import {
  asTierListDragData,
  asTierListDropData,
} from "@/components/tier-lists/tier-list-dnd-types";
import { useTierListBuilderStore } from "@/stores/tier-list-builder-store";

/** Pointer travel before a press becomes a drag, so a click still reads as a click. */
const DRAG_ACTIVATION = { distance: 8 };

/**
 * Prefers the deepest target under the pointer. A card on the board sits inside
 * its row, so both register a hit; without this the row could win and the drop
 * would append instead of inserting at the card's position, making ordering
 * within a row impossible.
 * @returns The collisions, card targets first.
 */
const preferCardTargets: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  const cardHit = collisions.find(
    (collision) =>
      asTierListDropData(collision.data?.droppableContainer?.data?.current)?.type === "tier-card",
  );
  return cardHit ? [cardHit, ...collisions.filter((c) => c !== cardHit)] : collisions;
};

interface TierListDndContextProps {
  cardsById: Record<string, Card>;
  printingsByCardId: Map<string, Printing[]>;
  children: ReactNode;
}

/**
 * Wires the builder's drag interactions to the board store. Three outcomes,
 * decided by what the pointer is over on release:
 *
 * - a card on the board → insert before it (this is how a row gets ordered);
 * - a row → append to that row;
 * - the pool → take the card off the board.
 *
 * A release over nothing is a no-op rather than an unrank: unlike the deck
 * builder, where dropping outside a zone removes a copy, an accidental release
 * here would silently undo work that took a while to do.
 *
 * @returns The drag context wrapping `children`.
 */
export function TierListDndContext({
  cardsById,
  printingsByCardId,
  children,
}: TierListDndContextProps) {
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: DRAG_ACTIVATION }));

  const handleDragStart = (event: DragStartEvent) => {
    setDraggedCardId(asTierListDragData(event.active.data.current)?.cardId ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedCardId(null);
    const drag = asTierListDragData(event.active.data.current);
    const drop = asTierListDropData(event.over?.data.current);
    if (!drag || !drop) {
      return;
    }
    const { assign, unassign } = useTierListBuilderStore.getState();
    if (drop.type === "tier-pool") {
      unassign(drag.cardId);
      return;
    }
    if (drop.type === "tier-row") {
      assign(drag.cardId, drop.rowIndex);
      return;
    }
    // Dropping a card onto itself is a no-op, not a move to its own index.
    if (drop.cardId !== drag.cardId) {
      assign(drag.cardId, drop.rowIndex, drop.position);
    }
  };

  const draggedCard = draggedCardId ? cardsById[draggedCardId] : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={preferCardTargets}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggedCardId(null)}
    >
      <DndScrollWatcher />
      {children}
      <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={null}>
        {draggedCardId && draggedCard ? (
          <TierCardTile
            view={{
              cardId: draggedCardId,
              card: draggedCard,
              printing: printingsByCardId.get(draggedCardId)?.[0],
            }}
            className="rotate-3 opacity-90 shadow-lg"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
