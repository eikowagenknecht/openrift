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

/**
 * Pointer travel before a press becomes a drag. Enough that a click on a card
 * still reads as a click, and that a click on a stop's grip doesn't register as
 * a zero-length drag and swallow the focus ring.
 */
const DRAG_ACTIVATION = { distance: 8 };

/**
 * A stop being reordered is held to the list it came from, so it can't be
 * flicked out into the browser beside it. A card arriving from the browser has
 * to cross the page to reach the queue, so it gets no modifiers at all.
 */
const QUEUE_ROW_MODIFIERS: Modifier[] = [restrictToVerticalAxis, restrictToParentElement];

/** @returns The drop payload behind a collision, when it is one of ours. */
function dropTypeOf(collision: Collision): string | undefined {
  return asStageDropData(collisionDropData(collision))?.type;
}

/**
 * Hands each drag the targets that belong to it. The two kinds overlap in
 * space — every stop carries a sortable target for reorders and a slot target
 * for arrivals — so without this the wrong one wins and the drop means
 * something the creator didn't ask for.
 *
 * @returns The collisions the active drag can land on, best first.
 */
const preferQueueTargets: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  if (asStageDragData(args.active.data.current)?.type === "stage-queue-row") {
    // Only other stops. The queue's own drop zone is a target for arrivals,
    // and letting a reorder land on it would move the stop nowhere.
    return collisions.filter((collision) => dropTypeOf(collision) === "stage-queue-row");
  }
  // A card from the browser aims at the slots, never at the sortable rows —
  // landing on one of those would be a drop the handler has no meaning for.
  // Slots first, so a release over a stop places the card there rather than on
  // the end.
  const slots = collisions.filter((collision) => dropTypeOf(collision) !== "stage-queue-row");
  const slot = slots.find((collision) => dropTypeOf(collision) === "stage-queue-slot");
  return slot ? [slot, ...slots.filter((collision) => collision !== slot)] : slots;
};

/**
 * Wires the stage builder's drag interactions to the queue store. A card
 * dragged out of the catalogue browser has two outcomes, decided by what the
 * pointer is over on release:
 *
 * - a stop in the queue → the card goes in at that position;
 * - anywhere else on the queue → the card goes on the end.
 *
 * A stop dragged by its grip has one: release over another stop moves it there.
 *
 * A release over nothing is a no-op. Dropping a stop outside the queue does not
 * remove it — the row's own remove button is that, and an accidental release
 * should not quietly shorten a queue someone spent a while assembling.
 *
 * @returns The drag context wrapping `children`.
 */
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
      {/* The queue sits in the workbench's sticky aside, whose droppable rects
          drift as the browser beside it scrolls. */}
      <DndScrollWatcher />
      {children}
      {/* Only an arriving card rides the cursor; a stop being reordered travels
          in place, which is what the list's sortable transforms already do.
          Mounted per drag rather than left up with null children: dnd-kit
          measures the overlay whenever the element exists, and `useSortable`
          reads that measurement as "this list uses an overlay" and stops moving
          the dragged row at all. */}
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
