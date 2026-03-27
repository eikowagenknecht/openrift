import type { TimeRange } from "@openrift/shared";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { Area, AreaChart, Tooltip } from "recharts";

import { PriceHistoryChart } from "@/components/cards/price-history-chart";
import { ChartContainer } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { usePriceHistory } from "@/hooks/use-price-history";
import { formatterForMarketplace } from "@/lib/format";
import { useDisplayStore } from "@/stores/display-store";

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
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const favorite = marketplaceOrder[0] ?? "tcgplayer";
  const { data } = usePriceHistory(printingId, "30d");
  const snapshots = data?.[favorite]?.snapshots ?? [];
  const fmt = formatterForMarketplace(favorite);
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
      className="group/spark hover:bg-muted/50 relative block w-full rounded-lg transition-colors"
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
              const snap = payload[0].payload as { market: number; date: string };
              return (
                <div className="bg-popover rounded-md px-2 py-1 text-xs shadow-md">
                  <span className="font-medium">{fmt(snap.market)}</span>
                  <span className="text-muted-foreground ml-1.5">{snap.date}</span>
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
      <span className="text-muted-foreground/70 pointer-events-none absolute bottom-0.5 left-1 text-[10px]">
        30D
      </span>
      <span className="text-muted-foreground pointer-events-none absolute right-1 bottom-0.5 inline-flex items-center gap-0.5 text-[10px] opacity-0 transition-opacity group-hover/spark:opacity-100">
        <ChevronDown className="size-2.5" />
        Price history
      </span>
    </button>
  );
}
