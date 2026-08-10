import { ChevronRightIcon } from "lucide-react";

import { EnergyPowerChart } from "@/components/deck/stats/energy-power-chart";
import { TypeBreakdown } from "@/components/deck/stats/type-breakdown";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeckCards } from "@/hooks/use-deck-builder";
import type { DomainCount } from "@/hooks/use-deck-stats";
import { useDeckStats } from "@/hooks/use-deck-stats";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { getDomainColor } from "@/lib/domain";
import { cn } from "@/lib/utils";

export function DomainBar({
  data,
  total,
  colors,
  className,
}: {
  data: DomainCount[];
  total: number;
  colors: Record<string, string>;
  className?: string;
}) {
  const { labels } = useEnumOrders();

  if (data.length === 0 || total === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className={cn("flex h-2.5 flex-1 overflow-hidden rounded-full", className)}>
        {data.map((entry) => {
          const count = entry.count;
          if (count === 0) {
            return null;
          }
          const percentage = (count / total) * 100;
          return (
            <Tooltip key={entry.domain}>
              <TooltipTrigger
                className="h-full"
                render={<span />}
                style={{
                  width: `${percentage}%`,
                  backgroundColor: getDomainColor(entry.domain, colors),
                }}
              />
              <TooltipContent side="bottom">
                {labels.domains[entry.domain]}: {count}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function DeckStatsBody({ stats }: { stats: ReturnType<typeof useDeckStats> }) {
  return (
    <div className="space-y-3">
      <EnergyPowerChart
        energyData={stats.energyCurve}
        energyStacks={stats.energyCurveStacks}
        averageEnergy={stats.averageEnergy}
        powerData={stats.powerCurve}
        powerStacks={stats.powerCurveStacks}
        averagePower={stats.averagePower}
        footnote="Counts the main deck only."
      />
      <TypeBreakdown data={stats.typeBreakdown} domains={stats.typeBreakdownDomains} />
    </div>
  );
}

export function DeckStatsPanel({
  deckId,
  children,
}: {
  deckId: string;
  children?: React.ReactNode;
}) {
  // Start collapsed on mobile where the sidebar is hidden (display: none),
  // so Recharts doesn't render into a zero-sized container and warn.
  const defaultOpen = globalThis.matchMedia("(min-width: 768px)").matches;
  const cards = useDeckCards(deckId);
  const stats = useDeckStats(cards);
  const domainColors = useDomainColors();

  // Frameless, like the zone sections above it: a small-caps label over a
  // hairline rule, no box. The whole header stays one toggle here — unlike a
  // zone, there is no second destination to open.
  return (
    <Collapsible defaultOpen={defaultOpen} className="flex flex-col gap-1.5">
      <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground flex h-6 w-full items-center gap-1.5 border-b text-left transition-colors">
        <ChevronRightIcon className="size-3.5 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
        <span className="text-2xs shrink-0 font-semibold tracking-widest uppercase">Stats</span>
        <DomainBar
          data={stats.domainDistribution}
          total={stats.totalCards}
          colors={domainColors}
          className="mx-1"
        />
        <span className="shrink-0 text-xs tabular-nums">{stats.totalCards} cards</span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <DeckStatsBody stats={stats} />
        {/* The ownership breakdown folds in below the charts (one panel
            instead of two stacked collapsibles in the sidebar). */}
        {children && <div className="mt-3 border-t pt-3">{children}</div>}
      </CollapsibleContent>
    </Collapsible>
  );
}
