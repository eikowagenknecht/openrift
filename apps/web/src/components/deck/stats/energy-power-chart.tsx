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
  /** When true, render a single primary-colored bar instead of domain-colored stacks. */
  singleColor?: boolean;
  /** Muted note rendered under the energy chart, e.g. to disclose which zones it counts. */
  footnote?: string;
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
  /** Print each column's total above its bar. */
  showTotals?: boolean;
  /** Makes the bars clickable — called with the column's metric value. */
  onBarClick?: (value: number) => void;
  /**
   * Metric value of the focused column, if any. The matching column keeps full
   * opacity and the rest dim, so the chart shows what the card grid below is
   * filtered to. Null when the focus belongs to another chart or is cleared.
   */
  focusValue?: number | null;
  /**
   * Counts matching another chart's focus, in the same row/stack shape as
   * `data`. Each segment then splits: the matching part keeps full strength and
   * the filtered-out remainder fades, so this chart shows how the other chart's
   * filter cuts across it. Rows and stacks missing here count as 0; stacks are
   * never taken from this data. Mutually exclusive with `focusValue` — a chart
   * either owns the focus or reflects it, never both.
   */
  hitData?: (EnergyCostCount | PowerCount)[];
}

/**
 * The chart-level click state recharts 3 hands external handlers. It carries
 * the active index and label only — `activePayload` was part of the v2 state
 * and is gone, so a click has to be resolved positionally against the chart's
 * own data. (`activeIndex` is typed `string | null` upstream.)
 */
export interface ChartClickState {
  activeLabel?: string | number;
  activeIndex?: string | number | null;
  activeTooltipIndex?: string | number | null;
}

/**
 * Resolves a chart click to a row index in the data the chart was given.
 * @returns The row index, or null when the click didn't land on a column.
 */
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

/**
 * Count label above a bar column. Zero columns (axis padding) stay unlabeled
 * so the empty tail doesn't fill with noise.
 * @returns The label text node, or null for empty columns.
 */
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
  showTotals,
  onBarClick,
  focusValue,
  hitData,
}: SingleChartProps) {
  const domainColors = useDomainColors();
  const { labels } = useEnumOrders();
  if (data.length === 0) {
    return null;
  }

  // Matched counts keyed the same way as the rows, so a missing row is simply
  // "nothing matched here" rather than a hole.
  const hitMap = new Map((hitData ?? []).map((entry) => [Number(entry[metric]), entry]));
  const hitKeyFor = (key: string) => `${metric}_${key}__hit`;

  // Per-column opacity for the focused-column treatment. Cells inherit the
  // Bar's fill (solid or gradient) and only override the opacity, so this
  // works the same for the single-color and stacked variants.
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
  // Total labels need headroom above the tallest bar.
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
              content={<ChartTooltipContent labelFormatter={(value) => `${value} ${label}`} />}
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
      // Read by SplitCrispBar only — not a dataKey, so it never becomes a
      // series, a tooltip row or part of a total.
      row[hitKeyFor(stack.key)] = Math.min(count, (hitEntry?.[stack.key] as number) ?? 0);
      total += count;
    }
    // Column total for the label above the stack (rendered by the last Bar,
    // whose segment top is the whole column's top).
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
        <BarChart data={chartData} margin={chartMargin} onClick={handleChartClick}>
          <GradientDefs stacks={stacks} colors={domainColors} />
          <XAxis dataKey="value" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent reverseOrder labelFormatter={(value) => `${value} ${label}`} />
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
              {chartData.map((row) => (
                <Cell key={String(row.value)} fillOpacity={columnOpacity(String(row.value))} />
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
  /** Muted note rendered under the chart, e.g. to disclose which zones it counts. */
  footnote?: string;
  /** Print each column's total above its bar. */
  showTotals?: boolean;
  /** Makes the bars clickable — called with the column's energy cost. */
  onBarClick?: (value: number) => void;
  /** Energy cost of the focused column; the others dim. Null when unfocused. */
  focusValue?: number | null;
  /** Energy counts matching another chart's focus — see SingleChartProps. */
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
  /** Print each column's total above its bar. */
  showTotals?: boolean;
  /** Makes the bars clickable — called with the column's power value. */
  onBarClick?: (value: number) => void;
  /** Power value of the focused column; the others dim. Null when unfocused. */
  focusValue?: number | null;
  /** Power counts matching another chart's focus — see SingleChartProps. */
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
        footnote={footnote}
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
