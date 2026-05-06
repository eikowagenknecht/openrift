import type { AnySnapshot, TimeRange } from "@openrift/shared";
import { snapshotHeadline } from "@openrift/shared";
import { ChevronDownIcon } from "lucide-react";
import { Suspense, lazy, useId, useState } from "react";
import { Area, AreaChart, Tooltip } from "recharts";

import { ChartContainer } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { usePriceHistory } from "@/hooks/use-price-history";
import { formatterForMarketplace } from "@/lib/format";
import { useDisplayStore } from "@/stores/display-store";

const PriceHistoryChart = lazy(async () => {
  const m = await import("@/components/cards/price-history-chart");
  return { default: m.PriceHistoryChart };
});

const chartConfig = {
  value: {
    label: "Price",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

// CardTrader's `zero_low_cents` is a recently-added column. While Zero data
// is sparse, the sparkline falls back to `zeroLow ?? low` per snapshot so
// users still see a continuous 30-day trend line. Once there are more than
// this many Zero points in the window, we plot Zero strictly — the dense
// data is accurate enough to stand on its own and mixing it with old
// overall-low would fake a price jump at the boundary.
const CT_ZERO_SPARSE_THRESHOLD = 10;

interface PriceSparklineProps {
  printingId: string;
  onRangeChange?: (range: TimeRange) => void;
}

export function PriceSparkline({ printingId, onRangeChange }: PriceSparklineProps) {
  const [expanded, setExpanded] = useState(false);
  const [range, setRange] = useState<TimeRange>("30d");
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const favorite = marketplaceOrder[0] ?? "cardtrader";
  const { data } = usePriceHistory(printingId, "30d");
  const rawSnapshots: AnySnapshot[] = data?.[favorite]?.snapshots ?? [];
  const ctZeroCount =
    favorite === "cardtrader"
      ? rawSnapshots.reduce((n, s) => (!("market" in s) && s.zeroLow !== null ? n + 1 : n), 0)
      : Number.POSITIVE_INFINITY;
  const ctFallback = ctZeroCount <= CT_ZERO_SPARSE_THRESHOLD;
  const snapshots = rawSnapshots.map((s) => ({
    date: s.date,
    value: "market" in s ? s.market : ctFallback ? snapshotHeadline(s) : s.zeroLow,
  }));
  const fmt = formatterForMarketplace(favorite);
  const gradientId = `sparkFill-${useId().replaceAll(":", "")}`;

  const handleRangeChange = (newRange: TimeRange) => {
    setRange(newRange);
    onRangeChange?.(newRange);
  };

  // In strict CT mode, many points may have `value: null` (pre-Zero days);
  // count only plottable ones so we don't render a 30-wide chart that has
  // just one solitary point on it.
  const plottableCount = snapshots.reduce((n, s) => (s.value === null ? n : n + 1), 0);
  if (plottableCount < 2) {
    return null;
  }

  if (expanded) {
    return (
      <Suspense fallback={<Skeleton className="h-12 w-full rounded-lg" />}>
        <PriceHistoryChart
          printingId={printingId}
          range={range}
          onRangeChange={handleRangeChange}
          onCollapse={() => setExpanded(false)}
        />
      </Suspense>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      className="group/spark hover:bg-muted/50 relative block w-full rounded-lg transition-colors"
    >
      <ChartContainer config={chartConfig} className="aspect-auto h-12 w-full">
        <AreaChart data={snapshots} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) {
                return null;
              }
              const snap = payload[0].payload as { value: number | null; date: string };
              if (snap.value === null) {
                return null;
              }
              return (
                <div className="bg-popover rounded-md px-2 py-1 text-xs shadow-md">
                  <span className="font-medium">{fmt(snap.value)}</span>
                  <span className="text-muted-foreground ml-1.5">{snap.date}</span>
                </div>
              );
            }}
            cursor={{ stroke: "var(--color-value)", strokeWidth: 1, strokeDasharray: "3 3" }}
            isAnimationActive={false}
          />
          <Area
            dataKey="value"
            type="monotone"
            stroke="var(--color-value)"
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
      <span className="text-muted-foreground/70 text-2xs pointer-events-none absolute bottom-0.5 left-1">
        30D
      </span>
      <span className="text-muted-foreground text-2xs pointer-events-none absolute right-1 bottom-0.5 inline-flex items-center gap-0.5 opacity-0 transition-opacity group-hover/spark:opacity-100">
        <ChevronDownIcon className="size-2.5" />
        Price history
      </span>
    </button>
  );
}
