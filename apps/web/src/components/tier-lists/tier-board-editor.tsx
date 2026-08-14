import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { Card, Printing } from "@openrift/shared";
import { MAX_TIER_ROWS } from "@openrift/shared/contracts/tier-lists";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";

import { resolveTierRows, TierRowFrame } from "@/components/tier-lists/tier-board";
import type { TierCardView } from "@/components/tier-lists/tier-card-tile";
import { TierCardTile } from "@/components/tier-lists/tier-card-tile";
import type {
  BoardCardDragData,
  TierCardDropData,
  TierRowDropData,
} from "@/components/tier-lists/tier-list-dnd-types";
import { TierPicker } from "@/components/tier-lists/tier-picker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { useTierListBuilderStore } from "@/stores/tier-list-builder-store";

/** Longest row label the chip can show; matches the contract's cap. */
const MAX_LABEL_LENGTH = 24;

interface TierBoardEditorProps {
  cardsById: Record<string, Card>;
  printingsByCardId: Map<string, Printing[]>;
  /**
   * True on touch: drag is disabled and each tile opens the tier picker
   * instead, so a card can be moved or unranked without a drag.
   */
  tapToAssign: boolean;
}

/**
 * The editable board. Rows are drop targets, cards on them are both drag
 * sources and drop targets (so releasing over a card inserts before it, which
 * is what gives ordering within a row without a sortable context per row).
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
}: TierBoardEditorProps) {
  const rows = useTierListBuilderStore((state) => state.rows);
  const addRow = useTierListBuilderStore((state) => state.addRow);
  const resolved = resolveTierRows(rows, cardsById, printingsByCardId);

  return (
    <div className="flex flex-col gap-1.5">
      {resolved.map((row, rowIndex) => (
        <EditableTierRow
          key={rowIndex}
          rowIndex={rowIndex}
          label={row.label}
          cards={row.cards}
          rowCount={resolved.length}
          tapToAssign={tapToAssign}
        />
      ))}
      {rows.length < MAX_TIER_ROWS && (
        <Button variant="outline" className="border-dashed" onClick={addRow}>
          <PlusIcon />
          Add a tier
        </Button>
      )}
    </div>
  );
}

interface EditableTierRowProps {
  rowIndex: number;
  label: string;
  cards: TierCardView[];
  rowCount: number;
  tapToAssign: boolean;
}

function EditableTierRow({ rowIndex, label, cards, rowCount, tapToAssign }: EditableTierRowProps) {
  const renameRow = useTierListBuilderStore((state) => state.renameRow);
  const removeRow = useTierListBuilderStore((state) => state.removeRow);
  const moveRow = useTierListBuilderStore((state) => state.moveRow);

  const dropData: TierRowDropData = { type: "tier-row", rowIndex };
  const { setNodeRef, isOver } = useDroppable({ id: `tier-row-${rowIndex}`, data: dropData });

  const labelControl = (
    <Input
      value={label}
      maxLength={MAX_LABEL_LENGTH}
      aria-label={`Tier ${rowIndex + 1} label`}
      onChange={(event) => renameRow(rowIndex, event.target.value)}
      // Transparent so the chip's tier colour shows through: the input *is* the
      // chip, rather than a control sitting on top of one.
      className="h-auto border-0 bg-transparent px-0 text-center font-bold shadow-none focus-visible:ring-0 dark:bg-transparent"
    />
  );

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
          <DropdownMenuItem
            disabled={rowIndex === 0}
            onClick={() => moveRow(rowIndex, rowIndex - 1)}
          >
            <ChevronUpIcon />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={rowIndex === rowCount - 1}
            onClick={() => moveRow(rowIndex, rowIndex + 1)}
          >
            <ChevronDownIcon />
            Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => removeRow(rowIndex)}>
            <Trash2Icon />
            {cards.length > 0 ? "Remove tier and unrank its cards" : "Remove tier"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div ref={setNodeRef}>
      <TierRowFrame rowIndex={rowIndex} label={labelControl} trailing={controls} active={isOver}>
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
              tapToAssign={tapToAssign}
            />
          ))
        )}
      </TierRowFrame>
    </div>
  );
}

interface BoardCardProps {
  view: TierCardView;
  rowIndex: number;
  position: number;
  tapToAssign: boolean;
}

/**
 * A card sitting on the board. Both a drag source and a drop target: dropping
 * another card over it inserts before it, which is how a row gets ordered. In
 * tap-to-assign mode the tile opens the tier picker instead, same as the pool
 * cell's pill.
 *
 * @returns The board card node.
 */
function BoardCard({ view, rowIndex, position, tapToAssign }: BoardCardProps) {
  const dragData: BoardCardDragData = {
    type: "tier-board-card",
    cardId: view.cardId,
  };
  const dropData: TierCardDropData = { type: "tier-card", cardId: view.cardId, rowIndex, position };

  // Labels captured at open, not subscribed — see PoolCardStrip for why.
  const [picker, setPicker] = useState<{ open: boolean; labels: string[] }>({
    open: false,
    labels: [],
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
        labels={picker.labels}
        cardName={view.card.name}
        currentRowIndex={rowIndex}
        onPick={(target) => assign(view.cardId, target)}
        onUnrank={() => unassign(view.cardId)}
        open={picker.open}
        onOpenChange={(open) => {
          setPicker({
            open,
            labels: open ? useTierListBuilderStore.getState().rows.map((row) => row.label) : [],
          });
        }}
        trigger={
          <Pressable aria-label={`Move ${view.card.name}`} className="rounded-sm">
            <TierCardTile view={view} />
          </Pressable>
        }
      />
    );
  }

  return (
    <div ref={setDropRef}>
      <div
        ref={setDragRef}
        {...listeners}
        {...attributes}
        // dnd-kit's PointerSensor needs the browser to keep sending pointer
        // events; the default touch-action would pan the page instead.
        className="cursor-grab touch-none active:cursor-grabbing"
        style={isDragging ? { opacity: 0.4 } : undefined}
      >
        <TierCardTile view={view} />
      </div>
    </div>
  );
}
