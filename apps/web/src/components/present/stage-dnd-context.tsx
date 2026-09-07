import type {
  Collision,
  CollisionDetection,
  DragEndEvent,
  DragStartEvent,
  Modifier,
} from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
  snapCenterToCursor,
} from "@dnd-kit/modifiers";
import type { ReactNode } from "react";
import { useState } from "react";

import { CardDragGhost } from "@/components/cards/card-drag-ghost";
import { DndScrollWatcher } from "@/components/dnd-scroll-watcher";
import type { StageDragData } from "@/components/present/stage-dnd-types";
import { asStageDragData, asStageDropData } from "@/components/present/stage-dnd-types";
import { collisionDropData } from "@/lib/dnd-data";
import { moveToIndex } from "@/lib/move-to-index";
import { usePresentQueueStore } from "@/stores/present-queue-store";

const DRAG_ACTIVATION = { distance: 8 };

const QUEUE_ROW_MODIFIERS: Modifier[] = [restrictToVerticalAxis, restrictToParentElement];

function dropTypeOf(collision: Collision): string | undefined {
  return asStageDropData(collisionDropData(collision))?.type;
}

/**
 * Every stop carries both a sortable target (reorders) and a slot target
 * (arrivals), overlapping in space; this picks the one the active drag means.
 */
const preferQueueTargets: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  if (asStageDragData(args.active.data.current)?.type === "stage-queue-row") {
    return collisions.filter((collision) => dropTypeOf(collision) === "stage-queue-row");
  }
  const slots = collisions.filter((collision) => dropTypeOf(collision) !== "stage-queue-row");
  const slot = slots.find((collision) => dropTypeOf(collision) === "stage-queue-slot");
  return slot ? [slot, ...slots.filter((collision) => collision !== slot)] : slots;
};

/** Dropping a stop outside the queue is a no-op, not a removal; the row's own remove button handles that. */
export function StageDndContext({ children }: { children: ReactNode }) {
  const [dragged, setDragged] = useState<StageDragData | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: DRAG_ACTIVATION }));

  const handleDragStart = (event: DragStartEvent) => {
    setDragged(asStageDragData(event.active.data.current) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragged(null);
    const drag = asStageDragData(event.active.data.current);
    const drop = asStageDropData(event.over?.data.current);
    if (!drag || !drop) {
      return;
    }
    const { ids, add, insertAt, reorder } = usePresentQueueStore.getState();
    if (drag.type === "stage-queue-row") {
      if (drop.type === "stage-queue-row") {
        const next = moveToIndex(ids, drag.index, drop.index);
        if (next) {
          reorder(next);
        }
      }
      return;
    }
    if (drop.type === "stage-queue-slot") {
      insertAt(drag.printing.id, drop.index);
      return;
    }
    if (drop.type === "stage-queue") {
      add(drag.printing.id);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={preferQueueTargets}
      modifiers={dragged?.type === "stage-queue-row" ? QUEUE_ROW_MODIFIERS : undefined}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragged(null)}
    >
      <DndScrollWatcher />
      {children}
      {/* dnd-kit measures the overlay whenever mounted; useSortable then stops moving
          the dragged row. Keep it unmounted rather than empty when nothing is dragged. */}
      {dragged?.type === "stage-pool-card" && (
        <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={null}>
          <CardDragGhost
            printings={[dragged.printing]}
            label={dragged.printing.card.name}
            className="opacity-90"
          />
        </DragOverlay>
      )}
    </DndContext>
  );
}
