import type { Domain } from "@openrift/shared";
import { Bar, BarChart, XAxis } from "recharts";

import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { TypeCount } from "@/hooks/use-deck-stats";
import { DOMAIN_COLORS } from "@/lib/domain";

interface TypeBreakdownProps {
  data: TypeCount[];
  domains: Domain[];
}

function buildChartConfig(domains: Domain[]): ChartConfig {
  const config: ChartConfig = {};
  for (const domain of domains) {
    config[domain] = { label: domain, color: DOMAIN_COLORS[domain] ?? "#737373" };
  }
  return config;
}

export function TypeBreakdown({ data, domains }: TypeBreakdownProps) {
  if (data.length === 0) {
    return null;
  }

  const chartConfig = buildChartConfig(domains);

  // Add a label with count + pluralized type name
  const labeledData = data.map((entry) => ({
    ...entry,
    label: `${entry.total} ${entry.total === 1 ? entry.type : `${entry.type}s`}`,
  }));

  return (
    <div>
      <h4 className="mb-1 text-xs font-medium">Types</h4>
      <ChartContainer config={chartConfig} className="aspect-auto h-20 w-full">
        <BarChart data={labeledData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          {domains.map((domain, index) => (
            <Bar
              key={domain}
              dataKey={domain}
              stackId="type"
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
