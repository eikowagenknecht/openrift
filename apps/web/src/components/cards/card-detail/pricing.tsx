import type { Marketplace, Printing, TimeRange } from "@openrift/shared";
import { snapshotHeadline } from "@openrift/shared";
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePriceHistory } from "@/hooks/use-price-history";
import { usePrices } from "@/hooks/use-prices";
import { affiliateUrl, cardtraderAffiliateUrl } from "@/lib/affiliate";
import { formatPrice, formatPriceEur, priceColorClass } from "@/lib/format";
import { cardmarketLangParam } from "@/lib/marketplace-language";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

interface MarketplaceConfig {
  label: string;
  icon: string;
  iconClassName: string;
  formatValue: (v: number) => string;
  getUrl: (productId: number, language?: string | null) => string;
  isAffiliate?: boolean;
}

const MARKETPLACE_CONFIG: Record<Marketplace, MarketplaceConfig> = {
  tcgplayer: {
    label: "TCGplayer",
    icon: "/images/external/tcgplayer-38x28.webp",
    iconClassName: "invert dark:invert-0",
    formatValue: formatPrice,
    getUrl: (id) => affiliateUrl(`https://www.tcgplayer.com/product/${id}`),
    isAffiliate: true,
  },
  cardmarket: {
    label: "Cardmarket",
    icon: "/images/external/cardmarket-20x28.webp",
    iconClassName: "invert dark:invert-0",
    formatValue: formatPriceEur,
    getUrl: (id, language) =>
      `https://www.cardmarket.com/en/Riftbound/Products?idProduct=${id}${cardmarketLangParam(language)}`,
  },
  cardtrader: {
    label: "CardTrader",
    icon: "/images/external/cardtrader-20x28.webp",
    iconClassName: "invert dark:invert-0",
    formatValue: formatPriceEur,
    getUrl: (id) => cardtraderAffiliateUrl(`https://www.cardtrader.com/en/cards/${id}`),
    isAffiliate: true,
  },
};

export function PricingSection({ printing, range }: { printing: Printing; range: TimeRange }) {
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
    languageAggregate: boolean;
  }[] = [];
  for (const marketplace of marketplaceOrder) {
    const config = MARKETPLACE_CONFIG[marketplace];
    const slice = history?.[marketplace];
    const productId = slice?.productId ?? null;
    const languageAggregate = slice?.languageAggregate ?? false;
    const url = productId ? config.getUrl(productId, printing.language) : null;

    const value = prices.get(printing.id, marketplace) ?? latestPrice(marketplace);

    if (value !== null && value !== undefined) {
      chips.push({ marketplace, value, url, languageAggregate });
    }
  }

  if (chips.length === 0) {
    return null;
  }

  const favorite = marketplaceOrder[0] ?? "tcgplayer";

  return (
    <div className="flex items-center justify-end gap-1.5">
      {chips[0]?.marketplace === favorite && (
        <PriceTrend printingId={printing.id} range={range} marketplace={favorite} />
      )}
      <span className="text-muted-foreground text-sm">Buy on</span>
      {chips.map(({ marketplace, value, url, languageAggregate }) => {
        const config = MARKETPLACE_CONFIG[marketplace];
        return (
          <PriceChip
            key={marketplace}
            label={config.label}
            icon={config.icon}
            iconClassName={config.iconClassName}
            value={value}
            url={url}
            formatValue={config.formatValue}
            languageAggregate={languageAggregate}
            isFavorite={marketplace === favorite}
            isAffiliate={config.isAffiliate}
          />
        );
      })}
    </div>
  );
}

const RANGE_LABELS: Record<TimeRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "all time",
};

function PriceTrend({
  printingId,
  range = "30d",
  marketplace,
}: {
  printingId: string;
  range?: TimeRange;
  marketplace: Marketplace;
}) {
  const { data } = usePriceHistory(printingId, range);
  const snapshots = data?.[marketplace]?.snapshots;
  if (!snapshots || snapshots.length < 2) {
    return null;
  }

  const first = snapshotHeadline(snapshots[0]);
  // oxlint-disable-next-line no-non-null-assertion -- length >= 2 is checked above
  const last = snapshotHeadline(snapshots.at(-1)!);
  if (first === 0) {
    return null;
  }

  const pctChange = ((last - first) / first) * 100;
  const rounded = Math.round(pctChange);

  if (rounded === 0) {
    return null;
  }

  const isUp = rounded > 0;

  return (
    <Tooltip>
      <TooltipTrigger>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-xs font-medium",
            isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
          )}
        >
          {isUp ? <TrendingUpIcon className="size-3" /> : <TrendingDownIcon className="size-3" />}
          {Math.abs(rounded)}%
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {isUp ? "+" : ""}
        {rounded}% over {RANGE_LABELS[range]}
      </TooltipContent>
    </Tooltip>
  );
}

function PriceChip({
  label,
  icon,
  value,
  url,
  formatValue = formatPrice,
  iconClassName,
  languageAggregate,
  isFavorite,
  isAffiliate,
}: {
  label: string;
  icon?: string;
  value: number;
  url: string | null;
  formatValue?: (v: number) => string;
  iconClassName?: string;
  languageAggregate?: boolean;
  isFavorite?: boolean;
  isAffiliate?: boolean;
}) {
  const content = (
    <>
      {icon ? (
        <img src={icon} alt={label} className={cn("h-3", iconClassName)} />
      ) : (
        <span className="text-muted-foreground text-xs font-normal">{label}</span>
      )}
      {formatValue(value)}
    </>
  );

  const variant = isFavorite ? "outline" : "ghost";
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
                <a href={url} target="_blank" rel="noreferrer" aria-label={`Buy on ${label}`} />
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
        {languageAggregate && (
          <span className="text-muted-foreground ml-1 text-xs">(any language)</span>
        )}
        {isAffiliate && (
          <span className="text-muted-foreground ml-1 text-xs">(affiliate link)</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
