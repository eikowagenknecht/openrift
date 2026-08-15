import { useDroppable } from "@dnd-kit/core";

import { QueueList } from "@/components/present/card-queue-editor";
import type { QueueSource } from "@/components/present/queue-source-picker";
import { QueueSourcePicker } from "@/components/present/queue-source-picker";
import { useCards } from "@/hooks/use-cards";
import { MAX_QUEUE_LENGTH } from "@/lib/presentation-queue";
import { cn } from "@/lib/utils";
import { usePresentQueueStore } from "@/stores/present-queue-store";

/**
 * The queue being assembled: the bulk-fill sources, then the ordered list of
 * stops with its drag handles and per-row controls.
 *
 * The whole list is a drop target, so a card dragged out of the browser and
 * released anywhere over it goes on the end; releasing it on a stop puts it
 * there instead. Dragging is what the empty queue advertises, since a creator
 * with nothing queued yet has no rows to aim at.
 *
 * Rendered as the `aside` of a {@link BuilderWorkbench}, which owns why this is
 * the sticky, inner-scrolled column and the browser beside it is not.
 *
 * @returns The queue panel.
 */
export function PresentQueuePanel({ onAdd }: { onAdd: (source: QueueSource) => void }) {
  const { printingsById, printingsByCardId } = useCards();
  const ids = usePresentQueueStore((state) => state.ids);
  const reorder = usePresentQueueStore((state) => state.reorder);
  const { setNodeRef, isOver } = useDroppable({ id: "stage-queue", data: { type: "stage-queue" } });

  return (
    <div className="flex flex-col gap-4">
      <QueueSourcePicker onAdd={onAdd} />

      <div
        ref={setNodeRef}
        className={cn(
          "rounded-md transition-colors",
          // Room for the ring to sit off the content, so it never overlaps the
          // first row's own.
          ids.length === 0 ? "min-h-24 p-3" : "-m-1 p-1",
          isOver && "ring-ring ring-2",
        )}
      >
        {ids.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing queued yet. Drag cards here from the browser, pick them with the plus button, or
            pull in a deck or an organize list and trim it down.
          </p>
        ) : (
          <QueueList
            ids={ids}
            printingsById={printingsById}
            printingsByCardId={printingsByCardId}
            onChange={reorder}
          />
        )}
      </div>

      {ids.length >= MAX_QUEUE_LENGTH && (
        <p className="text-muted-foreground text-sm">
          The queue holds {MAX_QUEUE_LENGTH} cards. Remove one to add another.
        </p>
      )}
    </div>
  );
}
