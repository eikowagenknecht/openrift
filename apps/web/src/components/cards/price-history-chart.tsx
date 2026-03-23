import type {
  CardmarketSnapshot,
  CardtraderSnapshot,
  Marketplace,
  TcgplayerSnapshot,
  TimeRange,
} from "@openrift/shared";
import { ChevronUp, Loader2 } from "lucide-react";
import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { usePriceHistory } from "@/hooks/use-price-history";
import { formatPrice, formatPriceEur } from "@/lib/format";

const TIME_RANGES: { value: TimeRange; label: string; days: number }[] = [
  { value: "7d", label: "7D", days: 7 },
  { value: "30d", label: "30D", days: 30 },
  { value: "90d", label: "90D", days: 90 },
  { value: "all", label: "All", days: 0 },
];

const chartConfig = {
  market: { label: "Market", color: "var(--chart-1)" },
  low: { label: "Low", color: "var(--chart-2)" },
} satisfies ChartConfig;

interface PriceHistoryChartProps {
  printingId: string;
  range?: TimeRange;
  onRangeChange?: (range: TimeRange) => void;
  onCollapse?: () => void;
}

export function PriceHistoryChart({
  printingId,
  range: controlledRange,
  onRangeChange,
  onCollapse,
}: PriceHistoryChartProps) {
  const [internalRange, setInternalRange] = useState<TimeRange>("30d");
  const range = controlledRange ?? internalRange;
  const setRange = onRangeChange ?? setInternalRange;
  const [source, setSource] = useState<Marketplace>("tcgplayer");

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

  const currencyFormatter = source === "tcgplayer" ? formatPrice : formatPriceEur;
  const sourceData = data?.[source];
  const snapshots = (sourceData?.snapshots ?? []) as (
    | TcgplayerSnapshot
    | CardmarketSnapshot
    | CardtraderSnapshot
  )[];

  const hasLow = snapshots.some(
    (s) =>
      (s as unknown as Record<string, unknown>).low !== undefined &&
      (s as unknown as Record<string, unknown>).low !== null,
  );

  const btnSize = "sm" as const;

  return (
    <div className="space-y-3">
      {/* Time range + source row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ButtonGroup aria-label="Time range">
          {availableRanges.map((tr) => (
            <Button
              key={tr.value}
              variant={effectiveRange === tr.value ? "default" : "outline"}
              size={btnSize}
              onClick={() => setRange(tr.value)}
            >
              {tr.label}
            </Button>
          ))}
        </ButtonGroup>
        <ButtonGroup aria-label="Price source" className="ml-auto">
          {(["tcgplayer", "cardmarket", "cardtrader"] as const).map((s) => {
            const label = s === "tcgplayer" ? "TCG" : s === "cardmarket" ? "CM" : "CT";
            const available = data?.[s]?.available ?? false;
            return (
              <Button
                key={s}
                variant={source === s ? "default" : "outline"}
                size={btnSize}
                onClick={() => setSource(s)}
                disabled={!available && Boolean(data)}
              >
                {label}
              </Button>
            );
          })}
        </ButtonGroup>
        {onCollapse && (
          <Button variant="ghost" size="icon-sm" onClick={onCollapse}>
            <ChevronUp className="size-3.5" />
          </Button>
        )}
      </div>

      {/* Chart */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <p className="text-center text-sm text-destructive py-8">Failed to load price history.</p>
      )}

      {!isLoading && !error && snapshots.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">
          No price data available for this time range.
        </p>
      )}

      {!isLoading && !error && snapshots.length > 0 && (
        <ChartContainer config={chartConfig} className="aspect-[2.5/1] w-full">
          <ComposedChart data={snapshots} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="marketFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-market)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--color-market)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={String}
              tick={{ fontSize: 10 }}
              interval={Math.max(0, Math.ceil(snapshots.length / 4) - 1)}
            />
            <YAxis
              tickFormatter={(v: number) => currencyFormatter(v)}
              tick={{ fontSize: 10 }}
              width={48}
              padding={{ top: 8 }}
            />
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) {
                  return null;
                }
                const snap = payload[0].payload as Record<string, unknown>;
                const market = snap.market as number | null;
                const low = snap.low as number | null;
                return (
                  <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                    <p className="mb-1 font-medium">{String(snap.date)}</p>
                    <div className="space-y-0.5">
                      {market !== null && market !== undefined && (
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: "var(--color-market)" }}
                          />
                          <span className="text-muted-foreground">Market</span>
                          <span className="ml-auto font-mono font-medium tabular-nums">
                            {currencyFormatter(market)}
                          </span>
                        </div>
                      )}
                      {low !== null && low !== undefined && (
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: "var(--color-low)" }}
                          />
                          <span className="text-muted-foreground">Low</span>
                          <span className="ml-auto font-mono font-medium tabular-nums">
                            {currencyFormatter(low)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }}
            />
            {/* Market: filled area + solid line */}
            <Area
              dataKey="market"
              type="monotone"
              stroke="var(--color-market)"
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
