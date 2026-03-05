import type { TcgplayerSnapshot, TimeRange } from "@openrift/shared";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { Area, AreaChart, Tooltip } from "recharts";

import { PriceHistoryChart } from "@/components/cards/price-history-chart";
import { ChartContainer } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { usePriceHistory } from "@/hooks/use-price-history";
import { formatPrice } from "@/lib/format";

const chartConfig = {
  market: {
    label: "Market",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

interface PriceSparklineProps {
  printingId: string;
  onRangeChange?: (range: TimeRange) => void;
}

export function PriceSparkline({ printingId, onRangeChange }: PriceSparklineProps) {
  const [expanded, setExpanded] = useState(false);
  const [range, setRange] = useState<TimeRange>("30d");
  const { data } = usePriceHistory(printingId, "30d");
  const snapshots: TcgplayerSnapshot[] = data?.tcgplayer.snapshots ?? [];
  const gradientId = `sparkFill-${useId().replaceAll(":", "")}`;

  const handleRangeChange = (newRange: TimeRange) => {
    setRange(newRange);
    onRangeChange?.(newRange);
  };

  if (snapshots.length < 2) {
    return null;
  }

  if (expanded) {
    return (
      <PriceHistoryChart
        printingId={printingId}
        range={range}
        onRangeChange={handleRangeChange}
        onCollapse={() => setExpanded(false)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      className="group/spark relative block w-full rounded-lg transition-colors hover:bg-muted/50"
    >
      <ChartContainer config={chartConfig} className="aspect-auto h-12 w-full">
        <AreaChart data={snapshots} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-market)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-market)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) {
                return null;
              }
              const snap = payload[0].payload as TcgplayerSnapshot;
              return (
                <div className="rounded-md bg-popover px-2 py-1 text-xs shadow-md">
                  <span className="font-medium">{formatPrice(snap.market)}</span>
                  <span className="ml-1.5 text-muted-foreground">{snap.date}</span>
                </div>
              );
            }}
            cursor={{ stroke: "var(--color-market)", strokeWidth: 1, strokeDasharray: "3 3" }}
            isAnimationActive={false}
          />
          <Area
            dataKey="market"
            type="monotone"
            stroke="var(--color-market)"
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
      <span className="pointer-events-none absolute bottom-0.5 left-1 text-[10px] text-muted-foreground/70">
        30D
      </span>
      <span className="pointer-events-none absolute right-1 bottom-0.5 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover/spark:opacity-100">
        <ChevronDown className="size-2.5" />
        Price history
      </span>
    </button>
  );
}
