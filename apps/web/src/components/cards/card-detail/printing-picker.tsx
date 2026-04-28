import type { Printing } from "@openrift/shared";
import { snapshotHeadline } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { useEnumOrders } from "@/hooks/use-enums";
import { usePriceHistory } from "@/hooks/use-price-history";
import { usePrices } from "@/hooks/use-prices";
import {
  formatCardId,
  formatterForMarketplace,
  formatPrintingLabel,
  priceColorClass,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

import { OwnedCollectionsPopover } from "./owned-collections-popover";

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
  const { labels } = useEnumOrders();

  return (
    <div className="space-y-2">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Printings
      </h3>
      <div className="space-y-1">
        {printings.map((p) => {
          const isActive = p.id === current.id;
          const label = formatPrintingLabel(p, printings, labels);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(p)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                isActive ? "bg-muted ring-border ring-1" : "hover:bg-muted/50",
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                <Link
                  to="/sets/$setSlug"
                  params={{ setSlug: p.setSlug }}
                  className="text-muted-foreground hover:text-foreground mr-1.5 font-mono text-xs"
                  onClick={(event) => event.stopPropagation()}
                >
                  {formatCardId(p)}
                </Link>
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
              <OwnedCollectionsPopover
                printingId={p.id}
                cardName={p.card.name}
                shortCode={p.shortCode}
              />
              <PrintingPrices printing={p} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PrintingPrices({ printing }: { printing: Printing }) {
  const favorite = useDisplayStore((s) => s.marketplaceOrder[0] ?? "cardtrader");
  const prices = usePrices();
  const { data: history } = usePriceHistory(printing.id, "30d");

  const inline = prices.get(printing.id, favorite);
  let value: number | null = inline ?? null;
  if (value === null) {
    const snapshots = history?.[favorite]?.snapshots;
    if (snapshots?.length) {
      // oxlint-disable-next-line no-non-null-assertion -- length check above
      value = snapshotHeadline(snapshots.at(-1)!);
    }
  }

  if (value === null) {
    return null;
  }

  return (
    <span className={cn("shrink-0 text-xs font-semibold", priceColorClass(value))}>
      {formatterForMarketplace(favorite)(value)}
    </span>
  );
}
