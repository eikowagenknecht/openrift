import type { Printing } from "@openrift/shared";

import { usePriceHistory } from "@/hooks/use-price-history";
import {
  formatCardId,
  formatPrice,
  formatPriceEur,
  formatPrintingLabel,
  priceColorClass,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export function PrintingPicker({
  current,
  printings,
  onSelect,
}: {
  current: Printing;
  printings: Printing[];
  onSelect: (printing: Printing) => void;
}) {
  const hasMixedRarities = new Set(printings.map((p) => p.rarity)).size > 1;

  return (
    <div className="space-y-2">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Versions
      </h3>
      <div className="space-y-1">
        {printings.map((p) => {
          const isActive = p.id === current.id;
          const label = formatPrintingLabel(p, printings);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                isActive ? "bg-muted ring-border ring-1" : "hover:bg-muted/50",
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="text-muted-foreground mr-1.5 font-mono text-xs">
                  {formatCardId(p)}
                </span>
                {label}
                {hasMixedRarities && (
                  <img
                    src={`/images/rarities/${p.rarity.toLowerCase()}-28x28.webp`}
                    alt={p.rarity}
                    title={p.rarity}
                    width={28}
                    height={28}
                    className="ml-1 inline size-3.5 align-text-bottom"
                  />
                )}
              </span>
              <PrintingPrices marketPrice={p.marketPrice} printingId={p.id} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PrintingPrices({
  marketPrice,
  printingId,
}: {
  marketPrice: number | undefined;
  printingId: string;
}) {
  const { data: history } = usePriceHistory(printingId, "30d");
  const cmSnapshots = history?.cardmarket?.snapshots;
  const cmLatest = cmSnapshots?.length ? cmSnapshots.at(-1) : null;

  if (marketPrice === undefined && !cmLatest) {
    return null;
  }

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {marketPrice !== undefined && (
        <span className={cn("text-xs font-semibold", priceColorClass(marketPrice))}>
          {formatPrice(marketPrice)}
        </span>
      )}
      {cmLatest && (
        <span className={cn("text-xs font-semibold", priceColorClass(cmLatest.market))}>
          {formatPriceEur(cmLatest.market)}
        </span>
      )}
    </span>
  );
}
