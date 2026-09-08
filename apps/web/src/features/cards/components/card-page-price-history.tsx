import { enumLabel } from "@openrift/shared/enum-label";
import { marketplaceLabel } from "@openrift/shared/marketplace";
import { snapshotHeadline } from "@openrift/shared/types/api/pricing";
import type { Printing } from "@openrift/shared/types/catalog";
import type { Marketplace, TimeRange } from "@openrift/shared/types/pricing";
import { ALL_MARKETPLACES, MARKETPLACE_CURRENCY } from "@openrift/shared/types/pricing";
import { WellKnown } from "@openrift/shared/well-known";
import { lazy, Suspense, useState } from "react";

import { Heading } from "@/components/heading";
import { LanguageChip } from "@/components/language-chip";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { Card as CardPanel } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PricingSection } from "@/features/cards/components/card-detail/pricing";
import { TIME_RANGES } from "@/features/cards/components/price-history-chart-constants";
import { PriceTrend } from "@/features/cards/components/price-trend";
import { usePriceHistory } from "@/features/cards/hooks/use-price-history";
import { useEnumOrders } from "@/hooks/use-enums";
import { formatPublicCode, formatterForMarketplace } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

const PriceHistoryChart = lazy(async () => {
  const m = await import("@/features/cards/components/price-history-chart");
  return { default: m.PriceHistoryChart };
});

export function PriceHistorySection({ printing }: { printing: Printing }) {
  const { data } = usePriceHistory(printing.id, "all");
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange>("30d");
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const [source, setSource] = useState<Marketplace>(marketplaceOrder[0]);
  const { labels } = useEnumOrders();

  const { data: rangeData } = usePriceHistory(printing.id, range);

  const hasAnyData =
    data &&
    ALL_MARKETPLACES.some((mp) => {
      const mpData = data[mp];
      return mpData?.available && mpData.snapshots.length > 0;
    });

  if (!hasAnyData) {
    return null;
  }

  const allSnapshots = data?.[source]?.snapshots;
  const spanSnapshots = allSnapshots && allSnapshots.length >= 2 ? allSnapshots : undefined;
  const firstSnapshot = spanSnapshots?.[0];
  const lastSnapshot = spanSnapshots?.at(-1);
  const dataSpanDays =
    firstSnapshot && lastSnapshot
      ? Math.round(
          (new Date(lastSnapshot.date).getTime() - new Date(firstSnapshot.date).getTime()) /
            86_400_000,
        )
      : null;

  const availableRanges = TIME_RANGES.filter(
    (tr) => tr.days === 0 || dataSpanDays === null || dataSpanDays >= tr.days,
  );

  const effectiveRange = availableRanges.some((tr) => tr.value === range)
    ? range
    : ("all" as TimeRange);

  const dateMap = new Map<
    string,
    { tcgplayer?: number; cardmarket?: number; cardtrader?: number }
  >();
  if (rangeData) {
    for (const mp of ALL_MARKETPLACES) {
      const mpData = rangeData[mp];
      if (!mpData?.available) {
        continue;
      }
      for (const snap of mpData.snapshots) {
        const entry = dateMap.get(snap.date) ?? {};
        entry[mp] = snapshotHeadline(snap);
        dateMap.set(snap.date, entry);
      }
    }
  }
  const tableRows = [...dateMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, prices]) => ({ date, ...prices }));

  const availableMarketplaces = rangeData
    ? ALL_MARKETPLACES.filter((mp) => rangeData[mp]?.available)
    : [];

  // Must match PriceHistoryChart's normalization (market for TCG/CM, zeroLow for CardTrader).
  const plottedValues = (rangeData?.[source]?.snapshots ?? []).reduce<number[]>((values, s) => {
    const value = "market" in s ? s.market : s.zeroLow;
    if (value !== null) {
      values.push(value);
    }
    return values;
  }, []);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Heading level={2}>
          Price History — {formatPublicCode(printing)}
          {printing.finish !== WellKnown.finish.NORMAL &&
            ` ${enumLabel(labels.finishes, printing.finish)}`}
          {printing.markers.length > 0 && ` (${printing.markers.map((m) => m.label).join(", ")})`}
          {printing.language !== WellKnown.language.EN && (
            <>
              {" "}
              <LanguageChip code={printing.language} />
            </>
          )}
        </Heading>
        <PricingSection printing={printing} range={effectiveRange} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[effectiveRange]}
          onValueChange={([next]) => {
            const match = availableRanges.find((tr) => tr.value === next);
            if (match) {
              setRange(match.value);
            }
          }}
          aria-label="Time range"
        >
          {availableRanges.map((tr) => (
            <ToggleGroupItem key={tr.value} value={tr.value}>
              {tr.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
          {marketplaceLabel(source)}
          <PriceTrend values={plottedValues} range={effectiveRange} />
        </span>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[source]}
          onValueChange={([next]) => {
            const match = marketplaceOrder.find((mp) => mp === next);
            if (match) {
              setSource(match);
            }
          }}
          aria-label="Price source"
          className="ml-auto"
        >
          {marketplaceOrder.map((mp) => {
            const available = data?.[mp]?.available ?? false;
            const label = marketplaceLabel(mp);
            return (
              <Tooltip key={mp}>
                <TooltipTrigger
                  render={
                    <ToggleGroupItem
                      value={mp}
                      disabled={!available && Boolean(data)}
                      aria-label={label}
                    />
                  }
                >
                  <MarketplaceIcon marketplace={mp} />
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        <CardPanel className="min-w-0 p-4 xl:flex-1 xl:basis-0">
          <Suspense fallback={<Skeleton className="aspect-[2.5/1] w-full rounded-lg" />}>
            <PriceHistoryChart
              printingId={printing.id}
              range={effectiveRange}
              onRangeChange={setRange}
              source={source}
              onSourceChange={setSource}
              hideControls
              highlightedDate={hoveredDate}
              onDateHover={setHoveredDate}
            />
          </Suspense>
        </CardPanel>
        {tableRows.length > 0 && (
          // contain-inline-size: without it the table's intrinsic width leaks up the
          // flex column and widens the page past a phone viewport.
          <div className="min-w-0 contain-inline-size xl:flex-1 xl:basis-0">
            <div className="max-h-[400px] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="border-border bg-muted border-b">
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Date
                    </th>
                    {availableMarketplaces.map((mp) => (
                      <th key={mp} scope="col" className="px-3 py-2 text-right font-medium">
                        {marketplaceLabel(mp)} ({MARKETPLACE_CURRENCY[mp]})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr
                      key={row.date}
                      className={cn(
                        "border-border border-b transition-colors last:border-b-0",
                        hoveredDate === row.date && "bg-muted",
                      )}
                      onMouseEnter={() => setHoveredDate(row.date)}
                      onMouseLeave={() => setHoveredDate(null)}
                    >
                      <td className="text-muted-foreground px-3 py-1.5 whitespace-nowrap">
                        {row.date}
                      </td>
                      {availableMarketplaces.map((mp) => {
                        const value = row[mp];
                        const fmt = formatterForMarketplace(mp);
                        return (
                          <td key={mp} className="px-3 py-1.5 text-right tabular-nums">
                            {value === undefined ? "—" : fmt(value)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
