import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Printing } from "@openrift/shared";
import { getOrientation, legendDisplayName } from "@openrift/shared";
import { ChevronDownIcon, ChevronUpIcon, GripVerticalIcon, SearchIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useDeferredValue, useState } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { PrintingVariantLabel } from "@/components/cards/printing-label";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Input } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { useCards } from "@/hooks/use-cards";
import { moveQueueEntry, searchPrintingsByName } from "@/lib/card-queue-search";
import { formatPublicCode } from "@/lib/format";
import { moveToIndex } from "@/lib/move-to-index";
import { MAX_QUEUE_LENGTH } from "@/lib/presentation-queue";
import { cn } from "@/lib/utils";

/**
 * Small square card thumbnail for the picker and queue rows.
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
 * The result rows under the search box. One row per card — clicking it queues
 * the printing the viewer's language order puts first, which is what almost
 * every add wants. A card with more than one printing also gets a disclosure
 * chevron: open it and every variant of that card is individually queueable,
 * for the run where the promo or the alternate art is the point.
 *
 * @returns The scrollable result panel.
 */
function QueueSearchResults({
  results,
  printingsByCardId,
  isFull,
  expandedCardId,
  onToggleExpanded,
  onAdd,
  resultAction,
}: {
  results: readonly Printing[];
  printingsByCardId: Map<string, Printing[]>;
  isFull: boolean;
  expandedCardId: string | null;
  onToggleExpanded: (cardId: string) => void;
  onAdd: (printing: Printing) => void;
  resultAction?: (printing: Printing) => ReactNode;
}) {
  return (
    <div className="border-border max-h-72 overflow-y-auto rounded-md border">
      {results.length === 0 ? (
        <p className="text-muted-foreground p-3 text-sm">No cards match that.</p>
      ) : (
        <ul>
          {results.map((printing) => {
            const siblings = printingsByCardId.get(printing.cardId) ?? [];
            const expanded = expandedCardId === printing.cardId;
            return (
              <li key={printing.id} className="border-border not-last:border-b">
                <div className="hover:bg-accent/50 flex items-center gap-1 pr-2">
                  <Pressable
                    onClick={() => onAdd(printing)}
                    disabled={isFull}
                    className="flex min-w-0 flex-1 items-center gap-3 p-2 disabled:opacity-50"
                  >
                    <QueueThumb printing={printing} />
                    <span className="min-w-0 flex-1 truncate">
                      {legendDisplayName(printing.card)}
                    </span>
                    <span className="text-muted-foreground font-mono text-sm">
                      {formatPublicCode(printing)}
                    </span>
                  </Pressable>
                  {siblings.length > 1 && (
                    <ExpandToggle
                      expanded={expanded}
                      onClick={() => onToggleExpanded(printing.cardId)}
                      aria-label={`Choose a printing of ${printing.card.name}`}
                      className="shrink-0 p-1"
                    />
                  )}
                  {resultAction?.(printing)}
                </div>
                {expanded && (
                  <ul className="bg-muted/40">
                    {siblings.map((sibling) => (
                      <li key={sibling.id}>
                        <Pressable
                          onClick={() => onAdd(sibling)}
                          disabled={isFull}
                          className="hover:bg-accent/50 flex w-full items-center py-1.5 pr-2 pl-14 text-sm disabled:opacity-50"
                        >
                          <PrintingVariantLabel
                            printing={sibling}
                            siblings={siblings}
                            code={<span className="font-mono">{formatPublicCode(sibling)}</span>}
                          />
                        </Pressable>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
  } = useSortable({ id: rowId(id, index) });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="bg-card ring-border relative flex items-center gap-3 rounded-md p-2 ring-1"
    >
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
 * up/down buttons.
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
  // A small activation distance so a click on the grip doesn't register as a
  // zero-length drag and swallow the focus ring.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const rowIds = ids.map((id, index) => rowId(id, index));

  const handleDragEnd = (event: DragEndEvent) => {
    const overId = event.over?.id;
    if (overId === undefined) {
      return;
    }
    const next = moveToIndex(
      ids,
      rowIds.indexOf(String(event.active.id)),
      rowIds.indexOf(String(overId)),
    );
    if (next) {
      onChange(next);
    }
  };

  const handleMove = (index: number, delta: -1 | 1) => onChange(moveQueueEntry(ids, index, delta));
  const handleRemove = (index: number) => onChange(ids.filter((_unused, at) => at !== index));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
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
    </DndContext>
  );
}

/**
 * Search-and-queue editor shared by presentation mode and the overlay
 * dashboard: a name/code search at the top, results below as full-width rows,
 * and the assembled queue underneath with move and remove controls.
 *
 * The caller owns the queue (a list of printing ids) so it can live in a URL,
 * a store, or server state as that surface needs. `rowAction` lets a surface
 * hang its own per-row control off a queue entry — the dashboard uses it for
 * "push this one live".
 *
 * @returns The queue editor.
 */
export function CardQueueEditor({
  ids,
  onChange,
  rowAction,
  resultAction,
  className,
}: {
  ids: readonly string[];
  onChange: (ids: string[]) => void;
  /** Extra control rendered at the end of each queue row. */
  rowAction?: (printing: Printing, index: number) => ReactNode;
  /**
   * Extra control at the end of each search-result row. The overlay dashboard
   * puts "push live" here, so a card the creator did not prepare still reaches
   * the stream in one tap.
   */
  resultAction?: (printing: Printing) => ReactNode;
  className?: string;
}) {
  const { allPrintings, printingsById, printingsByCardId } = useCards();
  const [query, setQuery] = useState("");
  // Which result row has its printing list open. One at a time: the panel is
  // short, and two open cards push the rest of the results out of reach.
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  // Deferred so a keystroke paints the input immediately; the whole-catalog
  // scan and the result-row rerender ride the lower-priority pass.
  const deferredQuery = useDeferredValue(query);

  const results = searchPrintingsByName(deferredQuery, allPrintings);
  const isFull = ids.length >= MAX_QUEUE_LENGTH;

  const add = (printing: Printing) => {
    if (isFull) {
      return;
    }
    onChange([...ids, printing.id]);
    setQuery("");
    setExpandedCardId(null);
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="relative">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a card by name or code…"
          aria-label="Search cards to add"
          className="pl-9"
          autoComplete="off"
        />
      </div>

      {deferredQuery.trim() !== "" && (
        <QueueSearchResults
          results={results}
          printingsByCardId={printingsByCardId}
          isFull={isFull}
          expandedCardId={expandedCardId}
          onToggleExpanded={(cardId) =>
            setExpandedCardId((current) => (current === cardId ? null : cardId))
          }
          onAdd={add}
          resultAction={resultAction}
        />
      )}

      {isFull && (
        <p className="text-muted-foreground text-sm">
          The queue holds {MAX_QUEUE_LENGTH} cards. Remove one to add another.
        </p>
      )}

      {ids.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing queued yet. Search above and pick the cards you want to show, in the order you
          want to show them.
        </p>
      ) : (
        <QueueList
          ids={ids}
          printingsById={printingsById}
          printingsByCardId={printingsByCardId}
          onChange={onChange}
          rowAction={rowAction}
        />
      )}
    </div>
  );
}
