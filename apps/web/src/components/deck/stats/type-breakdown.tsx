import type { Domain } from "@openrift/shared";
import { Bar, BarChart, XAxis } from "recharts";

import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { TypeCount } from "@/hooks/use-deck-stats";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { getDomainColor } from "@/lib/domain";

interface TypeBreakdownProps {
  data: TypeCount[];
  domains: Domain[];
}

function buildChartConfig(domains: Domain[], colors: Record<string, string>): ChartConfig {
  const config: ChartConfig = {};
  for (const domain of domains) {
    config[domain] = { label: domain, color: getDomainColor(domain, colors) };
  }
  return config;
}

export function TypeBreakdown({ data, domains }: TypeBreakdownProps) {
  const domainColors = useDomainColors();

  if (data.length === 0) {
    return null;
  }

  const chartConfig = buildChartConfig(domains, domainColors);

  // Add a label with count + pluralized type name
  const labeledData = data.map((entry) => ({
    ...entry,
    label: `${entry.total} ${entry.total === 1 ? entry.type : `${entry.type}s`}`,
  }));

  return (
    <div>
      <ChartContainer config={chartConfig} className="aspect-auto h-20 w-full">
        <BarChart data={labeledData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          {domains.map((domain, index) => (
            <Bar
              key={domain}
              dataKey={domain}
              stackId="type"
              fill={getDomainColor(domain, domainColors)}
              activeBar={{ opacity: 0.8 }}
              radius={index === domains.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
}
