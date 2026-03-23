import type { Printing, TimeRange } from "@openrift/shared";
import { TrendingDown, TrendingUp } from "lucide-react";

import { usePriceHistory } from "@/hooks/use-price-history";
import { affiliateUrl, cardtraderAffiliateUrl } from "@/lib/affiliate";
import { formatPrice, formatPriceEur, priceColorClass } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PricingSection({ printing, range }: { printing: Printing; range: TimeRange }) {
  const { data: history } = usePriceHistory(printing.id, range);
  const cmSnapshots = history?.cardmarket.snapshots;
  const cmLatest = cmSnapshots?.length ? cmSnapshots.at(-1) : null;
  const ctSnapshots = history?.cardtrader.snapshots;
  const ctLatest = ctSnapshots?.length ? ctSnapshots.at(-1) : null;

  if (printing.marketPrice === undefined && !cmLatest && !ctLatest) {
    return null;
  }

  const tcgProductId = history?.tcgplayer.productId;
  const tcgUrl = tcgProductId
    ? affiliateUrl(`https://www.tcgplayer.com/product/${tcgProductId}`)
    : null;
  const cmProductId = history?.cardmarket.productId;
  const cmUrl = cmProductId
    ? `https://www.cardmarket.com/en/Riftbound/Products?idProduct=${cmProductId}`
    : null;
  const ctProductId = history?.cardtrader.productId;
  const ctUrl = ctProductId
    ? cardtraderAffiliateUrl(`https://www.cardtrader.com/en/riftbound/cards/${ctProductId}`)
    : null;

  return (
    <div className="flex items-center justify-end gap-1.5">
      {printing.marketPrice !== undefined && (
        <>
          <PriceTrend printingId={printing.id} range={range} />
          <PriceChip
            label="TCGplayer"
            icon="/images/external/tcgplayer-38x28.webp"
            iconClassName="invert dark:invert-0"
            value={printing.marketPrice}
            url={tcgUrl}
          />
        </>
      )}
      {cmLatest && (
        <PriceChip
          label="Cardmarket"
          icon="/images/external/cardmarket-20x28.webp"
          iconClassName="invert dark:invert-0"
          value={cmLatest.market}
          url={cmUrl}
          formatValue={formatPriceEur}
        />
      )}
      {ctLatest && (
        <PriceChip
          label="CardTrader"
          icon="/images/external/cardtrader-20x28.webp"
          iconClassName="invert dark:invert-0"
          value={ctLatest.market}
          url={ctUrl}
          formatValue={formatPriceEur}
        />
      )}
    </div>
  );
}

const RANGE_LABELS: Record<TimeRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "all time",
};

function PriceTrend({ printingId, range = "30d" }: { printingId: string; range?: TimeRange }) {
  const { data } = usePriceHistory(printingId, range);
  const snapshots = data?.tcgplayer.snapshots;
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
  const linkProps = url ? { href: url, target: "_blank" as const, rel: "noopener noreferrer" } : {};

  return (
    <Wrapper
      {...linkProps}
      title={label}
      className={cn(
        `inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-sm font-semibold ${priceColorClass(value)}`,
        url && "transition-opacity hover:opacity-70",
      )}
    >
      {icon ? (
        <img src={icon} alt={label} className={cn("h-3", iconClassName)} />
      ) : (
        <span className="text-xs font-normal text-muted-foreground">{label}</span>
      )}
      {formatValue(value)}
    </Wrapper>
  );
}
