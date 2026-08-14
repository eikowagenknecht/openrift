import { QueueList } from "@/components/present/card-queue-editor";
import type { QueueSource } from "@/components/present/queue-source-picker";
import { QueueSourcePicker } from "@/components/present/queue-source-picker";
import { useCards } from "@/hooks/use-cards";
import { MAX_QUEUE_LENGTH } from "@/lib/presentation-queue";
import { usePresentQueueStore } from "@/stores/present-queue-store";

/**
 * The queue being assembled: the bulk-fill sources, then the ordered list of
 * stops with its drag handles and per-row controls.
 *
 * The column this lives in is the sticky one and the browser beside it is the
 * window-scrolled one, not the other way round — the browser is a virtualized
 * grid whose virtualizer reads the *window* scroller, so putting it in an inner
 * scroll container renders it empty. The queue is at most 120 rows, so it takes
 * the inner scroll and stays in view while the creator works through a set.
 *
 * @returns The queue panel.
 */
export function PresentQueuePanel({ onAdd }: { onAdd: (source: QueueSource) => void }) {
  const { printingsById, printingsByCardId } = useCards();
  const ids = usePresentQueueStore((state) => state.ids);
  const reorder = usePresentQueueStore((state) => state.reorder);

  return (
    <div className="flex flex-col gap-4">
      <QueueSourcePicker onAdd={onAdd} />

      {ids.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing queued yet. Pick cards from the browser, or pull in a deck or an organize list and
          trim it down.
        </p>
      ) : (
        <QueueList
          ids={ids}
          printingsById={printingsById}
          printingsByCardId={printingsByCardId}
          onChange={reorder}
        />
      )}

      {ids.length >= MAX_QUEUE_LENGTH && (
        <p className="text-muted-foreground text-sm">
          The queue holds {MAX_QUEUE_LENGTH} cards. Remove one to add another.
        </p>
      )}
    </div>
  );
}
