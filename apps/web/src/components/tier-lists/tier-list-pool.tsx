import { useDraggable, useDroppable } from "@dnd-kit/core";
import { TIER_LABEL_INK, tierRowColor } from "@openrift/shared/tier-colors";
import type { Printing } from "@openrift/shared/types/catalog";
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

function poolDetailActions(printing: Printing, view: "cards" | "printings") {
  return (
    <PoolCardStrip
      cardId={printing.cardId}
      cardName={printing.card.name}
      printingId={view === "printings" ? printing.id : undefined}
    />
  );
}

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

  const printingId = view === "printings" ? item.printing.id : undefined;
  const dragData: PoolCardDragData = { type: "tier-pool-card", cardId, printingId };
  // Destructure before JSX: member access on the hook's return object in render
  // makes the React Compiler bail.
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
        // On touch, no draggable wrap: the wrap's touch-none would block
        // panning the grid, so ranking goes through the pill instead.
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

function PoolCardStrip({
  cardId,
  cardName,
  printingId,
}: {
  cardId: string;
  cardName: string;
  printingId?: string;
}) {
  // Captured on open, not subscribed: a `rows.map(...)` selector would never
  // compare equal and would re-render every cell on every drag.
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
