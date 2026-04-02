import type { Printing } from "@openrift/shared";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DeckAddStripProps {
  printing: Printing;
  ownedCount: number;
  deckQuantity: number;
  maxReached?: boolean;
  addLabel?: string;
  shiftHeld?: boolean;
  remainingCount?: number;
  onQuickAdd: (printing: Printing, event: React.MouseEvent) => void;
  onRemove?: (printing: Printing, event: React.MouseEvent) => void;
}

/**
 * Top strip for cards in the deck editor grid.
 * Shows: [owned count] [in-deck count] [-] [+ or Choose]
 * @returns The deck add strip.
 */
export function DeckAddStrip({
  printing,
  ownedCount,
  deckQuantity,
  maxReached,
  addLabel,
  shiftHeld,
  remainingCount,
  onQuickAdd,
  onRemove,
}: DeckAddStripProps) {
  const showBulkAdd = shiftHeld && !addLabel && remainingCount !== undefined && remainingCount > 1;
  const showBulkRemove = shiftHeld && deckQuantity > 1;
  return (
    // ⚠ h-5 + mb-1 = 24px mirrors ADD_STRIP_HEIGHT in card-grid-constants
    <div className="relative z-10 mb-1 flex h-5 items-center">
      <div className="flex flex-1 justify-start">
        <span
          className={cn(
            "text-xs",
            ownedCount > 0 ? "text-muted-foreground" : "text-muted-foreground/40",
          )}
        >
          {ownedCount} owned
        </span>
      </div>

      {deckQuantity > 0 && (
        <span className="text-primary text-xs font-semibold">{deckQuantity} in deck</span>
      )}

      <div className="flex flex-1 items-center justify-end gap-0.5">
        {deckQuantity > 0 && onRemove && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(printing, event);
                  }}
                  className={cn(
                    "flex items-center justify-center rounded transition-colors",
                    showBulkRemove
                      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 h-5 min-w-5 px-1 text-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted size-5",
                  )}
                />
              }
            >
              {showBulkRemove ? (
                `-${deckQuantity}`
              ) : (
                <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
                  <path d="M3 7a1 1 0 0 0 0 2h10a1 1 0 1 0 0-2H3z" />
                </svg>
              )}
            </TooltipTrigger>
            <TooltipContent>Shift+click to remove all</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                tabIndex={-1}
                disabled={maxReached}
                onClick={(event) => {
                  event.stopPropagation();
                  onQuickAdd(printing, event);
                }}
                className={cn(
                  "flex items-center justify-center rounded transition-colors",
                  maxReached
                    ? "text-muted-foreground/30 size-5 cursor-default"
                    : addLabel
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 px-2 py-0.5 text-xs font-semibold"
                      : showBulkAdd
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 h-5 min-w-5 px-1 text-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted size-5",
                )}
              />
            }
          >
            {!maxReached && addLabel ? (
              addLabel
            ) : showBulkAdd && !maxReached ? (
              `+${remainingCount}`
            ) : (
              <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
                <path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2H9v4a1 1 0 1 1-2 0V9H3a1 1 0 0 1 0-2h4V3a1 1 0 0 1 1-1z" />
              </svg>
            )}
          </TooltipTrigger>
          {!maxReached && (
            <TooltipContent>
              {addLabel ? `Click to ${addLabel.toLowerCase()}` : "Shift+click to add max"}
            </TooltipContent>
          )}
        </Tooltip>
      </div>
    </div>
  );
}
