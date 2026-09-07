import { useDraggable } from "@dnd-kit/core";
import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";
import { MinusIcon, PlusIcon } from "lucide-react";

import { CountPill } from "@/components/ui/count-pill";
import { CardCell } from "@/features/cards/components/card-cell";
import { CardStrip, StripIconButton } from "@/features/cards/components/card-strip";
import type { PickerCellProps } from "@/features/cards/components/picker-card-browser";
import { PickerCardBrowser } from "@/features/cards/components/picker-card-browser";
import type { StagePoolCardDragData } from "@/features/stage/components/stage-dnd-types";
import { MAX_QUEUE_LENGTH } from "@/features/stage/lib/presentation-queue";
import { usePresentQueueStore } from "@/features/stage/stores/present-queue-store";
import { useIsMobile } from "@/hooks/use-is-mobile";

export function PresentCardBrowser() {
  return <PickerCardBrowser cell={QueueCardCell} detailActions={queueDetailActions} />;
}

function queueDetailActions(printing: Printing) {
  return <QueueCardStrip printing={printing} />;
}

/** Subscribes only to its own printing's count: subscribing to the whole queue would re-render every cell on any add. */
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
  // Destructure before JSX: member access on the hook's return object in
  // render makes the React Compiler bail.
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `stage-pool-card-${item.printing.id}`,
    data: dragData,
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
        // No draggable wrap on touch: `touch-none` would make the grid
        // impossible to pan from a card.
        isMobile ? undefined : (
          <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className="touch-none"
            style={isDragging ? { opacity: 0.4 } : undefined}
          />
        )
      }
    />
  );
}
