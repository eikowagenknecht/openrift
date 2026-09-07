import { useDroppable } from "@dnd-kit/core";

import { useCards } from "@/features/cards/hooks/use-cards";
import { QueueList } from "@/features/stage/components/card-queue-editor";
import type { QueueSource } from "@/features/stage/components/queue-source-picker";
import { QueueSourcePicker } from "@/features/stage/components/queue-source-picker";
import { MAX_QUEUE_LENGTH } from "@/features/stage/lib/presentation-queue";
import { usePresentQueueStore } from "@/features/stage/stores/present-queue-store";
import { cn } from "@/lib/utils";

/** The whole list is a drop target: a card released anywhere over it goes on the end, over a stop it goes there instead. */
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
          ids.length === 0 ? "min-h-24 p-3" : "-m-1 p-1",
          isOver && "ring-ring ring-2",
        )}
      >
        {ids.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing queued yet. Drag cards here or add them with +.
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
