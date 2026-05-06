import { Bar, BarChart, XAxis } from "recharts";

import { CrispBar, CrispBarActive } from "@/components/deck/stats/crisp-bar";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { DomainCombo, EnergyCostCount, PowerCount } from "@/hooks/use-deck-stats";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { getDomainColor } from "@/lib/domain";

interface EnergyPowerChartProps {
  energyData: EnergyCostCount[];
  energyStacks: DomainCombo[];
  averageEnergy: number | null;
  powerData: PowerCount[];
  powerStacks: DomainCombo[];
  averagePower: number | null;
  /** When true, render a single primary-colored bar instead of domain-colored stacks. */
  singleColor?: boolean;
}

interface SingleChartProps {
  data: (EnergyCostCount | PowerCount)[];
  stacks: DomainCombo[];
  average: number | null;
  label: string;
  /** Metric axis key: "energy" for EnergyCostCount, "power" for PowerCount. */
  metric: "energy" | "power";
  /** Floor for the x-axis max — pads the chart out when the deck is small. */
  minAxisMax: number;
  /** When true, render a single primary-colored bar instead of domain-colored stacks. */
  singleColor?: boolean;
}

function buildChartConfig(
  stacks: DomainCombo[],
  prefix: string,
  colors: Record<string, string>,
): ChartConfig {
  const config: ChartConfig = {};
  for (const stack of stacks) {
    const isMulti = stack.domains.length > 1;
    config[`${prefix}_${stack.key}`] = {
      label: stack.domains.join(" + "),
      color: isMulti ? "#737373" : getDomainColor(stack.domains[0], colors),
      ...(isMulti && {
        gradient: stack.domains.map((domain) => getDomainColor(domain, colors)),
      }),
    };
  }
  return config;
}

/**
 * Returns the fill value for a domain combo — solid color for singles,
 * gradient URL reference for multi-domain combos.
 * @returns A CSS fill string.
 */
function comboFill(stack: DomainCombo, colors: Record<string, string>): string {
  if (stack.domains.length === 1) {
    return getDomainColor(stack.domains[0], colors);
  }
  return `url(#gradient-${stack.key})`;
}

/**
 * Renders SVG gradient definitions for all multi-domain combos.
 * @returns An SVG defs element with gradient definitions.
 */
function GradientDefs({
  stacks,
  colors,
}: {
  stacks: DomainCombo[];
  colors: Record<string, string>;
}) {
  const multiDomain = stacks.filter((stack) => stack.domains.length > 1);
  if (multiDomain.length === 0) {
    return null;
  }
  return (
    <defs>
      {multiDomain.map((stack) => (
        <linearGradient key={stack.key} id={`gradient-${stack.key}`} x1="0" y1="1" x2="0" y2="0">
          {stack.domains.map((domain, index) => {
            const count = stack.domains.length;
            return (
              <stop
                key={domain}
                offset={`${((index + 0.5) / count) * 100}%`}
                stopColor={getDomainColor(domain, colors)}
              />
            );
          })}
        </linearGradient>
      ))}
    </defs>
  );
}

/**
 * Single stacked bar chart for one numeric metric (energy or power).
 * @returns A single chart with a heading row and stacked bars.
 */
function SingleChart({
  data,
  stacks,
  average,
  label,
  metric,
  minAxisMax,
  singleColor,
}: SingleChartProps) {
  const domainColors = useDomainColors();
  if (data.length === 0) {
    return null;
  }

  const valueMap = new Map(data.map((entry) => [Number(entry[metric]), entry]));
  const maxValue = Math.max(minAxisMax, ...data.map((entry) => Number(entry[metric])));

  const heading = (
    <div className="mb-1 flex items-center text-xs">
      <h4 className="font-medium">{label}</h4>
      {average !== null && (
        <span className="text-muted-foreground ml-auto">Ø {average.toFixed(1)}</span>
      )}
    </div>
  );

  if (singleColor) {
    const totalKey = `${metric}_total`;
    const singleConfig: ChartConfig = {
      [totalKey]: { label: "Count", color: "var(--color-primary)" },
    };
    const chartData = Array.from({ length: maxValue + 1 }, (_, value) => {
      const entry = valueMap.get(value);
      let total = 0;
      if (entry) {
        for (const stack of stacks) {
          total += (entry[stack.key] as number) ?? 0;
        }
      }
      return { value: String(value), [totalKey]: total };
    });
    return (
      <div>
        {heading}
        <ChartContainer
          config={singleConfig}
          className="aspect-auto h-20 w-full @3xl:h-28 @5xl:h-36"
        >
          <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="value" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent labelFormatter={(value) => `${value} ${label}`} />}
            />
            <Bar
              dataKey={`${metric}_total`}
              fill="var(--color-primary)"
              activeBar={<CrispBarActive />}
              shape={<CrispBar />}
            />
          </BarChart>
        </ChartContainer>
      </div>
    );
  }

  const chartData = Array.from({ length: maxValue + 1 }, (_, value) => {
    const entry = valueMap.get(value);
    const row: Record<string, string | number> = { value: String(value) };
    for (const stack of stacks) {
      row[`${metric}_${stack.key}`] = (entry?.[stack.key] as number) ?? 0;
    }
    return row;
  });
  const chartConfig = buildChartConfig(stacks, metric, domainColors);

  return (
    <div>
      {heading}
      <ChartContainer config={chartConfig} className="aspect-auto h-20 w-full @3xl:h-28 @5xl:h-36">
        <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <GradientDefs stacks={stacks} colors={domainColors} />
          <XAxis dataKey="value" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent reverseOrder labelFormatter={(value) => `${value} ${label}`} />
            }
          />
          {stacks.map((stack) => (
            <Bar
              key={`${metric}_${stack.key}`}
              dataKey={`${metric}_${stack.key}`}
              stackId="a"
              fill={comboFill(stack, domainColors)}
              activeBar={<CrispBarActive />}
              shape={<CrispBar />}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
}

export function EnergyChart({
  data,
  stacks,
  average,
  singleColor,
}: {
  data: EnergyCostCount[];
  stacks: DomainCombo[];
  average: number | null;
  singleColor?: boolean;
}) {
  return (
    <SingleChart
      data={data}
      stacks={stacks}
      average={average}
      label="Energy"
      metric="energy"
      minAxisMax={8}
      singleColor={singleColor}
    />
  );
}

export function PowerChart({
  data,
  stacks,
  average,
  singleColor,
}: {
  data: PowerCount[];
  stacks: DomainCombo[];
  average: number | null;
  singleColor?: boolean;
}) {
  return (
    <SingleChart
      data={data}
      stacks={stacks}
      average={average}
      label="Power"
      metric="power"
      minAxisMax={4}
      singleColor={singleColor}
    />
  );
}

export function EnergyPowerChart({
  energyData,
  energyStacks,
  averageEnergy,
  powerData,
  powerStacks,
  averagePower,
  singleColor,
}: EnergyPowerChartProps) {
  if (energyData.length === 0 && powerData.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3">
      <EnergyChart
        data={energyData}
        stacks={energyStacks}
        average={averageEnergy}
        singleColor={singleColor}
      />
      <PowerChart
        data={powerData}
        stacks={powerStacks}
        average={averagePower}
        singleColor={singleColor}
      />
    </div>
  );
}
