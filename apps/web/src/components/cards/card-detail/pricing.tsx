import { MARKETPLACE_LINKS } from "@openrift/shared/marketplace";
import { snapshotHeadline } from "@openrift/shared/types/api/pricing";
import type { Printing } from "@openrift/shared/types/catalog";
import type { Marketplace, TimeRange } from "@openrift/shared/types/pricing";

import { MarketplaceIcon } from "@/components/marketplace-icon";
import { MarketplaceLink } from "@/components/marketplace-link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePriceHistory } from "@/hooks/use-price-history";
import { usePrices } from "@/hooks/use-prices";
import { formatPrice, formatterForMarketplace, priceColorClass } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

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

  function latestPrice(marketplace: Marketplace): number | null {
    const snapshots = history?.[marketplace]?.snapshots;
    if (!snapshots?.length) {
      return null;
    }
    // oxlint-disable-next-line no-non-null-assertion -- length check above
    return snapshotHeadline(snapshots.at(-1)!);
  }

  // Catalog price is preferred over history since it doesn't wait on history to load.
  const chips: {
    marketplace: Marketplace;
    value: number;
    url: string | null;
  }[] = [];
  for (const marketplace of marketplaceOrder) {
    const links = MARKETPLACE_LINKS[marketplace];
    const slice = history?.[marketplace];
    const productId = slice?.productId ?? null;
    const url = productId ? links.productUrl(productId, printing.language) : null;

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
        const links = MARKETPLACE_LINKS[marketplace];
        return (
          <PriceChip
            key={marketplace}
            marketplace={marketplace}
            label={links.label}
            value={value}
            url={url}
            formatValue={formatterForMarketplace(marketplace)}
            isAffiliate={links.isAffiliate}
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
