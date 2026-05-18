import type { Printing } from "@openrift/shared";
import { ListIcon, MinusIcon, PlusIcon } from "lucide-react";

import { COUNT_PILL_BASE } from "@/components/cards/count-pill";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ListAddStripProps {
  printing: Printing;
  /** Quantity already on the list for this card (card-kind) or printing (printing-kind), plus any in-flight optimistic delta. */
  displayedCount: number;
  onIncrement: (printing: Printing) => void;
  onDecrement: (printing: Printing) => void;
}

/**
 * Top strip for tiles in a list's add mode. Shows `[-] ×N [+]` with N being
 * the quantity currently on the list. The parent owns the +/- semantics
 * (bulk-add vs. PATCH-quantity) since they depend on the list's kind.
 *
 * `[-]` is disabled at quantity ≤ 1 — full removal goes through the
 * context-menu's "Remove from list" action so a stepper click can never
 * silently delete the entry. Matches the convention in
 * `ListEntryTableActions`.
 *
 * @returns The list add-mode strip.
 */
export function ListAddStrip({
  printing,
  displayedCount,
  onIncrement,
  onDecrement,
}: ListAddStripProps) {
  const dim = displayedCount === 0;

  return (
    // h-5 + mb-1 = 24px mirrors ADD_STRIP_HEIGHT in card-grid-constants
    <div className="relative z-30 mb-1 flex h-5 items-center justify-between">
      <Button
        type="button"
        tabIndex={-1}
        size="icon-xs"
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation();
          onDecrement(printing);
        }}
        disabled={displayedCount <= 1}
        aria-label={`Decrease ${printing.card.name} quantity on list`}
      >
        <MinusIcon />
      </Button>

      <span className={cn(COUNT_PILL_BASE, dim && "opacity-50")}>
        <ListIcon className="size-3" />
        <span>×{displayedCount}</span>
      </span>

      <Button
        type="button"
        tabIndex={-1}
        size="icon-xs"
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation();
          onIncrement(printing);
        }}
        aria-label={`Add ${printing.card.name} to list`}
      >
        <PlusIcon />
      </Button>
    </div>
  );
}
