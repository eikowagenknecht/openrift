import type { Printing } from "@openrift/shared";
import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useEnumOrders } from "@/hooks/use-enums";
import { formatCardId, formatPrintingLabel } from "@/lib/format";

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
    <>
      <div className="px-2.5 pt-2 pb-0.5">
        <p className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
          Variants
        </p>
      </div>
      <div className="px-1 pb-1">
        {printings.map((printing) => {
          const owned = ownedCounts?.[printing.id] ?? 0;

          return (
            <div
              key={printing.id}
              className="flex items-center gap-2 rounded-md px-1.5 py-0.5 text-sm"
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
