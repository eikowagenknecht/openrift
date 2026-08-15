import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { Card, Printing } from "@openrift/shared";
import { MAX_TIER_ROWS } from "@openrift/shared/contracts/tier-lists";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EllipsisVerticalIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { resolveTierRows, TierRowFrame } from "@/components/tier-lists/tier-board";
import { TierCardPrintingMenu } from "@/components/tier-lists/tier-card-printing-menu";
import type { TierCardView } from "@/components/tier-lists/tier-card-tile";
import { TierCardTile, useTierTileWidth } from "@/components/tier-lists/tier-card-tile";
import type {
  BoardCardDragData,
  RowHandleDragData,
  TierCardDropData,
  TierRowDropData,
} from "@/components/tier-lists/tier-list-dnd-types";
import type { TierPickerRow } from "@/components/tier-lists/tier-picker";
import { TierPicker } from "@/components/tier-lists/tier-picker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pressable } from "@/components/ui/pressable";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useTierListBuilderStore } from "@/stores/tier-list-builder-store";

/** Longest row label the chip can show; matches the contract's cap. */
const MAX_LABEL_LENGTH = 24;

/**
 * Width of the row drag handle, shared with the spacer the unranked row puts in
 * its place so both stay the same size and every label chip lines up.
 */
const ROW_HANDLE_WIDTH = "w-5 shrink-0";

interface TierBoardEditorProps {
  cardsById: Record<string, Card>;
  printingsByCardId: Map<string, Printing[]>;
  /**
   * True on touch: drag is disabled and each tile opens the tier picker
   * instead, so a card can be moved or unranked without a drag.
   */
  tapToAssign: boolean;
  /** Called as the pointer enters and leaves a tile, for the floating preview. */
  onHoverCard?: (view: TierCardView | null) => void;
}

/**
 * The editable board. Rows are drop targets, cards on them are both drag
 * sources and drop targets (so releasing over a card inserts before it, which
 * is what gives ordering within a row without a sortable context per row), and
 * each row carries a handle so the ladder itself can be restacked.
 *
 * Reads rows straight from the builder store rather than taking them as props:
 * the board is the one surface that must re-render on every drag, so there is
 * nothing to gain by lifting that state and a prop chain to keep in sync if we did.
 *
 * @returns The editable board node.
 */
export function TierBoardEditor({
  cardsById,
  printingsByCardId,
  tapToAssign,
  onHoverCard,
}: TierBoardEditorProps) {
  const rows = useTierListBuilderStore((state) => state.rows);
  const addRow = useTierListBuilderStore((state) => state.addRow);
  const addUnrankedRow = useTierListBuilderStore((state) => state.addUnrankedRow);
  const resolved = resolveTierRows(rows, cardsById, printingsByCardId);
  const hasUnranked = rows.some((row) => row.unranked === true);
  const roomForMore = rows.length < MAX_TIER_ROWS;

  return (
    <div className="flex flex-col gap-1.5">
      {resolved.map((row, rowIndex) => (
        <EditableTierRow
          key={rowIndex}
          rowIndex={rowIndex}
          label={row.label}
          unranked={row.unranked}
          cards={row.cards}
          rowCount={resolved.length}
          hasUnranked={hasUnranked}
          tapToAssign={tapToAssign}
          onHoverCard={onHoverCard}
        />
      ))}
      {roomForMore && (
        <div className="flex gap-1.5">
          <Button variant="outline" className="flex-1 border-dashed" onClick={addRow}>
            <PlusIcon />
            Add a tier
          </Button>
          {!hasUnranked && (
            // The cut pile: a place for cards the creator considered and passed
            // on, so a viewer of the finished board can tell "not ranked" from
            // "never looked at".
            <Button variant="outline" className="flex-1 border-dashed" onClick={addUnrankedRow}>
              <PlusIcon />
              Add an unranked row
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

interface EditableTierRowProps {
  rowIndex: number;
  label: string;
  /** The grey cut pile, which is pinned to the bottom and cannot be reordered. */
  unranked?: boolean;
  cards: TierCardView[];
  rowCount: number;
  /** Whether the board carries an unranked row, which no ranked row may move below. */
  hasUnranked: boolean;
  tapToAssign: boolean;
  onHoverCard?: (view: TierCardView | null) => void;
}

function EditableTierRow({
  rowIndex,
  label,
  unranked,
  cards,
  rowCount,
  hasUnranked,
  tapToAssign,
  onHoverCard,
}: EditableTierRowProps) {
  const renameRow = useTierListBuilderStore((state) => state.renameRow);
  const removeRow = useTierListBuilderStore((state) => state.removeRow);
  const moveRow = useTierListBuilderStore((state) => state.moveRow);
  const tileWidth = useTierTileWidth();

  const dropData: TierRowDropData = { type: "tier-row", rowIndex };
  const { setNodeRef, isOver } = useDroppable({ id: `tier-row-${rowIndex}`, data: dropData });

  const labelControl = (
    <Textarea
      value={label}
      rows={1}
      maxLength={MAX_LABEL_LENGTH}
      aria-label={`Tier ${rowIndex + 1} label`}
      // A tier label is one line of text however many lines it wraps onto, so
      // Enter is swallowed and a pasted newline collapses to a space.
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
        }
      }}
      onChange={(event) => renameRow(rowIndex, event.target.value.replaceAll(/\s*\n\s*/gu, " "))}
      // A textarea rather than an Input: an input scrolls its text sideways and
      // hides the tail, while `field-sizing-content` lets this wrap and grow.
      // Transparent so the chip's tier colour shows through: the control *is*
      // the chip, rather than something sitting on top of one.
      className="min-h-0 resize-none border-0 bg-transparent px-0 py-0 text-center font-bold wrap-anywhere shadow-none focus-visible:ring-0 dark:bg-transparent"
    />
  );

  // The handle is the only drag source for a row: the label is an editable
  // control and the tiles are their own drag sources, so neither can double as
  // one. Hidden while tap-to-assign is on, where the menu does the reordering.
  // The unranked row is pinned to the bottom, so it gets no grip either — but it
  // still reserves the grip's width, or its label chip would sit a grip further
  // left than every chip above it.
  let handle: ReactNode;
  if (!tapToAssign) {
    handle =
      unranked === true ? (
        <div aria-hidden className={ROW_HANDLE_WIDTH} />
      ) : (
        <RowDragHandle rowIndex={rowIndex} label={label} />
      );
  }

  // A ranked row can only move down into another ranked slot: the last index
  // belongs to the cut pile when the board has one.
  const lastMovableIndex = hasUnranked ? rowCount - 2 : rowCount - 1;

  // A menu rather than a stack of icon buttons: three stacked buttons are
  // taller than the row itself, and reordering is a rare action next to
  // dragging cards.
  const controls = (
    <div className="flex shrink-0 items-center pr-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Tier ${label} options`}>
              <EllipsisVerticalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {unranked !== true && (
            <>
              <DropdownMenuItem
                disabled={rowIndex === 0}
                onClick={() => moveRow(rowIndex, rowIndex - 1)}
              >
                <ChevronUpIcon />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={rowIndex >= lastMovableIndex}
                onClick={() => moveRow(rowIndex, rowIndex + 1)}
              >
                <ChevronDownIcon />
                Move down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem variant="destructive" onClick={() => removeRow(rowIndex)}>
            <Trash2Icon />
            {unranked === true
              ? cards.length > 0
                ? "Remove row and return its cards to the pool"
                : "Remove row"
              : cards.length > 0
                ? "Remove tier and unrank its cards"
                : "Remove tier"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div ref={setNodeRef}>
      <TierRowFrame
        rowIndex={rowIndex}
        unranked={unranked}
        label={labelControl}
        leading={handle}
        trailing={controls}
        active={isOver}
      >
        {cards.length === 0 ? (
          <span className="text-muted-foreground px-1 text-sm italic">
            {tapToAssign ? "Tap a card below to rank it" : "Drop cards here"}
          </span>
        ) : (
          cards.map((view, position) => (
            <BoardCard
              key={view.cardId}
              view={view}
              rowIndex={rowIndex}
              position={position}
              width={tileWidth}
              tapToAssign={tapToAssign}
              onHoverCard={onHoverCard}
            />
          ))
        )}
      </TierRowFrame>
    </div>
  );
}

/**
 * The grip that drags a whole row. Sits before the label chip so the ladder's
 * rungs all present the same grab point, and so a drag never starts on the
 * label's text cursor.
 * @returns The handle node.
 */
function RowDragHandle({ rowIndex, label }: { rowIndex: number; label: string }) {
  const dragData: RowHandleDragData = { type: "tier-row-handle", rowIndex };
  // Destructure before JSX — member access on a dnd-kit hook's return in render
  // makes the React Compiler bail (see CLAUDE.md / DraggableCard).
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `tier-row-handle-${rowIndex}`,
    data: dragData,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-label={`Reorder tier ${label}`}
      // touch-none: the PointerSensor needs the browser to keep sending pointer
      // events rather than scrolling the page from the grip.
      className={cn(
        "text-muted-foreground hover:text-foreground flex cursor-grab touch-none items-center justify-center active:cursor-grabbing",
        ROW_HANDLE_WIDTH,
      )}
      style={isDragging ? { opacity: 0.4 } : undefined}
    >
      <GripVerticalIcon className="size-4" />
    </div>
  );
}

interface BoardCardProps {
  view: TierCardView;
  rowIndex: number;
  position: number;
  width: number;
  tapToAssign: boolean;
  onHoverCard?: (view: TierCardView | null) => void;
}

/**
 * A card sitting on the board. Both a drag source and a drop target: dropping
 * another card over it inserts before it, which is how a row gets ordered. In
 * tap-to-assign mode the tile opens the tier picker instead, same as the pool
 * cell's pill. Right-click picks which printing supplies the art.
 *
 * @returns The board card node.
 */
function BoardCard({ view, rowIndex, position, width, tapToAssign, onHoverCard }: BoardCardProps) {
  const dragData: BoardCardDragData = {
    type: "tier-board-card",
    cardId: view.cardId,
  };
  const dropData: TierCardDropData = { type: "tier-card", cardId: view.cardId, rowIndex, position };

  // Labels captured at open, not subscribed — see PoolCardStrip for why.
  const [picker, setPicker] = useState<{ open: boolean; rows: TierPickerRow[] }>({
    open: false,
    rows: [],
  });
  const assign = useTierListBuilderStore((state) => state.assign);
  const unassign = useTierListBuilderStore((state) => state.unassign);

  // Destructure both hook returns into locals before JSX: member access on a
  // dnd-kit hook's return object in render makes the React Compiler bail with a
  // refs-during-render error (see CLAUDE.md / DraggableCard).
  const {
    setNodeRef: setDragRef,
    listeners,
    attributes,
    isDragging,
  } = useDraggable({
    id: `tier-board-card-${view.cardId}`,
    data: dragData,
    disabled: tapToAssign,
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: `tier-card-slot-${view.cardId}`,
    data: dropData,
    disabled: tapToAssign,
  });

  if (tapToAssign) {
    return (
      <TierPicker
        rows={picker.rows}
        cardName={view.card.name}
        currentRowIndex={rowIndex}
        onPick={(target) => assign(view.cardId, target)}
        onUnrank={() => unassign(view.cardId)}
        open={picker.open}
        onOpenChange={(open) => {
          setPicker({
            open,
            rows: open
              ? useTierListBuilderStore
                  .getState()
                  .rows.map((row) => ({ label: row.label, unranked: row.unranked }))
              : [],
          });
        }}
        trigger={
          <Pressable aria-label={`Move ${view.card.name}`} className="rounded-sm">
            <TierCardTile view={view} width={width} />
          </Pressable>
        }
      />
    );
  }

  return (
    <TierCardPrintingMenu cardId={view.cardId} pinnedPrintingId={view.pinnedPrintingId}>
      <div ref={setDropRef}>
        <div
          ref={setDragRef}
          {...listeners}
          {...attributes}
          onMouseEnter={() => onHoverCard?.(view)}
          onMouseLeave={() => onHoverCard?.(null)}
          // dnd-kit's PointerSensor needs the browser to keep sending pointer
          // events; the default touch-action would pan the page instead.
          className="cursor-grab touch-none active:cursor-grabbing"
          style={isDragging ? { opacity: 0.4 } : undefined}
        >
          <TierCardTile view={view} width={width} />
        </div>
      </div>
    </TierCardPrintingMenu>
  );
}
