import { useState } from "react";
import { Bar, BarChart, Cell, LabelList, XAxis } from "recharts";

import { CrispBar, CrispBarActive, SplitCrispBar } from "@/components/deck/stats/crisp-bar";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { DomainCombo, EnergyCostCount, PowerCount } from "@/hooks/use-deck-stats";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { getDomainColor } from "@/lib/domain";
import { cn } from "@/lib/utils";

interface EnergyPowerChartProps {
  energyData: EnergyCostCount[];
  energyStacks: DomainCombo[];
  averageEnergy: number | null;
  powerData: PowerCount[];
  powerStacks: DomainCombo[];
  averagePower: number | null;
  singleColor?: boolean;
  revealDomainsOnHover?: boolean;
  showTotals?: boolean;
  footnote?: string;
}

interface SingleChartProps {
  data: (EnergyCostCount | PowerCount)[];
  stacks: DomainCombo[];
  average: number | null;
  label: string;
  metric: "energy" | "power";
  minAxisMax: number;
  singleColor?: boolean;
  revealDomainsOnHover?: boolean;
  showTotals?: boolean;
  onBarClick?: (value: number) => void;
  focusValue?: number | null;
  /** Mutually exclusive with `focusValue` — a chart either owns the focus or reflects it, never both. */
  hitData?: (EnergyCostCount | PowerCount)[];
}

/** recharts 3's external click state has no `activePayload` (a v2 field); clicks resolve positionally. */
export interface ChartClickState {
  activeLabel?: string | number;
  activeIndex?: string | number | null;
  activeTooltipIndex?: string | number | null;
}

export function activeRowIndex(state: ChartClickState, rowCount: number): number | null {
  const raw = state.activeIndex ?? state.activeTooltipIndex;
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  const index = Number(raw);
  if (!Number.isInteger(index) || index < 0 || index >= rowCount) {
    return null;
  }
  return index;
}

export function TotalLabel(props: {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  value?: string | number;
}) {
  const { x, y, width, value } = props;
  if (!value || x === undefined || y === undefined || width === undefined) {
    return null;
  }
  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={Number(y) - 4}
      textAnchor="middle"
      fontSize={10}
      fill="var(--muted-foreground)"
    >
      {value}
    </text>
  );
}

function buildChartConfig(
  stacks: DomainCombo[],
  prefix: string,
  domainLabels: Record<string, string>,
  colors: Record<string, string>,
): ChartConfig {
  const config: ChartConfig = {};
  for (const stack of stacks) {
    const isMulti = stack.domains.length > 1;
    config[`${prefix}_${stack.key}`] = {
      label: stack.domains.map((domain) => domainLabels[domain]).join(" + "),
      color: isMulti ? "#737373" : getDomainColor(stack.domains[0], colors),
      ...(isMulti && {
        gradient: stack.domains.map((domain) => getDomainColor(domain, colors)),
      }),
    };
  }
  return config;
}

// ChartTooltipContent types the label as the wider ReactNode a config label may hold; it's always the axis bucket here.
function bucketLabel(value: unknown, axis: string): string {
  return typeof value === "string" || typeof value === "number" ? `${value} ${axis}` : axis;
}

function comboFill(stack: DomainCombo, colors: Record<string, string>): string {
  if (stack.domains.length === 1) {
    return getDomainColor(stack.domains[0], colors);
  }
  return `url(#gradient-${stack.key})`;
}

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

function SingleChart({
  data,
  stacks,
  average,
  label,
  metric,
  minAxisMax,
  singleColor,
  revealDomainsOnHover,
  showTotals,
  onBarClick,
  focusValue,
  hitData,
}: SingleChartProps) {
  const domainColors = useDomainColors();
  const { labels } = useEnumOrders();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  if (data.length === 0) {
    return null;
  }

  const hitMap = new Map((hitData ?? []).map((entry) => [Number(entry[metric]), entry]));
  const hitKeyFor = (key: string) => `${metric}_${key}__hit`;

  const columnOpacity = (columnValue: string) =>
    focusValue === null || focusValue === undefined || Number(columnValue) === focusValue ? 1 : 0.3;

  const valueMap = new Map(data.map((entry) => [Number(entry[metric]), entry]));
  const maxValue = Math.max(minAxisMax, ...data.map((entry) => Number(entry[metric])));

  const handleChartClick = onBarClick
    ? (state: ChartClickState) => {
        const parsed = Number(state.activeLabel);
        if (!Number.isNaN(parsed)) {
          onBarClick(parsed);
        }
      }
    : undefined;
  const chartMargin = { top: showTotals ? 14 : 0, right: 0, bottom: 0, left: 0 };

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
    const hitTotalKey = hitKeyFor("total");
    const chartData = Array.from({ length: maxValue + 1 }, (_, value) => {
      const entry = valueMap.get(value);
      const hitEntry = hitMap.get(value);
      let total = 0;
      let hitTotal = 0;
      for (const stack of stacks) {
        total += (entry?.[stack.key] as number) ?? 0;
        hitTotal += (hitEntry?.[stack.key] as number) ?? 0;
      }
      return { value: String(value), [totalKey]: total, [hitTotalKey]: hitTotal };
    });
    return (
      <div>
        {heading}
        <ChartContainer
          config={singleConfig}
          className={cn("aspect-auto h-28 w-full", onBarClick && "cursor-pointer")}
        >
          <BarChart data={chartData} margin={chartMargin} onClick={handleChartClick}>
            <XAxis dataKey="value" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent labelFormatter={(value) => bucketLabel(value, label)} />
              }
            />
            <Bar
              dataKey={`${metric}_total`}
              fill="var(--color-primary)"
              activeBar={<CrispBarActive />}
              shape={
                hitData ? <SplitCrispBar hitKey={hitTotalKey} fullKey={totalKey} /> : <CrispBar />
              }
              isAnimationActive={false}
            >
              {chartData.map((row) => (
                // oxlint-disable-next-line typescript/no-deprecated -- recharts 3 deprecates Cell for removal in 4.0; the replacement threads per-datum opacity through the custom shape, which needs a visual check
                <Cell key={row.value} fillOpacity={columnOpacity(row.value)} />
              ))}
              {showTotals && <LabelList dataKey={totalKey} content={<TotalLabel />} />}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
    );
  }

  const chartData = Array.from({ length: maxValue + 1 }, (_, value) => {
    const entry = valueMap.get(value);
    const hitEntry = hitMap.get(value);
    const row: Record<string, string | number> = { value: String(value) };
    let total = 0;
    for (const stack of stacks) {
      const count = (entry?.[stack.key] as number) ?? 0;
      row[`${metric}_${stack.key}`] = count;
      // Kept off dataKey so it never becomes a series, tooltip row, or total; SplitCrispBar reads it directly.
      row[hitKeyFor(stack.key)] = Math.min(count, (hitEntry?.[stack.key] as number) ?? 0);
      total += count;
    }
    row.columnTotal = total;
    return row;
  });
  const chartConfig = buildChartConfig(stacks, metric, labels.domains, domainColors);

  return (
    <div>
      {heading}
      <ChartContainer
        config={chartConfig}
        className={cn("aspect-auto h-28 w-full", onBarClick && "cursor-pointer")}
      >
        <BarChart
          data={chartData}
          margin={chartMargin}
          onClick={handleChartClick}
          onMouseMove={
            revealDomainsOnHover
              ? (state) => setHoverIndex(activeRowIndex(state as ChartClickState, chartData.length))
              : undefined
          }
          onMouseLeave={revealDomainsOnHover ? () => setHoverIndex(null) : undefined}
        >
          <GradientDefs stacks={stacks} colors={domainColors} />
          <XAxis dataKey="value" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                reverseOrder
                labelFormatter={(value) => bucketLabel(value, label)}
              />
            }
          />
          {stacks.map((stack, index) => (
            <Bar
              key={`${metric}_${stack.key}`}
              dataKey={`${metric}_${stack.key}`}
              stackId="a"
              fill={comboFill(stack, domainColors)}
              activeBar={<CrispBarActive />}
              shape={
                hitData ? (
                  <SplitCrispBar hitKey={hitKeyFor(stack.key)} fullKey={`${metric}_${stack.key}`} />
                ) : (
                  <CrispBar />
                )
              }
              isAnimationActive={false}
            >
              {chartData.map((row, rowIndex) => (
                // oxlint-disable-next-line typescript/no-deprecated -- recharts 3 deprecates Cell for removal in 4.0; the replacement threads per-datum opacity through the custom shape, which needs a visual check
                <Cell
                  key={String(row.value)}
                  fillOpacity={columnOpacity(String(row.value))}
                  // `fill={undefined}` overrides the Bar's fill and paints SVG-default black, so this stays a concrete color.
                  fill={
                    revealDomainsOnHover && hoverIndex !== rowIndex
                      ? "var(--color-primary)"
                      : comboFill(stack, domainColors)
                  }
                />
              ))}
              {showTotals && index === stacks.length - 1 && (
                <LabelList dataKey="columnTotal" content={<TotalLabel />} />
              )}
            </Bar>
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
  revealDomainsOnHover,
  footnote,
  showTotals,
  onBarClick,
  focusValue,
  hitData,
}: {
  data: EnergyCostCount[];
  stacks: DomainCombo[];
  average: number | null;
  singleColor?: boolean;
  revealDomainsOnHover?: boolean;
  footnote?: string;
  showTotals?: boolean;
  onBarClick?: (value: number) => void;
  focusValue?: number | null;
  hitData?: EnergyCostCount[];
}) {
  if (data.length === 0) {
    return null;
  }
  return (
    <div>
      <SingleChart
        data={data}
        stacks={stacks}
        average={average}
        label="Energy"
        metric="energy"
        minAxisMax={8}
        singleColor={singleColor}
        revealDomainsOnHover={revealDomainsOnHover}
        showTotals={showTotals}
        onBarClick={onBarClick}
        focusValue={focusValue}
        hitData={hitData}
      />
      {footnote && <p className="text-muted-foreground text-2xs mt-1">{footnote}</p>}
    </div>
  );
}

export function PowerChart({
  data,
  stacks,
  average,
  singleColor,
  showTotals,
  onBarClick,
  focusValue,
  hitData,
}: {
  data: PowerCount[];
  stacks: DomainCombo[];
  average: number | null;
  singleColor?: boolean;
  showTotals?: boolean;
  onBarClick?: (value: number) => void;
  focusValue?: number | null;
  hitData?: PowerCount[];
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
      showTotals={showTotals}
      onBarClick={onBarClick}
      focusValue={focusValue}
      hitData={hitData}
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
  revealDomainsOnHover,
  showTotals,
  footnote,
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
        revealDomainsOnHover={revealDomainsOnHover}
        showTotals={showTotals}
        footnote={footnote}
      />
      <PowerChart
        data={powerData}
        stacks={powerStacks}
        average={averagePower}
        singleColor={singleColor}
        showTotals={showTotals}
      />
    </div>
  );
}
