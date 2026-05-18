import type { Printing } from "@openrift/shared";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useEnumOrders } from "@/hooks/use-enums";
import { formatCardId, formatPrintingLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

interface VariantAddPopoverProps {
  printings: Printing[];
  ownedCounts?: Record<string, number>;
  onQuickAdd: (printing: Printing) => void;
  onUndoAdd: (printing: Printing, anchorEl: HTMLElement) => void;
  /** Initial keyboard highlight target (e.g. the printing selected on the grid). */
  initialHighlightId?: string;
}

export function VariantAddPopover({
  printings,
  ownedCounts,
  onQuickAdd,
  onUndoAdd,
  initialHighlightId,
}: VariantAddPopoverProps) {
  const hasMixedRarities = new Set(printings.map((p) => p.rarity)).size > 1;
  const { labels } = useEnumOrders();

  const matchedIndex = printings.findIndex((p) => p.id === initialHighlightId);
  const [highlightedIndex, setHighlightedIndex] = useState(Math.max(matchedIndex, 0));
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Document-level keydown reads the latest index without re-binding on each
  // move — re-binding on every keystroke would lose the highlight between
  // listener registrations.
  const highlightedIndexRef = useRef(highlightedIndex);
  useEffect(() => {
    highlightedIndexRef.current = highlightedIndex;
  }, [highlightedIndex]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((idx) => (idx < printings.length - 1 ? idx + 1 : 0));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((idx) => (idx > 0 ? idx - 1 : printings.length - 1));
        return;
      }
      // `=` is accepted as a no-shift alias for `+` (US layouts need Shift+=).
      const isIncrement = event.key === "+" || event.key === "=";
      if (isIncrement || event.key === "-") {
        const printing = printings[highlightedIndexRef.current];
        if (!printing) {
          return;
        }
        event.preventDefault();
        if (isIncrement) {
          onQuickAdd(printing);
          return;
        }
        const owned = ownedCounts?.[printing.id] ?? 0;
        if (owned === 0) {
          return;
        }
        const anchor = rowRefs.current[highlightedIndexRef.current];
        if (anchor) {
          onUndoAdd(printing, anchor);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [printings, onQuickAdd, onUndoAdd, ownedCounts]);

  return (
    <>
      <div className="px-2.5 pt-2 pb-0.5">
        <p className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
          Variants
        </p>
      </div>
      <div className="px-1 pb-1">
        {printings.map((printing, idx) => {
          const owned = ownedCounts?.[printing.id] ?? 0;
          const highlighted = idx === highlightedIndex;

          return (
            <div
              key={printing.id}
              ref={(el) => {
                rowRefs.current[idx] = el;
              }}
              onMouseEnter={() => setHighlightedIndex(idx)}
              className={cn(
                "flex items-center gap-2 rounded-md px-1.5 py-0.5 text-sm",
                highlighted && "bg-accent",
              )}
            >
              <div className="flex flex-1 items-center gap-1.5 whitespace-nowrap">
                {hasMixedRarities && (
                  <img
                    src={`/images/rarities/${printing.rarity.toLowerCase()}-28x28.webp`}
                    alt={printing.rarity}
                    title={printing.rarity}
                    width={28}
                    height={28}
                    className="size-3.5 shrink-0"
                  />
                )}
                <span className="text-muted-foreground text-2xs shrink-0 font-mono">
                  {formatCardId(printing)}
                </span>
                <span>{formatPrintingLabel(printing, printings, labels) || printing.setSlug}</span>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  tabIndex={-1}
                  size="icon-xs"
                  variant="ghost"
                  onClick={(event) => onUndoAdd(printing, event.currentTarget)}
                  disabled={owned === 0}
                  aria-label={`Remove ${printing.card.name}`}
                >
                  <MinusIcon />
                </Button>
                <span className="text-muted-foreground w-5 text-center tabular-nums">{owned}</span>
                <Button
                  type="button"
                  tabIndex={-1}
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => onQuickAdd(printing)}
                  aria-label={`Add ${printing.card.name}`}
                >
                  <PlusIcon />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
