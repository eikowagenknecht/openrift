import type { Printing } from "@openrift/shared";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { PickerList, PickerRow } from "@/components/ui/picker-list";
import { useEnumOrders } from "@/hooks/use-enums";
import { formatCardId, formatPrintingLabel } from "@/lib/format";

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
  const printingsById = new Map(printings.map((p) => [p.id, p]));

  // "" lets cmdk auto-pick the first row; we seed it with initialHighlightId
  // only when that id is actually in the list.
  const initialId = printings.some((p) => p.id === initialHighlightId) ? initialHighlightId : "";
  const [highlightedId, setHighlightedId] = useState(initialId ?? "");
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  return (
    <PickerList
      highlightedId={highlightedId}
      onHighlightChange={setHighlightedId}
      onKeyDown={(event, id) => {
        const printing = printingsById.get(id);
        if (!printing) {
          return;
        }
        // `=` is accepted as a no-shift alias for `+` (US layouts need Shift+=).
        const isIncrement = event.key === "+" || event.key === "=";
        if (isIncrement) {
          event.preventDefault();
          onQuickAdd(printing);
          return;
        }
        if (event.key === "-") {
          const owned = ownedCounts?.[id] ?? 0;
          if (owned === 0) {
            return;
          }
          event.preventDefault();
          const anchor = rowRefs.current[id];
          if (anchor) {
            onUndoAdd(printing, anchor);
          }
        }
      }}
      header={
        <div className="px-2.5 pt-2 pb-0.5">
          <p className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
            Variants
          </p>
        </div>
      }
    >
      {printings.map((printing) => {
        const owned = ownedCounts?.[printing.id] ?? 0;

        return (
          <PickerRow
            key={printing.id}
            value={printing.id}
            className="py-0.5"
            ref={(el) => {
              rowRefs.current[printing.id] = el;
            }}
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
          </PickerRow>
        );
      })}
    </PickerList>
  );
}
