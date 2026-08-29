import { useDraggable } from "@dnd-kit/core";
import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { MinusIcon, PlusIcon } from "lucide-react";

import { CardCell } from "@/components/cards/card-cell";
import { CardStrip, StripIconButton } from "@/components/cards/card-strip";
import type { PickerCellProps } from "@/components/cards/picker-card-browser";
import { PickerCardBrowser } from "@/components/cards/picker-card-browser";
import type { StagePoolCardDragData } from "@/components/present/stage-dnd-types";
import { CountPill } from "@/components/ui/count-pill";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { MAX_QUEUE_LENGTH } from "@/lib/presentation-queue";
import { usePresentQueueStore } from "@/stores/present-queue-store";

/**
 * The catalogue as the shared picker browser, with an add control on every cell.
 *
 * This is how a queue gets built: filter to a set, a domain, a keyword, or
 * whatever the segment is about, then pick the cards individually — with the
 * plus button, or by dragging the card over to the queue. The printings view is
 * deliberately left available — which printing goes on the stage is often the
 * whole point of showing it.
 *
 * @returns The browser node.
 */
export function PresentCardBrowser() {
  return <PickerCardBrowser cell={QueueCardCell} detailActions={queueDetailActions} />;
}

/**
 * Rebuilds the cell's add control for the card shown in the detail pane, drawer
 * or modal. Printing-scoped either way: a queue stop is one printing, so there
 * is no cards-view variant of this control.
 * @returns The add control for that printing.
 */
function queueDetailActions(printing: Printing) {
  return <QueueCardStrip printing={printing} />;
}

/**
 * The queue cell's add control: how many times this printing is queued, with a
 * plus to add another stop and a minus to take the last one back.
 *
 * Subscribes to its own printing's count rather than the queue, so an add
 * re-renders the one cell that changed instead of the whole grid — the same
 * reason the tier-list pool subscribes per card (see CLAUDE.md).
 *
 * @returns The strip node.
 */
function QueueCardStrip({ printing }: { printing: Printing }) {
  const queued = usePresentQueueStore((state) => state.countByPrintingId.get(printing.id) ?? 0);
  const isFull = usePresentQueueStore((state) => state.ids.length >= MAX_QUEUE_LENGTH);
  const add = usePresentQueueStore((state) => state.add);
  const removePrinting = usePresentQueueStore((state) => state.removePrinting);

  return (
    <CardStrip
      left={
        queued > 0 && (
          <StripIconButton
            aria-label={`Remove ${legendDisplayName(printing.card)} from the queue`}
            onClick={() => removePrinting(printing.id)}
          >
            <MinusIcon className="size-3" />
          </StripIconButton>
        )
      }
      center={
        queued > 0 && (
          <CountPill variant="primary" title={`${queued} in the queue`}>
            <span>{queued}</span>
            <span className="sr-only">in the queue</span>
          </CountPill>
        )
      }
      right={
        <StripIconButton
          aria-label={`Add ${legendDisplayName(printing.card)} to the queue`}
          disabled={isFull}
          onClick={() => add(printing.id)}
        >
          <PlusIcon className="size-3" />
        </StripIconButton>
      }
    />
  );
}

/**
 * One cell of the queue browser. Dimmed once the printing is queued, so a
 * creator scanning a set can see at a glance what they have already picked, and
 * draggable straight into the queue beside it.
 *
 * @returns The card cell.
 */
function QueueCardCell({
  item,
  ctx,
  display,
  showImages,
  view,
  siblings,
  priceRange,
  onClick,
}: PickerCellProps) {
  const queued = usePresentQueueStore(
    (state) => (state.countByPrintingId.get(item.printing.id) ?? 0) > 0,
  );
  const isFull = usePresentQueueStore((state) => state.ids.length >= MAX_QUEUE_LENGTH);
  const isMobile = useIsMobile();

  const dragData: StagePoolCardDragData = { type: "stage-pool-card", printing: item.printing };
  // Destructure before JSX: member access on the hook's return object in render
  // makes the React Compiler bail (see CLAUDE.md / DraggableCard).
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `stage-pool-card-${item.printing.id}`,
    data: dragData,
    // A full queue has nowhere for the card to land, and the plus button is
    // already off for the same reason.
    disabled: isMobile || isFull,
  });

  return (
    <CardCell
      printing={item.printing}
      ctx={ctx}
      display={display}
      showImages={showImages}
      view={view}
      onClick={onClick}
      siblings={siblings}
      priceRange={priceRange}
      dimmed={queued}
      strip={<QueueCardStrip printing={item.printing} />}
      wrap={
        // On touch, no draggable wrap at all (same as the tier-list pool):
        // queuing goes through the plus button, and the wrap's `touch-none`
        // would make the grid impossible to pan from a card.
        isMobile ? undefined : (
          <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            // The PointerSensor needs the browser to keep sending pointer
            // events; the default touch-action would pan the grid instead.
            className="touch-none"
            style={isDragging ? { opacity: 0.4 } : undefined}
          />
        )
      }
    />
  );
}
