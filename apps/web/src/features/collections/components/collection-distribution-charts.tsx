import { enumLabel } from "@openrift/shared/enum-label";
import { useState } from "react";
import type { PieSectorDataItem } from "recharts";
import { Label, Pie, PieChart, Sector } from "recharts";

import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer } from "@/components/ui/chart";
import type { DomainCount, RarityCount } from "@/features/collections/lib/stat-types";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { getDomainColor } from "@/lib/domain";

interface DonutEntry {
  name: string;
  value: number;
  fill: string;
}

function DonutActiveShape(props: PieSectorDataItem & { isActive?: boolean }) {
  return <Sector {...props} outerRadius={(props.outerRadius ?? 0) + (props.isActive ? 4 : 0)} />;
}

interface DonutCenterLabelProps {
  viewBox?: { cx?: number; cy?: number } | unknown;
  active?: DonutEntry;
}

function DonutCenterLabel({ viewBox, active }: DonutCenterLabelProps) {
  if (!viewBox || typeof viewBox !== "object" || !("cx" in viewBox) || !("cy" in viewBox)) {
    return null;
  }
  const cx = viewBox.cx as number | undefined;
  const cy = viewBox.cy as number | undefined;
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
      {active ? (
        <>
          <tspan x={cx} y={(cy ?? 0) - 6} className="fill-foreground text-sm font-bold">
            {active.value.toLocaleString()}
          </tspan>
          <tspan x={cx} y={(cy ?? 0) + 10} className="fill-muted-foreground text-2xs">
            {active.name}
          </tspan>
        </>
      ) : null}
    </text>
  );
}

function DistributionDonut({ data, config }: { data: DonutEntry[]; config: ChartConfig }) {
  const [activeIndex, setActiveIndex] = useState<number>();
  const active = activeIndex === undefined ? undefined : data[activeIndex];

  return (
    <div>
      <ChartContainer config={config} className="mx-auto aspect-square max-h-36">
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="90%"
            strokeWidth={2}
            isAnimationActive={false}
            shape={DonutActiveShape}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(undefined)}
          >
            <Label content={<DonutCenterLabel active={active} />} />
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {data.map((entry) => (
          <div key={entry.name} className="flex items-center gap-1.5 text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.fill }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DomainDistributionChart({ data }: { data: DomainCount[] }) {
  const domainColors = useDomainColors();
  const { labels } = useEnumOrders();

  if (data.length === 0) {
    return null;
  }

  const config: ChartConfig = {};
  const chartData: DonutEntry[] = data.map((entry) => {
    const label = enumLabel(labels.domains, entry.domain);
    const color = getDomainColor(entry.domain, domainColors);
    config[entry.domain] = { label, color };
    return { name: label, value: entry.count, fill: color };
  });

  return <DistributionDonut data={chartData} config={config} />;
}

export function RarityDistributionChart({ data }: { data: RarityCount[] }) {
  const { rarityColors, labels } = useEnumOrders();

  if (data.length === 0) {
    return null;
  }

  const config: ChartConfig = {};
  const chartData: DonutEntry[] = data.map((entry) => {
    const label = enumLabel(labels.rarities, entry.rarity);
    const color = rarityColors[entry.rarity] ?? "var(--color-muted-foreground)";
    config[entry.rarity] = { label, color };
    return { name: label, value: entry.count, fill: color };
  });

  return <DistributionDonut data={chartData} config={config} />;
}

const TYPE_CHART_COLORS: [string, ...string[]] = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export function TypeDistributionChart({ data }: { data: { type: string; total: number }[] }) {
  const { labels } = useEnumOrders();

  if (data.length === 0) {
    return null;
  }

  const config: ChartConfig = {};
  const chartData: DonutEntry[] = data.map((entry, index) => {
    const label = enumLabel(labels.cardTypes, entry.type);
    const color = TYPE_CHART_COLORS[index % TYPE_CHART_COLORS.length] ?? TYPE_CHART_COLORS[0];
    config[entry.type] = { label, color };
    return { name: label, value: entry.total, fill: color };
  });

  return <DistributionDonut data={chartData} config={config} />;
}
