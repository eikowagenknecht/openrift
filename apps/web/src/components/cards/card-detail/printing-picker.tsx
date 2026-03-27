import type { Marketplace, Printing } from "@openrift/shared";

import { resolvePrice } from "@/hooks/use-card-data";
import { usePriceHistory } from "@/hooks/use-price-history";
import {
  formatCardId,
  formatterForMarketplace,
  formatPrintingLabel,
  priceColorClass,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

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
              <PrintingPrices printing={p} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PrintingPrices({ printing }: { printing: Printing }) {
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const { data: history } = usePriceHistory(printing.id, "30d");

  function priceFor(marketplace: Marketplace): number | null {
    // Try inline catalog price first
    const inline = resolvePrice(printing, marketplace);
    if (inline !== undefined) {
      return inline;
    }
    // Fall back to latest history snapshot
    const snapshots = history?.[marketplace]?.snapshots;
    return snapshots?.length ? (snapshots.at(-1)?.market ?? null) : null;
  }

  const entries: { marketplace: Marketplace; value: number }[] = [];
  for (const marketplace of marketplaceOrder) {
    const value = priceFor(marketplace);
    if (value !== null) {
      entries.push({ marketplace, value });
    }
  }

  if (entries.length === 0) {
    return null;
  }

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {entries.map(({ marketplace, value }) => (
        <span key={marketplace} className={cn("text-xs font-semibold", priceColorClass(value))}>
          {formatterForMarketplace(marketplace)(value)}
        </span>
      ))}
    </span>
  );
}
