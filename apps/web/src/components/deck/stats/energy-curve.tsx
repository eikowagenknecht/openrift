import type { Domain } from "@openrift/shared";
import { Bar, BarChart, XAxis } from "recharts";

import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { EnergyCostCount } from "@/hooks/use-deck-stats";
import { DOMAIN_COLORS } from "@/lib/domain";

interface EnergyCurveProps {
  data: EnergyCostCount[];
  domains: Domain[];
}

function buildChartConfig(domains: Domain[]): ChartConfig {
  const config: ChartConfig = {};
  for (const domain of domains) {
    config[domain] = { label: domain, color: DOMAIN_COLORS[domain] ?? "#737373" };
  }
  return config;
}

export function EnergyCurve({ data, domains }: EnergyCurveProps) {
  if (data.length === 0) {
    return <p className="text-muted-foreground text-xs">No energy data yet</p>;
  }

  const chartConfig = buildChartConfig(domains);

  return (
    <div>
      <h4 className="mb-1 text-xs font-medium">Energy Curve</h4>
      <ChartContainer config={chartConfig} className="aspect-auto h-20 w-full">
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="energy" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          {domains.map((domain, index) => (
            <Bar
              key={domain}
              dataKey={domain}
              stackId="energy"
              fill={DOMAIN_COLORS[domain] ?? "#737373"}
              activeBar={{ opacity: 0.8 }}
              radius={index === domains.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
}
