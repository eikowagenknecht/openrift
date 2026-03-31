import { Bar, BarChart, Cell, XAxis } from "recharts";

import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { DomainCount } from "@/hooks/use-deck-stats";
import { DOMAIN_COLORS } from "@/lib/domain";

interface DomainDistributionProps {
  data: DomainCount[];
}

const chartConfig: ChartConfig = {
  main: { label: "Main Deck" },
  sideboard: { label: "Sideboard" },
};

export function DomainDistribution({ data }: DomainDistributionProps) {
  if (data.length === 0) {
    return null;
  }

  return (
    <div>
      <h4 className="mb-1 text-xs font-medium">Domains</h4>
      <ChartContainer config={chartConfig} className="aspect-auto h-20 w-full">
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="domain" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Bar
            dataKey="main"
            stackId="domain"
            name="Main"
            activeBar={{ opacity: 0.8 }}
            radius={[0, 0, 0, 0]}
          >
            {data.map((entry) => (
              <Cell key={entry.domain} fill={DOMAIN_COLORS[entry.domain] ?? "#737373"} />
            ))}
          </Bar>
          <Bar
            dataKey="sideboard"
            stackId="domain"
            name="Sideboard"
            activeBar={{ opacity: 0.8 }}
            radius={[3, 3, 0, 0]}
          >
            {data.map((entry) => (
              <Cell
                key={entry.domain}
                fill={DOMAIN_COLORS[entry.domain] ?? "#737373"}
                opacity={0.4}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
