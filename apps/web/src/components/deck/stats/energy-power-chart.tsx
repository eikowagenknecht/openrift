import { Bar, BarChart, Rectangle, XAxis } from "recharts";

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

/**
 * Custom bar shape that only rounds top corners when this bar is the topmost
 * visible segment in its stack. Checks all stack keys above this one
 * in the data row — if any have a non-zero value, this bar gets square corners.
 * @returns A Rectangle with conditional corner rounding.
 */
function RoundedTopBar({
  aboveKeys,
  prefix,
  ...props
}: Record<string, unknown> & { aboveKeys: string[]; prefix: string }) {
  const payload = props.payload as Record<string, number> | undefined;
  const hasAbove = aboveKeys.some((key) => (payload?.[`${prefix}_${key}`] ?? 0) > 0);
  const radius: [number, number, number, number] = hasAbove ? [0, 0, 0, 0] : [3, 3, 0, 0];
  return <Rectangle {...props} radius={radius} />;
}

/**
 * Active (hovered) version of RoundedTopBar with reduced opacity.
 * @returns A Rectangle with conditional corner rounding and hover opacity.
 */
function RoundedTopBarActive({
  aboveKeys,
  prefix,
  ...props
}: Record<string, unknown> & { aboveKeys: string[]; prefix: string }) {
  const payload = props.payload as Record<string, number> | undefined;
  const hasAbove = aboveKeys.some((key) => (payload?.[`${prefix}_${key}`] ?? 0) > 0);
  const radius: [number, number, number, number] = hasAbove ? [0, 0, 0, 0] : [3, 3, 0, 0];
  return <Rectangle {...props} radius={radius} opacity={0.8} />;
}

function buildChartConfig(
  stacks: DomainCombo[],
  prefix: string,
  colors: Record<string, string>,
): ChartConfig {
  const config: ChartConfig = {};
  for (const stack of stacks) {
    config[`${prefix}_${stack.key}`] = {
      label: stack.domains.join(" + "),
      color: stack.domains.length === 1 ? getDomainColor(stack.domains[0], colors) : "#737373",
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
 * Each gradient transitions vertically between the constituent domain colors.
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
        <linearGradient key={stack.key} id={`gradient-${stack.key}`} x1="0" y1="0" x2="0" y2="1">
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

export function EnergyPowerChart({
  energyData,
  energyStacks,
  averageEnergy,
  powerData,
  powerStacks,
  averagePower,
  singleColor,
}: EnergyPowerChartProps) {
  const domainColors = useDomainColors();

  if (energyData.length === 0 && powerData.length === 0) {
    return null;
  }

  const energyMap = new Map(energyData.map((entry) => [Number(entry.energy), entry]));
  const energyMax = Math.max(8, ...energyData.map((entry) => Number(entry.energy)));

  const powerMap = new Map(powerData.map((entry) => [Number(entry.power), entry]));
  const powerMax = Math.max(4, ...powerData.map((entry) => Number(entry.power)));

  if (singleColor) {
    const singleConfig: ChartConfig = {
      energy_total: { label: "Count", color: "var(--color-primary)" },
      power_total: { label: "Count", color: "var(--color-primary)" },
    };

    const energyChartData = Array.from({ length: energyMax + 1 }, (_, value) => {
      const entry = energyMap.get(value);
      let total = 0;
      if (entry) {
        for (const stack of energyStacks) {
          total += (entry[stack.key] as number) ?? 0;
        }
      }
      return { value: String(value), energy_total: total };
    });

    const powerChartData = Array.from({ length: powerMax + 1 }, (_, value) => {
      const entry = powerMap.get(value);
      let total = 0;
      if (entry) {
        for (const stack of powerStacks) {
          total += (entry[stack.key] as number) ?? 0;
        }
      }
      return { value: String(value), power_total: total };
    });

    return (
      <div className="space-y-3">
        {energyData.length > 0 && (
          <div>
            <div className="mb-1 flex items-center text-xs">
              <h4 className="font-medium">Energy</h4>
              {averageEnergy !== null && (
                <span className="text-muted-foreground ml-auto">Ø {averageEnergy.toFixed(1)}</span>
              )}
            </div>
            <ChartContainer config={singleConfig} className="aspect-auto h-20 w-full">
              <BarChart data={energyChartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="value" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar
                  dataKey="energy_total"
                  fill="var(--color-primary)"
                  activeBar={{ opacity: 0.8 }}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </div>
        )}

        {powerData.length > 0 && (
          <div>
            <div className="mb-1 flex items-center text-xs">
              <h4 className="font-medium">Power</h4>
              {averagePower !== null && (
                <span className="text-muted-foreground ml-auto">Ø {averagePower.toFixed(1)}</span>
              )}
            </div>
            <ChartContainer config={singleConfig} className="aspect-auto h-20 w-full">
              <BarChart data={powerChartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="value" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar
                  dataKey="power_total"
                  fill="var(--color-primary)"
                  activeBar={{ opacity: 0.8 }}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </div>
        )}
      </div>
    );
  }

  const energyChartData = Array.from({ length: energyMax + 1 }, (_, value) => {
    const entry = energyMap.get(value);
    const row: Record<string, string | number> = { value: String(value) };
    for (const stack of energyStacks) {
      row[`energy_${stack.key}`] = (entry?.[stack.key] as number) ?? 0;
    }
    return row;
  });

  const powerChartData = Array.from({ length: powerMax + 1 }, (_, value) => {
    const entry = powerMap.get(value);
    const row: Record<string, string | number> = { value: String(value) };
    for (const stack of powerStacks) {
      row[`power_${stack.key}`] = (entry?.[stack.key] as number) ?? 0;
    }
    return row;
  });

  const energyConfig = buildChartConfig(energyStacks, "energy", domainColors);
  const powerConfig = buildChartConfig(powerStacks, "power", domainColors);

  // Reversed for stacking: first rendered = bottom, last = top (outermost)
  const energyReversed = energyStacks.toReversed();
  const powerReversed = powerStacks.toReversed();

  return (
    <div className="space-y-3">
      {energyData.length > 0 && (
        <div>
          <div className="mb-1 flex items-center text-xs">
            <h4 className="font-medium">Energy</h4>
            {averageEnergy !== null && (
              <span className="text-muted-foreground ml-auto">Ø {averageEnergy.toFixed(1)}</span>
            )}
          </div>
          <ChartContainer config={energyConfig} className="aspect-auto h-20 w-full">
            <BarChart data={energyChartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <GradientDefs stacks={energyStacks} colors={domainColors} />
              <XAxis dataKey="value" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              {energyReversed.map((stack, index) => {
                const aboveKeys = energyReversed.slice(index + 1).map((s) => s.key);
                return (
                  <Bar
                    key={`energy_${stack.key}`}
                    dataKey={`energy_${stack.key}`}
                    stackId="a"
                    fill={comboFill(stack, domainColors)}
                    activeBar={<RoundedTopBarActive aboveKeys={aboveKeys} prefix="energy" />}
                    shape={<RoundedTopBar aboveKeys={aboveKeys} prefix="energy" />}
                  />
                );
              })}
            </BarChart>
          </ChartContainer>
        </div>
      )}

      {powerData.length > 0 && (
        <div>
          <div className="mb-1 flex items-center text-xs">
            <h4 className="font-medium">Power</h4>
            {averagePower !== null && (
              <span className="text-muted-foreground ml-auto">Ø {averagePower.toFixed(1)}</span>
            )}
          </div>
          <ChartContainer config={powerConfig} className="aspect-auto h-20 w-full">
            <BarChart data={powerChartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <GradientDefs stacks={powerStacks} colors={domainColors} />
              <XAxis dataKey="value" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              {powerReversed.map((stack, index) => {
                const aboveKeys = powerReversed.slice(index + 1).map((s) => s.key);
                return (
                  <Bar
                    key={`power_${stack.key}`}
                    dataKey={`power_${stack.key}`}
                    stackId="a"
                    fill={comboFill(stack, domainColors)}
                    activeBar={<RoundedTopBarActive aboveKeys={aboveKeys} prefix="power" />}
                    shape={<RoundedTopBar aboveKeys={aboveKeys} prefix="power" />}
                  />
                );
              })}
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </div>
  );
}
