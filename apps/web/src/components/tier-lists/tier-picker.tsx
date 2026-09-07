import { TIER_LABEL_INK, tierRowColor } from "@openrift/shared/tier-colors";
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

export interface TierPickerRow {
  label: string;
  unranked?: boolean;
}

interface TierPickerProps {
  rows: readonly TierPickerRow[];
  cardName: string;
  currentRowIndex: number | null;
  onPick: (rowIndex: number) => void;
  onUnrank: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement<{ onClick?: (event: MouseEvent) => void }>;
}

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
