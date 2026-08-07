import type { Domain } from "@openrift/shared";
import { useState } from "react";
import { Bar, BarChart, Cell, LabelList, XAxis } from "recharts";

import { CrispBar, CrispBarActive, SplitCrispBar } from "@/components/deck/stats/crisp-bar";
import type { ChartClickState } from "@/components/deck/stats/energy-power-chart";
import { activeRowIndex, TotalLabel } from "@/components/deck/stats/energy-power-chart";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { TypeCount } from "@/hooks/use-deck-stats";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { getDomainColor } from "@/lib/domain";
import { cn } from "@/lib/utils";

interface TypeBreakdownProps {
  data: TypeCount[];
  domains: Domain[];
  /** When true, render a single primary-colored bar instead of domain-colored stacks. */
  singleColor?: boolean;
  /** Print each column's total above its bar. */
  showTotals?: boolean;
  /** Makes the bars clickable — called with the column's card-type slug. */
  onBarClick?: (type: string) => void;
  /** Muted note rendered under the chart, e.g. the multi-type double-count disclosure. */
  footnote?: string;
  /**
   * Card-type slug of the focused column, if any. The matching column keeps
   * full opacity and the rest dim, so the chart shows what the card grid below
   * is filtered to. Null when the focus belongs to another chart or is cleared.
   */
  focusValue?: string | null;
  /**
   * Counts matching another chart's focus, in the same row/stack shape as
   * `data`. Each segment splits: the matching part keeps full strength, the
   * filtered-out remainder fades. Types and domains missing here count as 0;
   * domains are never taken from this data. Mutually exclusive with
   * `focusValue` — a chart either owns the focus or reflects it.
   */
  hitData?: TypeCount[];
  /** Skip the built-in "Types" heading when the host renders its own header row. */
  hideHeading?: boolean;
  /**
   * Paint columns in the neutral primary by default and reveal the
   * domain-colored stacks only on the hovered column — see the curve charts.
   */
  revealDomainsOnHover?: boolean;
}

function buildChartConfig(
  domains: Domain[],
  domainLabels: Record<string, string>,
  colors: Record<string, string>,
): ChartConfig {
  const config: ChartConfig = {};
  for (const domain of domains) {
    config[domain] = { label: domainLabels[domain], color: getDomainColor(domain, colors) };
  }
  return config;
}

export function TypeBreakdown({
  data,
  domains,
  singleColor,
  showTotals,
  onBarClick,
  footnote,
  focusValue,
  hitData,
  hideHeading,
  revealDomainsOnHover,
}: TypeBreakdownProps) {
  const domainColors = useDomainColors();
  const { labels } = useEnumOrders();
  // Hovered column while `revealDomainsOnHover` is on.
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return null;
  }

  // Per-column opacity for the focused-column treatment. Cells inherit the
  // Bar's fill and only override the opacity.
  const columnOpacity = (type: string) =>
    focusValue === null || focusValue === undefined || type === focusValue ? 1 : 0.3;

  const chartMargin = { top: showTotals ? 14 : 0, right: 0, bottom: 0, left: 0 };

  // Matched counts by type, so a column can show how another chart's focus
  // cuts across it. Types missing here simply matched nothing.
  const hitByType = new Map((hitData ?? []).map((entry) => [entry.type, entry]));
  const hitKeyFor = (domain: string) => `${domain}__hit`;

  const labeledData = data.map((entry) => {
    const typeLabel = labels.cardTypes[entry.type];
    const hitEntry = hitByType.get(entry.type);
    const hits: Record<string, number> = {};
    let hitTotal = 0;
    for (const domain of domains) {
      // Read by SplitCrispBar only — never a dataKey, so these stay out of the
      // series list, the tooltip and the column total.
      const hit = Math.min((entry[domain] as number) ?? 0, (hitEntry?.[domain] as number) ?? 0);
      hits[hitKeyFor(domain)] = hit;
      hitTotal += hit;
    }
    return {
      ...entry,
      ...hits,
      __hitTotal: hitTotal,
      label: `${entry.total} ${entry.total === 1 ? typeLabel : `${typeLabel}s`}`,
    };
  });

  // The x-axis shows display labels ("12 Units"), not the type slug, so the
  // click is resolved by position: recharts 3 hands external handlers only the
  // active index and label — `activePayload` was a v2 field and is gone, which
  // is why reading it silently never fired. Param stays `unknown`: recharts'
  // chart-state type isn't structurally assignable to a narrowed shape.
  const handleChartClick = onBarClick
    ? (state: unknown) => {
        const index = activeRowIndex(state as ChartClickState, labeledData.length);
        const type = index === null ? undefined : labeledData[index]?.type;
        if (typeof type === "string") {
          onBarClick(type);
        }
      }
    : undefined;

  const heading = hideHeading ? null : (
    <div className="mb-1 flex items-center text-xs">
      <h4 className="font-medium">Types</h4>
    </div>
  );

  if (singleColor) {
    const singleConfig: ChartConfig = {
      total: { label: "Count", color: "var(--color-primary)" },
    };

    return (
      <div>
        {heading}
        <ChartContainer
          config={singleConfig}
          className={cn("aspect-auto h-28 w-full", onBarClick && "cursor-pointer")}
        >
          <BarChart data={labeledData} margin={chartMargin} onClick={handleChartClick}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar
              dataKey="total"
              fill="var(--color-primary)"
              activeBar={<CrispBarActive />}
              shape={hitData ? <SplitCrispBar hitKey="__hitTotal" fullKey="total" /> : <CrispBar />}
              isAnimationActive={false}
            >
              {labeledData.map((entry) => (
                <Cell key={entry.type} fillOpacity={columnOpacity(entry.type)} />
              ))}
              {showTotals && <LabelList dataKey="total" content={<TotalLabel />} />}
            </Bar>
          </BarChart>
        </ChartContainer>
        {footnote && <p className="text-muted-foreground text-2xs mt-1">{footnote}</p>}
      </div>
    );
  }

  const chartConfig = buildChartConfig(domains, labels.domains, domainColors);

  return (
    <div>
      {heading}
      <ChartContainer
        config={chartConfig}
        className={cn("aspect-auto h-28 w-full", onBarClick && "cursor-pointer")}
      >
        <BarChart
          data={labeledData}
          margin={chartMargin}
          onClick={handleChartClick}
          onMouseMove={
            revealDomainsOnHover
              ? (state) =>
                  setHoverIndex(activeRowIndex(state as ChartClickState, labeledData.length))
              : undefined
          }
          onMouseLeave={revealDomainsOnHover ? () => setHoverIndex(null) : undefined}
        >
          <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          {domains.map((domain, index) => (
            <Bar
              key={domain}
              dataKey={domain}
              stackId="type"
              fill={getDomainColor(domain, domainColors)}
              activeBar={<CrispBarActive />}
              shape={
                hitData ? (
                  <SplitCrispBar hitKey={hitKeyFor(domain)} fullKey={domain} />
                ) : (
                  <CrispBar />
                )
              }
              isAnimationActive={false}
            >
              {labeledData.map((entry, rowIndex) => (
                <Cell
                  key={entry.type}
                  fillOpacity={columnOpacity(entry.type)}
                  // Always a concrete color — an explicit `fill={undefined}`
                  // overrides the Bar's fill and paints SVG-default black.
                  // Neutral until hovered; see the curve charts.
                  fill={
                    revealDomainsOnHover && hoverIndex !== rowIndex
                      ? "var(--color-primary)"
                      : getDomainColor(domain, domainColors)
                  }
                />
              ))}
              {showTotals && index === domains.length - 1 && (
                <LabelList dataKey="total" content={<TotalLabel />} />
              )}
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
      {footnote && <p className="text-muted-foreground text-2xs mt-1">{footnote}</p>}
    </div>
  );
}
