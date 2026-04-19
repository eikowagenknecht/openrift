import type { Printing } from "@openrift/shared";

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
  return (
    // ⚠ h-5 + mb-1 = 24px mirrors ADD_STRIP_HEIGHT in card-grid-constants
    <div className="relative z-10 mb-1 flex h-5 items-center justify-between">
      <button
        type="button"
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation();
          onUndoAdd?.(printing, event.currentTarget);
        }}
        disabled={ownedCount === 0}
        className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-5 items-center justify-center rounded transition-colors disabled:pointer-events-none disabled:opacity-30"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
          <path d="M3 7a1 1 0 0 0 0 2h10a1 1 0 1 0 0-2H3z" />
        </svg>
      </button>

      {hasVariants && onOpenVariants ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            onOpenVariants(printing, event.currentTarget);
          }}
          className={cn(
            "hover:text-foreground hover:bg-muted/50 rounded-sm px-1 text-xs font-medium transition-colors",
            ownedCount > 0 ? "text-muted-foreground" : "text-muted-foreground/40",
          )}
        >
          ×{ownedCount}
          {totalOwnedCount !== undefined && totalOwnedCount !== ownedCount && (
            <span
              className={ownedCount > 0 ? "text-muted-foreground/60" : "text-muted-foreground/30"}
            >
              {" "}
              ({totalOwnedCount})
            </span>
          )}
        </button>
      ) : (
        <span
          className={cn(
            "text-xs font-medium",
            ownedCount > 0 ? "text-muted-foreground" : "text-muted-foreground/40",
          )}
        >
          ×{ownedCount}
        </span>
      )}

      <button
        type="button"
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation();
          onQuickAdd(printing);
        }}
        className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-5 items-center justify-center rounded transition-colors"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
          <path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2H9v4a1 1 0 1 1-2 0V9H3a1 1 0 0 1 0-2h4V3a1 1 0 0 1 1-1z" />
        </svg>
      </button>
    </div>
  );
}
