import type { Printing } from "@openrift/shared";

import { cn } from "@/lib/utils";

interface DeckAddStripProps {
  printing: Printing;
  ownedCount: number;
  deckQuantity: number;
  maxReached?: boolean;
  addLabel?: string;
  onQuickAdd: (printing: Printing) => void;
  onRemove?: (printing: Printing) => void;
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
  onQuickAdd,
  onRemove,
}: DeckAddStripProps) {
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
          <button
            type="button"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              onRemove(printing);
            }}
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-5 items-center justify-center rounded transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
              <path d="M3 7a1 1 0 0 0 0 2h10a1 1 0 1 0 0-2H3z" />
            </svg>
          </button>
        )}
        {!maxReached && (
          <button
            type="button"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              onQuickAdd(printing);
            }}
            className={cn(
              "flex items-center justify-center rounded transition-colors",
              addLabel
                ? "bg-primary text-primary-foreground hover:bg-primary/90 px-2 py-0.5 text-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted size-5",
            )}
          >
            {addLabel ?? (
              <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
                <path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2H9v4a1 1 0 1 1-2 0V9H3a1 1 0 0 1 0-2h4V3a1 1 0 0 1 1-1z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
