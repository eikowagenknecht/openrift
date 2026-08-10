import type { Marketplace, Printing, TimeRange } from "@openrift/shared";
import { MARKETPLACE_LINKS, snapshotHeadline } from "@openrift/shared";

import { MarketplaceIcon } from "@/components/marketplace-icon";
import { MarketplaceLink } from "@/components/marketplace-link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePriceHistory } from "@/hooks/use-price-history";
import { usePrices } from "@/hooks/use-prices";
import { formatPrice, formatPriceEur, priceColorClass } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

interface MarketplaceConfig {
  label: string;
  formatValue: (v: number) => string;
  getUrl: (productId: number, language?: string | null) => string;
  isAffiliate?: boolean;
}

const MARKETPLACE_CONFIG: Record<Marketplace, MarketplaceConfig> = {
  tcgplayer: {
    label: "TCGplayer",
    formatValue: formatPrice,
    getUrl: MARKETPLACE_LINKS.tcgplayer.productUrl,
    isAffiliate: true,
  },
  cardmarket: {
    label: "Cardmarket",
    formatValue: formatPriceEur,
    getUrl: MARKETPLACE_LINKS.cardmarket.productUrl,
  },
  cardtrader: {
    label: "CardTrader",
    formatValue: formatPriceEur,
    getUrl: MARKETPLACE_LINKS.cardtrader.productUrl,
    isAffiliate: true,
  },
};

export function PricingSection({
  printing,
  range = "30d",
}: {
  printing: Printing;
  /** Which history window backs the fallback price. Defaults to 30 days. */
  range?: TimeRange;
}) {
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const { data: history } = usePriceHistory(printing.id, range);
  const prices = usePrices();

  /** @returns The latest headline price for a marketplace (from price history snapshots). */
  function latestPrice(marketplace: Marketplace): number | null {
    const snapshots = history?.[marketplace]?.snapshots;
    if (!snapshots?.length) {
      return null;
    }
    // oxlint-disable-next-line no-non-null-assertion -- length check above
    return snapshotHeadline(snapshots.at(-1)!);
  }

  // Resolve which marketplaces have data to show. We prefer the latest catalog
  // price (available without waiting for history to load) and fall back to the
  // last history snapshot if the catalog has no entry yet.
  const chips: {
    marketplace: Marketplace;
    value: number;
    url: string | null;
  }[] = [];
  for (const marketplace of marketplaceOrder) {
    const config = MARKETPLACE_CONFIG[marketplace];
    const slice = history?.[marketplace];
    const productId = slice?.productId ?? null;
    const url = productId ? config.getUrl(productId, printing.language) : null;

    const value = prices.get(printing.id, marketplace) ?? latestPrice(marketplace);

    if (value !== null && value !== undefined) {
      chips.push({ marketplace, value, url });
    }
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className="text-muted-foreground text-sm">Buy on</span>
      {chips.map(({ marketplace, value, url }) => {
        const config = MARKETPLACE_CONFIG[marketplace];
        return (
          <PriceChip
            key={marketplace}
            marketplace={marketplace}
            label={config.label}
            value={value}
            url={url}
            formatValue={config.formatValue}
            isAffiliate={config.isAffiliate}
          />
        );
      })}
    </div>
  );
}

function PriceChip({
  marketplace,
  label,
  value,
  url,
  formatValue = formatPrice,
  isAffiliate,
}: {
  marketplace: Marketplace;
  label: string;
  value: number;
  url: string | null;
  formatValue?: (v: number) => string;
  isAffiliate?: boolean;
}) {
  const content = (
    <>
      <MarketplaceIcon marketplace={marketplace} alt={label} />
      {formatValue(value)}
    </>
  );

  // Every chip gets the same variant on purpose. Highlighting the favorite as
  // outline against ghost siblings is the visual grammar of a segmented control
  // with one item active, which had users clicking these to switch the price
  // chart's source and landing on the marketplace instead. The favorite is
  // still signalled by coming first.
  const variant = "outline" as const;
  const chipClassName = cn("font-semibold", priceColorClass(value));

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          url ? (
            <Button
              variant={variant}
              size="sm"
              render={
                <MarketplaceLink
                  marketplace={marketplace}
                  href={url}
                  aria-label={`Buy on ${label}`}
                />
              }
              className={chipClassName}
            />
          ) : (
            <span className={cn(buttonVariants({ variant, size: "sm" }), chipClassName)} />
          )
        }
      >
        {content}
      </TooltipTrigger>
      <TooltipContent>
        Buy on {label}
        {isAffiliate && (
          <span className="text-muted-foreground ml-1 text-xs">(affiliate link)</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
