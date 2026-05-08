import type { Printing } from "@openrift/shared";
import { MinusIcon, PackageIcon, PlusIcon } from "lucide-react";

import { COUNT_PILL_BASE, COUNT_PILL_INTERACTIVE } from "@/components/cards/count-pill";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CollectionAddStripProps {
  printing: Printing;
  ownedCount: number;
  totalOwnedCount?: number;
  hasVariants: boolean;
  onQuickAdd: (printing: Printing) => void;
  onUndoAdd?: (printing: Printing, anchorEl: HTMLElement) => void;
  onOpenVariants?: (printing: Printing, anchorEl: HTMLElement) => void;
}

/**
 * Top strip for cards in collection add mode.
 * Shows: [-] ×count [+] with variant popover support.
 * @returns The collection add strip.
 */
export function CollectionAddStrip({
  printing,
  ownedCount,
  totalOwnedCount,
  hasVariants,
  onQuickAdd,
  onUndoAdd,
  onOpenVariants,
}: CollectionAddStripProps) {
  const showTotal = totalOwnedCount !== undefined && totalOwnedCount !== ownedCount;
  const dim = ownedCount === 0 && !showTotal;
  const countContent = (
    <>
      <PackageIcon className="size-3" />
      <span>
        ×{ownedCount}
        {showTotal && <span className="opacity-60"> ({totalOwnedCount})</span>}
      </span>
    </>
  );

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
          onUndoAdd?.(printing, event.currentTarget);
        }}
        disabled={ownedCount === 0}
        aria-label={`Remove ${printing.card.name}`}
      >
        <MinusIcon />
      </Button>

      {hasVariants && onOpenVariants ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            onOpenVariants(printing, event.currentTarget);
          }}
          className={cn(COUNT_PILL_BASE, COUNT_PILL_INTERACTIVE, dim && "opacity-50")}
        >
          {countContent}
        </button>
      ) : (
        <span className={cn(COUNT_PILL_BASE, dim && "opacity-50")}>{countContent}</span>
      )}

      <Button
        type="button"
        tabIndex={-1}
        size="icon-xs"
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation();
          onQuickAdd(printing);
        }}
        aria-label={`Add ${printing.card.name}`}
      >
        <PlusIcon />
      </Button>
    </div>
  );
}
