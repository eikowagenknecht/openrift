import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { Printing } from "@openrift/shared";
import { TIER_LABEL_INK, tierRowColor } from "@openrift/shared";
import { useState } from "react";

import { CardCell } from "@/components/cards/card-cell";
import { CardStrip } from "@/components/cards/card-strip";
import type { PickerCellProps } from "@/components/cards/picker-card-browser";
import { PickerCardBrowser } from "@/components/cards/picker-card-browser";
import type { PoolCardDragData } from "@/components/tier-lists/tier-list-dnd-types";
import type { TierPickerRow } from "@/components/tier-lists/tier-picker";
import { TierPicker } from "@/components/tier-lists/tier-picker";
import { CountPillButton } from "@/components/ui/count-pill";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import { useTierListBuilderStore } from "@/stores/tier-list-builder-store";

/**
 * The card pool: the shared picker browser, with each cell carrying its current
 * tier. Cards stay in the pool once ranked (dimmed and badged rather than
 * removed) so a creator can see the whole set at a glance and re-rank without
 * hunting for what disappeared.
 *
 * The pool is itself a drop target: dragging a card back here unranks it.
 *
 * @returns The card pool node.
 */
export function TierListPool() {
  const { setNodeRef, isOver } = useDroppable({ id: "tier-pool", data: { type: "tier-pool" } });

  return (
    <PickerCardBrowser
      cell={PoolCardCell}
      detailActions={poolDetailActions}
      hideViewToggle
      containerRef={setNodeRef}
      className={cn("rounded-md transition-colors", isOver && "ring-ring ring-2")}
    />
  );
}

/**
 * Rebuilds the pool cell's rank pill for the card shown in the detail pane,
 * drawer or modal.
 * @returns The rank control for that printing.
 */
function poolDetailActions(printing: Printing, view: "cards" | "printings") {
  return (
    <PoolCardStrip
      cardId={printing.cardId}
      cardName={printing.card.name}
      // Same rule as the grid cell: a printings-view control stands for one
      // printing and pins it; a cards-view control stands for the card, so it
      // leaves whatever printing the entry already carries alone.
      printingId={view === "printings" ? printing.id : undefined}
    />
  );
}

/**
 * One pool cell. Subscribes to its own card's tier rather than the board, so a
 * drag re-renders the one cell that changed instead of the whole grid (see the
 * `rowIndexByCardId` note in the builder store).
 *
 * @returns The pool card cell.
 */
function PoolCardCell({
  item,
  ctx,
  display,
  showImages,
  view,
  siblings,
  priceRange,
  onClick,
}: PickerCellProps) {
  const cardId = item.printing.cardId;
  const rowIndex = useTierListBuilderStore((state) => state.rowIndexByCardId.get(cardId) ?? null);
  const isMobile = useIsMobile();

  // A printings-view cell is one specific printing, so ranking from it pins
  // that art; a cards-view cell stands for the card and leaves the pin alone.
  const printingId = view === "printings" ? item.printing.id : undefined;
  const dragData: PoolCardDragData = { type: "tier-pool-card", cardId, printingId };
  // Destructure before JSX: member access on the hook's return object in render
  // makes the React Compiler bail (see CLAUDE.md / DraggableCard).
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `tier-pool-card-${cardId}`,
    data: dragData,
    disabled: isMobile,
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
      dimmed={rowIndex !== null}
      strip={
        <PoolCardStrip cardId={cardId} cardName={item.printing.card.name} printingId={printingId} />
      }
      wrap={
        // On touch, no draggable wrap at all (same as DraggableCard): ranking
        // goes through the pill, and the wrap's `touch-none` would make the
        // whole grid impossible to pan from a card.
        isMobile ? undefined : (
          <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            // The PointerSensor needs the browser to keep sending pointer events;
            // the default touch-action would pan the grid instead.
            className="touch-none"
            style={isDragging ? { opacity: 0.4 } : undefined}
          />
        )
      }
    />
  );
}

/**
 * The pool cell's tier control: the card's current tier as a coloured pill, or
 * a "Rank" affordance when it is unranked. This is the tap path — the whole
 * builder works on a phone through it, where dragging is off.
 *
 * @returns The strip node.
 */
function PoolCardStrip({
  cardId,
  cardName,
  printingId,
}: {
  cardId: string;
  cardName: string;
  /** Printing this control stands for, when it stands for one; pinned on the entry. */
  printingId?: string;
}) {
  // Labels are captured when the picker opens rather than subscribed to. A
  // selector returning `rows.map(...)` builds a new array every time, so it
  // would never compare equal and every cell in the grid would re-render on
  // every drag — exactly what the per-cell `rowIndex` subscription avoids. The
  // board cannot be edited while a picker is open, so the snapshot can't go stale.
  const [picker, setPicker] = useState<{ open: boolean; rows: TierPickerRow[] }>({
    open: false,
    rows: [],
  });
  const rowIndex = useTierListBuilderStore((state) => state.rowIndexByCardId.get(cardId) ?? null);
  const assign = useTierListBuilderStore((state) => state.assign);
  const unassign = useTierListBuilderStore((state) => state.unassign);
  const label = useTierListBuilderStore((state) =>
    rowIndex === null ? null : (state.rows[rowIndex]?.label ?? null),
  );
  // Subscribed separately so the pill stays one primitive per selector: a
  // selector returning the whole row would never compare equal.
  const unranked = useTierListBuilderStore((state) =>
    rowIndex === null ? false : state.rows[rowIndex]?.unranked === true,
  );

  const handleOpenChange = (open: boolean) => {
    setPicker({
      open,
      rows: open
        ? useTierListBuilderStore
            .getState()
            .rows.map((row) => ({ label: row.label, unranked: row.unranked }))
        : [],
    });
  };

  return (
    <CardStrip
      center={
        <TierPicker
          rows={picker.rows}
          cardName={cardName}
          currentRowIndex={rowIndex}
          onPick={(index) => assign(cardId, index, { printingId })}
          onUnrank={() => unassign(cardId)}
          open={picker.open}
          onOpenChange={handleOpenChange}
          trigger={
            <CountPillButton
              aria-label={label === null ? `Rank ${cardName}` : `${cardName}: tier ${label}`}
              className="max-w-16 truncate font-bold"
              style={
                label === null
                  ? undefined
                  : {
                      backgroundColor: tierRowColor(rowIndex ?? 0, unranked),
                      color: TIER_LABEL_INK,
                    }
              }
            >
              {label ?? "Rank"}
            </CountPillButton>
          }
        />
      }
    />
  );
}
