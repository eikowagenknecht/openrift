import type { AnySnapshot, Marketplace, TimeRange } from "@openrift/shared";
import { formatDay, marketplaceLabel } from "@openrift/shared";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";

import { TIME_RANGES } from "@/components/cards/price-history-chart-constants";
import { PriceTrend } from "@/components/cards/price-trend";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePriceHistory } from "@/hooks/use-price-history";
import { formatterForMarketplace } from "@/lib/format";
import { useDisplayStore } from "@/stores/display-store";

const chartConfig = {
  value: { label: "Market", color: "var(--chart-1)" },
  low: { label: "Low", color: "var(--chart-2)" },
} satisfies ChartConfig;

interface PriceHistoryTooltipContentProps {
  active?: boolean;
  payload?: { payload: { date: string; value: number | null; low: number | null } }[];
  source: Marketplace;
  currencyFormatter: (value: number) => string;
}

function PriceHistoryTooltipContent({
  active,
  payload,
  source,
  currencyFormatter,
}: PriceHistoryTooltipContentProps) {
  if (!active || !payload?.length) {
    return null;
  }
  const snap = payload[0].payload;
  const headlineLabel = source === "cardtrader" ? "Zero" : "Market";
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-md">
      <p className="mb-1 font-medium">{formatDay(snap.date)}</p>
      <div className="space-y-0.5">
        {snap.value !== null && snap.value !== undefined && (
          <div className="flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: "var(--color-value)" }}
            />
            <span className="text-muted-foreground">{headlineLabel}</span>
            <span className="ml-auto font-mono font-medium tabular-nums">
              {currencyFormatter(snap.value)}
            </span>
          </div>
        )}
        {snap.low !== null && snap.low !== undefined && (
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ backgroundColor: "var(--color-low)" }} />
            <span className="text-muted-foreground">Low</span>
            <span className="ml-auto font-mono font-medium tabular-nums">
              {currencyFormatter(snap.low)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface PriceHistoryChartProps {
  printingId: string;
  range?: TimeRange;
  onRangeChange?: (range: TimeRange) => void;
  /** Date string to highlight on the chart (e.g. from table row hover). */
  highlightedDate?: string | null;
  /** Called when the user hovers a point on the chart (date string or null on leave). */
  onDateHover?: (date: string | null) => void;
  /** Externally controlled marketplace source. */
  source?: Marketplace;
  /** Called when the user changes the marketplace source. */
  onSourceChange?: (source: Marketplace) => void;
  /** Hide the built-in toolbar (time range + source buttons). */
  hideControls?: boolean;
}

export function PriceHistoryChart({
  printingId,
  range: controlledRange,
  onRangeChange,
  highlightedDate,
  onDateHover,
  source: controlledSource,
  onSourceChange,
  hideControls,
}: PriceHistoryChartProps) {
  const [internalRange, setInternalRange] = useState<TimeRange>("30d");
  const range = controlledRange ?? internalRange;
  const setRange = onRangeChange ?? setInternalRange;
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const [internalSource, setInternalSource] = useState<Marketplace>(
    marketplaceOrder[0] ?? "cardtrader",
  );
  const source = controlledSource ?? internalSource;
  const setSource = onSourceChange ?? setInternalSource;

  const { data: allData } = usePriceHistory(printingId, "all");

  // Compute the actual data span (in days) for the active source so we can
  // hide range buttons that exceed available history.
  const allSnapshots = allData?.[source]?.snapshots;
  const dataSpanDays =
    allSnapshots && allSnapshots.length >= 2
      ? Math.round(
          // oxlint-disable-next-line no-non-null-assertion -- length >= 2 is checked above
          (new Date(allSnapshots.at(-1)!.date).getTime() -
            new Date(allSnapshots[0].date).getTime()) /
            86_400_000,
        )
      : null;

  const availableRanges = TIME_RANGES.filter(
    (tr) => tr.days === 0 || dataSpanDays === null || dataSpanDays >= tr.days,
  );

  // If the active range was hidden (e.g. source switch), fall back to "all".
  const effectiveRange = availableRanges.some((tr) => tr.value === range)
    ? range
    : ("all" as TimeRange);

  const { data, isLoading, error } = usePriceHistory(printingId, effectiveRange);

  const currencyFormatter = formatterForMarketplace(source);
  const sourceData = data?.[source];
  // Normalize per-source snapshot shapes into a uniform `{date, value, low?}`.
  // TCG/CM: headline is `market`, `low` is the secondary line. CardTrader:
  // headline is the Zero-eligible low drawn directly (breaking on null days,
  // so snapshots from before zero_low_cents was recorded don't get silently
  // plotted as the cheaper overall-low — which would make the line appear to
  // jump up at the point the Zero data begins). The overall low is plotted
  // as the always-on secondary dashed line, matching TCG/CM.
  const rawSnapshots: AnySnapshot[] = sourceData?.snapshots ?? [];
  const snapshots = rawSnapshots.map((s) => ({
    date: s.date,
    value: "market" in s ? s.market : s.zeroLow,
    low: s.low,
  }));

  const hasLow = snapshots.some((s) => s.low !== null);
  const plottedValues = snapshots.reduce<number[]>((values, s) => {
    if (s.value !== null) {
      values.push(s.value);
    }
    return values;
  }, []);

  const btnSize = "sm" as const;

  return (
    <div className="space-y-3">
      {/* Time range + source row */}
      {!hideControls && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ToggleGroup
            variant="outline"
            size={btnSize}
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
          {/* Names the plotted series in full. The toggle beside it is logos
              only, so this is where the source is actually spelled out. */}
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
            {marketplaceLabel(source)}
            <PriceTrend values={plottedValues} range={effectiveRange} />
          </span>
          <ToggleGroup
            variant="outline"
            size={btnSize}
            spacing={0}
            value={[source]}
            onValueChange={([next]) => {
              const match = marketplaceOrder.find((s) => s === next);
              if (match) {
                setSource(match);
              }
            }}
            aria-label="Price source"
            className="ml-auto"
          >
            {marketplaceOrder.map((s) => {
              const available = data?.[s]?.available ?? false;
              const label = marketplaceLabel(s);
              return (
                <Tooltip key={s}>
                  <TooltipTrigger
                    render={
                      <ToggleGroupItem
                        value={s}
                        disabled={!available && Boolean(data)}
                        aria-label={label}
                      />
                    }
                  >
                    <MarketplaceIcon marketplace={s} />
                  </TooltipTrigger>
                  <TooltipContent>{label}</TooltipContent>
                </Tooltip>
              );
            })}
          </ToggleGroup>
        </div>
      )}

      {/* Chart */}
      {/* Chart-shaped rather than a short spinner row: this is the card
          detail's default view now, so a stubby placeholder would snap the
          whole panel taller the moment the history lands. */}
      {isLoading && (
        <div className="flex aspect-[2.5/1] w-full items-center justify-center">
          <Loader2Icon className="text-muted-foreground size-5 animate-spin" />
        </div>
      )}

      {error && (
        <p className="text-destructive py-8 text-center text-sm">Failed to load price history.</p>
      )}

      {!isLoading && !error && snapshots.length === 0 && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No price data available for this time range.
        </p>
      )}

      {!isLoading && !error && snapshots.length > 0 && (
        <ChartContainer config={chartConfig} className="aspect-[2.5/1] w-full">
          <ComposedChart
            data={snapshots}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            onMouseMove={(state: Record<string, unknown>) => {
              const activePayload = state?.activePayload as
                | { payload?: Record<string, unknown> }[]
                | undefined;
              if (onDateHover && activePayload?.length) {
                const date = activePayload[0].payload?.date as string | undefined;
                if (date) {
                  onDateHover(date);
                }
              }
            }}
            onMouseLeave={() => onDateHover?.(null)}
          >
            <defs>
              <linearGradient id="marketFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            {highlightedDate && (
              <ReferenceLine
                x={highlightedDate}
                stroke="var(--color-value)"
                strokeWidth={2}
                strokeOpacity={0.6}
              />
            )}
            <XAxis
              dataKey="date"
              tickFormatter={formatDay}
              tick={{ fontSize: 11 }}
              interval={Math.max(0, Math.ceil(snapshots.length / 4) - 1)}
            />
            <YAxis
              tickFormatter={(v: number) => currencyFormatter(v)}
              tick={{ fontSize: 11 }}
              width={48}
              padding={{ top: 8 }}
            />
            <ChartTooltip
              content={
                <PriceHistoryTooltipContent source={source} currencyFormatter={currencyFormatter} />
              }
            />
            {/* Headline value: filled area + solid line */}
            <Area
              dataKey="value"
              type="monotone"
              stroke="var(--color-value)"
              strokeWidth={2}
              fill="url(#marketFill)"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            {/* Low: dashed line */}
            {hasLow && (
              <Line
                dataKey="low"
                type="monotone"
                stroke="var(--color-low)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ChartContainer>
      )}
    </div>
  );
}
