import type { Printing } from "@openrift/shared";

import { useEnumOrders } from "@/hooks/use-enums";
import { formatCardId, formatPrintingLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

interface VariantAddPopoverProps {
  printings: Printing[];
  ownedCounts?: Record<string, number>;
  onQuickAdd: (printing: Printing) => void;
  onUndoAdd: (printing: Printing, anchorEl: HTMLElement) => void;
}

export function VariantAddPopover({
  printings,
  ownedCounts,
  onQuickAdd,
  onUndoAdd,
}: VariantAddPopoverProps) {
  const hasMixedRarities = new Set(printings.map((p) => p.rarity)).size > 1;
  const { labels } = useEnumOrders();

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- popover content, not a standalone interactive element
    <div
      className="bg-background flex max-h-48 w-56 flex-col gap-0.5 overflow-y-auto rounded-lg border p-1.5 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {printings.map((printing) => {
        const owned = ownedCounts?.[printing.id] ?? 0;

        return (
          <div key={printing.id} className="flex items-center gap-1 rounded px-1 py-0.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-2xs font-mono">
                  {formatCardId(printing)}
                </span>
                {hasMixedRarities && (
                  <img
                    src={`/images/rarities/${printing.rarity.toLowerCase()}-28x28.webp`}
                    alt={printing.rarity}
                    title={printing.rarity}
                    width={28}
                    height={28}
                    className="size-3"
                  />
                )}
              </div>
              <span className="text-2xs block truncate">
                {formatPrintingLabel(printing, printings, labels) || printing.setSlug}
              </span>
            </div>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onUndoAdd(printing, e.currentTarget);
              }}
              disabled={owned === 0}
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded transition-colors",
                owned > 0
                  ? "text-muted-foreground hover:text-foreground hover:bg-muted"
                  : "text-muted-foreground/30 cursor-not-allowed",
              )}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="size-3">
                <path d="M3 7a1 1 0 0 0 0 2h10a1 1 0 1 0 0-2H3z" />
              </svg>
            </button>
            <span className="text-muted-foreground w-5 text-center text-xs font-medium">
              {owned}
            </span>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onQuickAdd(printing);
              }}
              className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-5 shrink-0 items-center justify-center rounded transition-colors"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="size-3">
                <path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2H9v4a1 1 0 1 1-2 0V9H3a1 1 0 0 1 0-2h4V3a1 1 0 0 1 1-1z" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
