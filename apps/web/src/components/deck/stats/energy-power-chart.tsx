import type { Domain } from "@openrift/shared";
import { DOMAIN_ORDER } from "@openrift/shared";
import { Bar, BarChart, ReferenceLine, XAxis } from "recharts";

import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { EnergyCostCount, PowerCount } from "@/hooks/use-deck-stats";
import { DOMAIN_COLORS } from "@/lib/domain";

interface EnergyPowerChartProps {
  energyData: EnergyCostCount[];
  energyDomains: Domain[];
  averageEnergy: number | null;
  powerData: PowerCount[];
  powerDomains: Domain[];
}

interface MergedEntry {
  value: string;
  [key: string]: string | number;
}

function buildChartConfig(domains: Domain[]): ChartConfig {
  const config: ChartConfig = {};
  for (const domain of domains) {
    config[`energy_${domain}`] = {
      label: `${domain} (Energy)`,
      color: DOMAIN_COLORS[domain] ?? "#737373",
    };
    config[`power_${domain}`] = {
      label: `${domain} (Power)`,
      color: DOMAIN_COLORS[domain] ?? "#737373",
    };
  }
  return config;
}

export function EnergyPowerChart({
  energyData,
  energyDomains,
  averageEnergy,
  powerData,
  powerDomains,
}: EnergyPowerChartProps) {
  if (energyData.length === 0 && powerData.length === 0) {
    return null;
  }

  // Build a union of all numeric values from both datasets
  const valueSet = new Set<number>();
  for (const entry of energyData) {
    valueSet.add(Number(entry.energy));
  }
  for (const entry of powerData) {
    valueSet.add(Number(entry.power));
  }
  const allValues = [...valueSet].sort((a, b) => a - b);

  // Build energy and power lookup maps
  const energyMap = new Map(energyData.map((entry) => [entry.energy, entry]));
  const powerMap = new Map(powerData.map((entry) => [entry.power, entry]));

  // Union of domains, in DOMAIN_ORDER
  const allDomainSet = new Set([...energyDomains, ...powerDomains]);
  const allDomains = DOMAIN_ORDER.filter((domain) => allDomainSet.has(domain));

  // Merge into a single dataset: energy values positive, power values negative
  const merged: MergedEntry[] = allValues.map((value) => {
    const key = String(value);
    const energyEntry = energyMap.get(key);
    const powerEntry = powerMap.get(key);
    const entry: MergedEntry = { value: key };
    for (const domain of allDomains) {
      entry[`energy_${domain}`] = (energyEntry?.[domain] as number) ?? 0;
      entry[`power_${domain}`] = -((powerEntry?.[domain] as number) ?? 0);
    }
    return entry;
  });

  const chartConfig = buildChartConfig(allDomains);

  return (
    <div>
      <div className="mb-1 flex items-center text-xs">
        <h4 className="font-medium">Energy &amp; Power</h4>
        {averageEnergy !== null && (
          <span className="text-muted-foreground ml-auto">Ø {averageEnergy.toFixed(1)} Energy</span>
        )}
      </div>
      <div className="relative pl-5">
        <div
          className="text-muted-foreground pointer-events-none absolute top-0 bottom-0 left-0 flex w-4 flex-col items-center text-[9px] leading-none"
          style={{ bottom: "18px" }}
        >
          <span className="flex flex-1 -rotate-90 items-center whitespace-nowrap">Energy</span>
          <span className="flex flex-1 -rotate-90 items-center whitespace-nowrap opacity-50">
            Power
          </span>
        </div>
        <ChartContainer config={chartConfig} className="aspect-auto h-28 w-full">
          <BarChart
            data={merged}
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            stackOffset="sign"
          >
            <XAxis dataKey="value" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <ReferenceLine y={0} className="stroke-border" />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value, name) => {
                    const absValue = Math.abs(Number(value));
                    if (absValue === 0) {
                      return null;
                    }
                    const [prefix, domain] = (name as string).split("_");
                    const label = prefix === "energy" ? "Energy" : "Power";
                    return (
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-[2px]"
                          style={{
                            backgroundColor: DOMAIN_COLORS[domain ?? ""] ?? "#737373",
                            opacity: prefix === "power" ? 0.4 : 1,
                          }}
                        />
                        <span className="text-muted-foreground">
                          {domain} ({label})
                        </span>
                        <span className="ml-auto font-mono font-medium">{absValue}</span>
                      </div>
                    );
                  }}
                  hideLabel={false}
                  labelFormatter={(label) => `Cost / Power: ${label}`}
                />
              }
            />
            {/* Energy bars (positive, going up) — last rendered is the outermost (top) */}
            {allDomains.toReversed().map((domain, index) => (
              <Bar
                key={`energy_${domain}`}
                dataKey={`energy_${domain}`}
                stackId="a"
                fill={DOMAIN_COLORS[domain] ?? "#737373"}
                activeBar={{ opacity: 0.8 }}
                radius={index === allDomains.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
            {/* Power bars (negative, going down) — last rendered is the outermost (bottom) */}
            {allDomains.map((domain, index) => (
              <Bar
                key={`power_${domain}`}
                dataKey={`power_${domain}`}
                stackId="a"
                fill={DOMAIN_COLORS[domain] ?? "#737373"}
                opacity={0.4}
                activeBar={{ opacity: 0.6 }}
                radius={index === allDomains.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
