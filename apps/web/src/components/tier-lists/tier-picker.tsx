import { TIER_LABEL_INK, tierRowColor } from "@openrift/shared";
import { CornerUpLeftIcon } from "lucide-react";
import type { MouseEvent, ReactElement } from "react";
import { cloneElement } from "react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pressable } from "@/components/ui/pressable";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";

/** One option in the picker: a board row, in board order. */
export interface TierPickerRow {
  label: string;
  /** The grey cut pile rather than a rank. */
  unranked?: boolean;
}

interface TierPickerProps {
  /** Rows in board order; the index is the tier the option assigns to. */
  rows: readonly TierPickerRow[];
  /** Card being ranked, shown as the drawer's heading on touch. */
  cardName: string;
  /** Index of the row the card currently sits in, or null when it is unranked. */
  currentRowIndex: number | null;
  onPick: (rowIndex: number) => void;
  onUnrank: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The control the menu anchors to (and, on touch, the tap target). */
  trigger: ReactElement<{ onClick?: (event: MouseEvent) => void }>;
}

/**
 * Picks the tier a card belongs to. An anchored menu on desktop, a bottom
 * drawer on touch — the same split the card detail overlay makes, and the
 * reason the builder stays usable on a phone at all, where dragging is off.
 *
 * Ordering within a row is a drag-only affordance: the picker appends, which is
 * what someone ranking on a phone wants anyway.
 *
 * @returns The picker node, including its trigger.
 */
export function TierPicker({
  rows,
  cardName,
  currentRowIndex,
  onPick,
  onUnrank,
  open,
  onOpenChange,
  trigger,
}: TierPickerProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <>
        {/* The trigger is already a button, so it takes the open handler
            directly rather than being wrapped in a second clickable. */}
        {cloneElement(trigger, { onClick: () => onOpenChange(true) })}
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{cardName}</DrawerTitle>
              <DrawerDescription>Pick a tier for this card.</DrawerDescription>
            </DrawerHeader>
            <div className="flex flex-col gap-1 p-3 pt-0">
              {rows.map((row, rowIndex) => (
                <Pressable
                  key={rowIndex}
                  className={cn(
                    "ring-border flex w-full items-center gap-2 rounded-md p-2 ring-1",
                    rowIndex === currentRowIndex && "ring-ring ring-2",
                  )}
                  onClick={() => {
                    onPick(rowIndex);
                    onOpenChange(false);
                  }}
                >
                  <TierSwatch label={row.label} rowIndex={rowIndex} unranked={row.unranked} />
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  {rowIndex === currentRowIndex && (
                    <span className="text-muted-foreground text-sm">Current</span>
                  )}
                </Pressable>
              ))}
              {currentRowIndex !== null && (
                <Pressable
                  className="ring-border text-muted-foreground flex w-full items-center gap-2 rounded-md p-2 ring-1"
                  onClick={() => {
                    onUnrank();
                    onOpenChange(false);
                  }}
                >
                  <CornerUpLeftIcon className="size-4" />
                  Move back to the pool
                </Pressable>
              )}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="start">
        {rows.map((row, rowIndex) => (
          <DropdownMenuItem key={rowIndex} onClick={() => onPick(rowIndex)}>
            <TierSwatch label={row.label} rowIndex={rowIndex} unranked={row.unranked} />
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            {rowIndex === currentRowIndex && (
              <span className="text-muted-foreground text-sm">Current</span>
            )}
          </DropdownMenuItem>
        ))}
        {currentRowIndex !== null && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onUnrank}>
              <CornerUpLeftIcon />
              Move back to the pool
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TierSwatch({
  label,
  rowIndex,
  unranked,
}: {
  label: string;
  rowIndex: number;
  unranked?: boolean;
}) {
  return (
    <span
      aria-hidden
      className="text-2xs grid size-5 shrink-0 place-items-center rounded-sm font-bold"
      style={{ backgroundColor: tierRowColor(rowIndex, unranked), color: TIER_LABEL_INK }}
    >
      {label.slice(0, 2)}
    </span>
  );
}
