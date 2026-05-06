import type { CompletionScopePreference, Marketplace, TimeRange } from "@openrift/shared";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { useCollectionValueHistory } from "@/hooks/use-collection-value-history";
import { formatterForMarketplace } from "@/lib/format";
import { useDisplayStore } from "@/stores/display-store";

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "all", label: "All" },
];

const chartConfig = {
  value: { label: "Value", color: "var(--chart-1)" },
} satisfies ChartConfig;

interface CollectionValueChartProps {
  collectionId?: string;
  scope: CompletionScopePreference;
}

export function CollectionValueChart({ collectionId, scope }: CollectionValueChartProps) {
  const [range, setRange] = useState<TimeRange>("30d");
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const [marketplace, setMarketplace] = useState<Marketplace>(marketplaceOrder[0] ?? "cardtrader");

  const { data, isLoading, error } = useCollectionValueHistory(
    marketplace,
    range,
    collectionId,
    scope,
  );

  const series = data?.series ?? [];
  const currencyFormatter = formatterForMarketplace(marketplace);

  return (
    <div className="space-y-3">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ButtonGroup aria-label="Time range">
          {TIME_RANGES.map((tr) => (
            <Button
              key={tr.value}
              variant={range === tr.value ? "default" : "outline"}
              size="sm"
              onClick={() => setRange(tr.value)}
            >
              {tr.label}
            </Button>
          ))}
        </ButtonGroup>
        <ButtonGroup aria-label="Price source" className="ml-auto">
          {marketplaceOrder.map((mp) => {
            const label = mp === "tcgplayer" ? "TCG" : mp === "cardmarket" ? "CM" : "CT";
            return (
              <Button
                key={mp}
                variant={marketplace === mp ? "default" : "outline"}
                size="sm"
                onClick={() => setMarketplace(mp)}
              >
                {label}
              </Button>
            );
          })}
        </ButtonGroup>
      </div>

      {/* Chart */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2Icon className="text-muted-foreground size-5 animate-spin" />
        </div>
      )}

      {error && (
        <p className="text-destructive py-8 text-center text-sm">Failed to load value history.</p>
      )}

      {!isLoading && !error && series.length === 0 && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No value history available. Add cards to your collection to start tracking.
        </p>
      )}

      {!isLoading && !error && series.length > 0 && (
        <ChartContainer config={chartConfig} className="aspect-[2.5/1] w-full">
          <ComposedChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={String}
              tick={{ fontSize: 11 }}
              interval={Math.max(0, Math.ceil(series.length / 4) - 1)}
            />
            <YAxis
              tickFormatter={(v: number) => currencyFormatter(v)}
              tick={{ fontSize: 11 }}
              width={56}
              padding={{ top: 8 }}
            />
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) {
                  return null;
                }
                const point = payload[0].payload as {
                  date: string;
                  value: number;
                  copyCount: number;
                };
                return (
                  <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                    <p className="mb-1 font-medium">{point.date}</p>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: "var(--color-value)" }}
                        />
                        <span className="text-muted-foreground">Value</span>
                        <span className="ml-auto font-mono font-medium tabular-nums">
                          {currencyFormatter(point.value)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="size-2" />
                        <span className="text-muted-foreground">Cards</span>
                        <span className="ml-auto font-mono font-medium tabular-nums">
                          {point.copyCount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Area
              dataKey="value"
              type="monotone"
              stroke="var(--color-value)"
              strokeWidth={2}
              fill="url(#valueFill)"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartContainer>
      )}
    </div>
  );
}
