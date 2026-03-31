import { Bar, BarChart, XAxis } from "recharts";

import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { TypeCount } from "@/hooks/use-deck-stats";

interface TypeBreakdownProps {
  data: TypeCount[];
}

const chartConfig: ChartConfig = {
  main: { label: "Main Deck", color: "var(--muted-foreground)" },
  sideboard: { label: "Sideboard", color: "var(--muted-foreground)" },
};

export function TypeBreakdown({ data }: TypeBreakdownProps) {
  if (data.length === 0) {
    return null;
  }

  return (
    <div>
      <h4 className="mb-1 text-xs font-medium">Card Types</h4>
      <ChartContainer config={chartConfig} className="aspect-auto h-20 w-full">
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="type" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Bar
            dataKey="main"
            stackId="type"
            fill="var(--color-main)"
            activeBar={{ opacity: 0.8 }}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="sideboard"
            stackId="type"
            fill="var(--color-sideboard)"
            opacity={0.4}
            activeBar={{ opacity: 0.6 }}
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
