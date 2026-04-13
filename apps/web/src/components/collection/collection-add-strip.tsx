import type { Printing } from "@openrift/shared";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAddModeStore } from "@/stores/add-mode-store";

interface CollectionAddStripProps {
  printing: Printing;
  ownedCount: number;
  totalOwnedCount?: number;
  hasVariants: boolean;
  onQuickAdd: (printing: Printing) => void;
  onUndoAdd?: (printing: Printing) => void;
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
  const sessionAddedCount = useAddModeStore(
    (state) => state.addedItems.get(printing.id)?.quantity ?? 0,
  );
  const [hintOpen, setHintOpen] = useState(false);

  const preExistingCount = ownedCount - sessionAddedCount;
  const showHint = !sessionAddedCount && preExistingCount > 0;

  return (
    // ⚠ h-5 + mb-1 = 24px mirrors ADD_STRIP_HEIGHT in card-grid-constants
    <div className="relative z-10 mb-1 flex h-5 items-center justify-between">
      {showHint ? (
        <Popover open={hintOpen} onOpenChange={setHintOpen}>
          <PopoverTrigger
            // oxlint-disable-next-line react/no-unknown-property -- base-ui render prop
            render={
              <button
                type="button"
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
                className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-5 items-center justify-center rounded transition-colors"
              />
            }
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
              <path d="M3 7a1 1 0 0 0 0 2h10a1 1 0 1 0 0-2H3z" />
            </svg>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="start"
            sideOffset={4}
            className="w-52 gap-1.5 p-2.5 text-xs"
          >
            {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- popover content, not a standalone interactive element */}
            <div onClick={(event) => event.stopPropagation()}>
              <p className="text-muted-foreground">
                {preExistingCount === 1 ? "This copy was" : "These copies were"} added before this
                session. Exit add mode to manage existing copies.
              </p>
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <button
          type="button"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            onUndoAdd?.(printing);
          }}
          disabled={!sessionAddedCount}
          className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-5 items-center justify-center rounded transition-colors disabled:pointer-events-none disabled:opacity-30"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
            <path d="M3 7a1 1 0 0 0 0 2h10a1 1 0 1 0 0-2H3z" />
          </svg>
        </button>
      )}

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
