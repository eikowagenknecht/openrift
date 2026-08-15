import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Printing } from "@openrift/shared";
import { getOrientation, legendDisplayName } from "@openrift/shared";
import { ChevronDownIcon, ChevronUpIcon, GripVerticalIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { PrintingVariantLabel } from "@/components/cards/printing-label";
import type { StageQueueRowData } from "@/components/present/stage-dnd-types";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { moveQueueEntry } from "@/lib/card-queue-search";
import { formatPublicCode } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Small square card thumbnail for the queue rows.
 * @returns The thumbnail, or a name-only placeholder when the printing has no art.
 */
function QueueThumb({ printing }: { printing: Printing }) {
  return (
    // Card-shaped, unlike the app's list rows: the queue mirrors what the stage
    // will put on screen, so each entry reads as the whole card.
    <CardArtThumb
      imageId={printing.images[0]?.imageId}
      variant="400w"
      className="w-8"
      loading="lazy"
      landscape={getOrientation(printing.card.types) === "landscape"}
      rarity={printing.rarity}
      domains={printing.card.domains}
      fallback={
        <span className="bg-muted text-2xs text-muted-foreground absolute inset-0 flex items-center justify-center p-0.5 text-center leading-tight">
          {printing.card.name.slice(0, 8)}
        </span>
      }
    />
  );
}

/**
 * Sortable id for the queue entry at `index`. The same card may sit in the
 * queue more than once, so the printing id alone would not be unique — the
 * position disambiguates, and positions only change on drop, after dnd-kit is
 * done with them.
 *
 * @returns The row's sortable id.
 */
function rowId(id: string, index: number): string {
  return `${id}-${index}`;
}

/**
 * One queue entry: a drag handle, its position, the card, and the move /
 * remove controls.
 *
 * The up/down buttons are not redundant with the handle — they are the
 * keyboard and screen-reader path to the same reorder, which a pointer-only
 * grip would leave with no equivalent.
 *
 * @returns The queue row.
 */
function QueueRow({
  id,
  index,
  printing,
  siblings,
  isLast,
  onMove,
  onRemove,
  rowAction,
}: {
  id: string;
  index: number;
  printing: Printing;
  /** The card's other printings, so the variant label knows what distinguishes this one. */
  siblings: Printing[];
  isLast: boolean;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: (index: number) => void;
  rowAction?: (printing: Printing, index: number) => ReactNode;
}) {
  const rowData: StageQueueRowData = { type: "stage-queue-row", index };
  // Destructure into locals before JSX: the React Compiler reads member access
  // on the hook's return object (sortable.listeners, …) as a ref read during
  // render and bails on the file. Same rule as SortableSidebarRow.
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    attributes,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rowId(id, index), data: rowData });
  // The target a card arriving from the browser lands on. Separate from the
  // sortable above, and on an inner element so both can be measured — see
  // StageQueueSlotDropData for why they cannot be the same droppable.
  const { setNodeRef: setSlotRef, isOver: isSlotOver } = useDroppable({
    id: `stage-queue-slot-${index}`,
    data: { type: "stage-queue-slot", index },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card ring-border relative flex items-center gap-3 rounded-md p-2 ring-1",
        // Where the card would land: above this stop, so the line goes on top.
        isSlotOver &&
          "before:bg-primary before:absolute before:inset-x-0 before:-top-0.5 before:h-0.5 before:rounded-full",
      )}
    >
      <div ref={setSlotRef} className="pointer-events-none absolute inset-0" />
      {/* oxlint-disable-next-line react/forbid-elements -- dnd-kit drag activator, needs the raw ref + listeners */}
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        aria-label={`Reorder ${printing.card.name}`}
        className={cn(
          "text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-md outline-hidden",
          "cursor-grab active:cursor-grabbing",
          // dnd-kit's PointerSensor needs the browser to keep sending pointer
          // events; the default touch-action scrolls the page instead and the
          // pointercancel aborts the drag before it activates.
          "touch-none",
          "focus-visible:ring-ring focus-visible:ring-2",
        )}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <span className="text-muted-foreground w-6 shrink-0 text-center font-mono text-sm tabular-nums">
        {index + 1}
      </span>
      <QueueThumb printing={printing} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{legendDisplayName(printing.card)}</span>
        {/* Which variant is queued. Two entries for the same card only differ
            here, so without it a deliberately-picked promo is invisible. */}
        <PrintingVariantLabel
          printing={printing}
          siblings={siblings}
          code={<span className="font-mono">{formatPublicCode(printing)}</span>}
          className="text-muted-foreground text-sm"
        />
      </div>
      {rowAction?.(printing, index)}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onMove(index, -1)}
        disabled={index === 0}
        aria-label={`Move ${printing.card.name} earlier`}
      >
        <ChevronUpIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onMove(index, 1)}
        disabled={isLast}
        aria-label={`Move ${printing.card.name} later`}
      >
        <ChevronDownIcon className="size-4" />
      </Button>
      <ChipRemoveButton
        onClick={() => onRemove(index)}
        aria-label={`Remove ${printing.card.name} from the queue`}
      />
    </li>
  );
}

/**
 * The assembled queue, reorderable by dragging a row's grip or by the per-row
 * up/down buttons, and fillable by dragging a card in from the browser beside
 * it.
 *
 * The drags themselves are owned by {@link StageDndContext} rather than by a
 * context of this list's own: a card arriving from the browser starts outside
 * the queue, and only one context can see both ends of that. This list supplies
 * the targets and keeps the button path, which is the keyboard and
 * screen-reader equivalent of the grip.
 *
 * @returns The ordered queue list.
 */
export function QueueList({
  ids,
  printingsById,
  printingsByCardId,
  onChange,
  rowAction,
}: {
  ids: readonly string[];
  printingsById: Record<string, Printing | undefined>;
  printingsByCardId: Map<string, Printing[]>;
  onChange: (ids: string[]) => void;
  rowAction?: (printing: Printing, index: number) => ReactNode;
}) {
  const rowIds = ids.map((id, index) => rowId(id, index));

  const handleMove = (index: number, delta: -1 | 1) => onChange(moveQueueEntry(ids, index, delta));
  const handleRemove = (index: number) => onChange(ids.filter((_unused, at) => at !== index));

  return (
    <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
      <ol className="flex flex-col gap-1">
        {ids.map((id, index) => {
          const printing = printingsById[id];
          if (!printing) {
            return null;
          }
          return (
            <QueueRow
              key={rowId(id, index)}
              id={id}
              index={index}
              printing={printing}
              siblings={printingsByCardId.get(printing.cardId) ?? []}
              isLast={index === ids.length - 1}
              onMove={handleMove}
              onRemove={handleRemove}
              rowAction={rowAction}
            />
          );
        })}
      </ol>
    </SortableContext>
  );
}
