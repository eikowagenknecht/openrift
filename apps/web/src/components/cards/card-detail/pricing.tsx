import type { Marketplace, Printing, TimeRange } from "@openrift/shared";
import { TrendingDown, TrendingUp } from "lucide-react";

import { usePriceHistory } from "@/hooks/use-price-history";
import { affiliateUrl, cardtraderAffiliateUrl } from "@/lib/affiliate";
import { formatPrice, formatPriceEur, priceColorClass } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

interface MarketplaceConfig {
  label: string;
  icon: string;
  iconClassName: string;
  formatValue: (v: number) => string;
  getUrl: (productId: number) => string;
}

const MARKETPLACE_CONFIG: Record<Marketplace, MarketplaceConfig> = {
  tcgplayer: {
    label: "TCGplayer",
    icon: "/images/external/tcgplayer-38x28.webp",
    iconClassName: "invert dark:invert-0",
    formatValue: formatPrice,
    getUrl: (id) => affiliateUrl(`https://www.tcgplayer.com/product/${id}`),
  },
  cardmarket: {
    label: "Cardmarket",
    icon: "/images/external/cardmarket-20x28.webp",
    iconClassName: "invert dark:invert-0",
    formatValue: formatPriceEur,
    getUrl: (id) => `https://www.cardmarket.com/en/Riftbound/Products?idProduct=${id}`,
  },
  cardtrader: {
    label: "CardTrader",
    icon: "/images/external/cardtrader-20x28.webp",
    iconClassName: "invert dark:invert-0",
    formatValue: formatPriceEur,
    getUrl: (id) => cardtraderAffiliateUrl(`https://www.cardtrader.com/en/cards/${id}`),
  },
};

export function PricingSection({ printing, range }: { printing: Printing; range: TimeRange }) {
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const { data: history } = usePriceHistory(printing.id, range);

  /** @returns The latest market price for a marketplace (from price history snapshots). */
  function latestPrice(marketplace: Marketplace): number | null {
    const snapshots = history?.[marketplace]?.snapshots;
    if (!snapshots?.length) {
      return null;
    }
    // oxlint-disable-next-line no-non-null-assertion -- length check above
    return snapshots.at(-1)!.market;
  }

  // Resolve which marketplaces have data to show
  const chips: { marketplace: Marketplace; value: number; url: string | null }[] = [];
  for (const marketplace of marketplaceOrder) {
    const config = MARKETPLACE_CONFIG[marketplace];
    const productId = history?.[marketplace]?.productId ?? null;
    const url = productId ? config.getUrl(productId) : null;

    // For tcgplayer, prefer the inline marketPrice (available without history loading)
    const value =
      marketplace === "tcgplayer"
        ? (printing.marketPrice ?? latestPrice(marketplace))
        : latestPrice(marketplace);

    if (value !== null && value !== undefined) {
      chips.push({ marketplace, value, url });
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
      {chips.map(({ marketplace, value, url }) => {
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

  const first = snapshots[0].market;
  // oxlint-disable-next-line no-non-null-assertion -- length >= 2 is checked above
  const last = snapshots.at(-1)!.market;
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
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
      )}
      title={`${isUp ? "+" : ""}${rounded}% over ${RANGE_LABELS[range]}`}
    >
      {isUp ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {Math.abs(rounded)}%
    </span>
  );
}

function PriceChip({
  label,
  icon,
  value,
  url,
  formatValue = formatPrice,
  iconClassName,
}: {
  label: string;
  icon?: string;
  value: number;
  url: string | null;
  formatValue?: (v: number) => string;
  iconClassName?: string;
}) {
  const Wrapper = url ? "a" : "span";
  const linkProps = url ? { href: url, target: "_blank" as const, rel: "noreferrer" } : {};

  return (
    <Wrapper
      {...linkProps}
      title={label}
      className={cn(
        `bg-muted inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold ${priceColorClass(value)}`,
        url && "transition-opacity hover:opacity-70",
      )}
    >
      {icon ? (
        <img src={icon} alt={label} className={cn("h-3", iconClassName)} />
      ) : (
        <span className="text-muted-foreground text-xs font-normal">{label}</span>
      )}
      {formatValue(value)}
    </Wrapper>
  );
}
