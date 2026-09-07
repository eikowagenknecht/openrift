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
import { TIER_LABEL_INK, tierColor } from "@openrift/shared";
import type { ReactNode } from "react";
import { useState } from "react";

import { CardDragGhost } from "@/components/cards/card-drag-ghost";
import { DndScrollWatcher } from "@/components/dnd-scroll-watcher";
import { useTierTileWidth } from "@/components/tier-lists/tier-card-tile";
import type { TierListDragData } from "@/components/tier-lists/tier-list-dnd-types";
import {
  asTierListDragData,
  asTierListDropData,
} from "@/components/tier-lists/tier-list-dnd-types";
import { collisionDropData } from "@/lib/dnd-data";
import { useTierListBuilderStore } from "@/stores/tier-list-builder-store";

const DRAG_ACTIVATION = { distance: 8 };

/**
 * Prefers the deepest target so a row hit never wins over a card inside it.
 */
const preferCardTargets: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  if (asTierListDragData(args.active.data.current)?.type === "tier-row-handle") {
    return collisions.filter(
      (collision) => asTierListDropData(collisionDropData(collision))?.type === "tier-row",
    );
  }
  const cardHit = collisions.find(
    (collision) => asTierListDropData(collisionDropData(collision))?.type === "tier-card",
  );
  return cardHit ? [cardHit, ...collisions.filter((c) => c !== cardHit)] : collisions;
};

interface TierListDndContextProps {
  cardsById: Record<string, Card>;
  printingsByCardId: Map<string, Printing[]>;
  children: ReactNode;
}

/**
 * A release over nothing is a no-op, not an unrank: unlike the deck builder,
 * an accidental release here would silently undo work that took a while to do.
 */
export function TierListDndContext({
  cardsById,
  printingsByCardId,
  children,
}: TierListDndContextProps) {
  const [dragged, setDragged] = useState<TierListDragData | null>(null);
  const tileWidth = useTierTileWidth();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: DRAG_ACTIVATION }));

  const handleDragStart = (event: DragStartEvent) => {
    setDragged(asTierListDragData(event.active.data.current) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragged(null);
    const drag = asTierListDragData(event.active.data.current);
    const drop = asTierListDropData(event.over?.data.current);
    if (!drag || !drop) {
      return;
    }
    const { assign, unassign, moveRow } = useTierListBuilderStore.getState();
    if (drag.type === "tier-row-handle") {
      if (drop.type === "tier-row") {
        moveRow(drag.rowIndex, drop.rowIndex);
      }
      return;
    }
    // A card grabbed in the pool carries the printing the creator actually
    // pointed at; one already on the board keeps whatever it is pinned to.
    const printingId = drag.type === "tier-pool-card" ? drag.printingId : undefined;
    if (drop.type === "tier-pool") {
      unassign(drag.cardId);
      return;
    }
    if (drop.type === "tier-row") {
      assign(drag.cardId, drop.rowIndex, { printingId });
      return;
    }
    // Dropping a card onto itself is a no-op, not a move to its own index.
    if (drop.cardId !== drag.cardId) {
      assign(drag.cardId, drop.rowIndex, { position: drop.position, printingId });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={preferCardTargets}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragged(null)}
    >
      <DndScrollWatcher />
      {children}
      <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={null}>
        <DragPreview
          dragged={dragged}
          cardsById={cardsById}
          printingsByCardId={printingsByCardId}
          tileWidth={tileWidth}
        />
      </DragOverlay>
    </DndContext>
  );
}

function DragPreview({
  dragged,
  cardsById,
  printingsByCardId,
  tileWidth,
}: {
  dragged: TierListDragData | null;
  cardsById: Record<string, Card>;
  printingsByCardId: Map<string, Printing[]>;
  tileWidth: number;
}) {
  const rowLabel = useTierListBuilderStore((state) =>
    dragged?.type === "tier-row-handle" ? (state.rows[dragged.rowIndex]?.label ?? null) : null,
  );

  if (!dragged) {
    return null;
  }
  if (dragged.type === "tier-row-handle") {
    return rowLabel === null ? null : (
      <div
        className="flex h-9 min-w-14 items-center justify-center rounded-md px-2 font-bold opacity-90 shadow-lg"
        style={{ backgroundColor: tierColor(dragged.rowIndex), color: TIER_LABEL_INK }}
      >
        {rowLabel}
      </div>
    );
  }

  const card = cardsById[dragged.cardId];
  if (!card) {
    return null;
  }
  const printings = printingsByCardId.get(dragged.cardId);
  // Undefined only for a cards-view pool cell, which stands for the card, not a printing.
  const shown = dragged.printingId
    ? printings?.find((printing) => printing.id === dragged.printingId)
    : printings?.[0];
  return (
    <CardDragGhost
      printings={shown ? [shown] : []}
      card={card}
      label={card.name}
      width={tileWidth}
      className="opacity-90"
    />
  );
}
