import { MinusIcon, PackageIcon, PlusIcon } from "lucide-react";

import { COUNT_PILL_BASE } from "@/components/cards/count-pill";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ListEntryQuantityStripProps {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  isPending: boolean;
  cardName: string;
}

/**
 * Per-cell quantity stepper for the list-page card/printing grid. Mirrors
 * `CollectionAddStrip` visually (`[-] ×N [+]`) but operates on list entries,
 * so the same affordance is available in tile view as in the table.
 *
 * Minus is disabled at quantity 1 — removing the entry entirely is the trash
 * action in the table view or the context menu in the grid, not a silent
 * side-effect of decrementing past 1.
 * @returns The list-entry quantity strip.
 */
export function ListEntryQuantityStrip({
  quantity,
  onIncrement,
  onDecrement,
  isPending,
  cardName,
}: ListEntryQuantityStripProps) {
  return (
    // ⚠ h-5 + mb-1 = 24px mirrors ADD_STRIP_HEIGHT in card-grid-constants
    <div className="relative z-30 mb-1 flex h-5 items-center justify-between">
      <Button
        type="button"
        tabIndex={-1}
        size="icon-xs"
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation();
          onDecrement();
        }}
        disabled={isPending || quantity <= 1}
        aria-label={`Decrease ${cardName} quantity`}
      >
        <MinusIcon />
      </Button>

      <span className={cn(COUNT_PILL_BASE)}>
        <PackageIcon className="size-3" />
        <span>&times;{quantity}</span>
      </span>

      <Button
        type="button"
        tabIndex={-1}
        size="icon-xs"
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation();
          onIncrement();
        }}
        disabled={isPending}
        aria-label={`Increase ${cardName} quantity`}
      >
        <PlusIcon />
      </Button>
    </div>
  );
}
