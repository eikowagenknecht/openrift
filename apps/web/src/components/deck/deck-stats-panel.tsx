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
  interactive = true,
}: {
  data: DomainCount[];
  total: number;
  colors: Record<string, string>;
  className?: string;
  /**
   * Hover tooltips naming each domain and its count. Turn them off where the
   * bar is decoration on an already-clickable surface (the editor sidebar's
   * identity header is a button, so it can't nest tooltip triggers).
   */
  interactive?: boolean;
}) {
  const { labels } = useEnumOrders();

  if (data.length === 0 || total === 0) {
    return null;
  }

  const segments = data.filter((entry) => entry.count > 0);
  const barClass = cn("flex h-2.5 flex-1 overflow-hidden rounded-full", className);

  if (!interactive) {
    return (
      <div aria-hidden="true" className={barClass}>
        {segments.map((entry) => (
          <span
            key={entry.domain}
            className="h-full"
            style={{
              width: `${(entry.count / total) * 100}%`,
              backgroundColor: getDomainColor(entry.domain, colors),
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={barClass}>
        {segments.map((entry) => (
          <Tooltip key={entry.domain}>
            <TooltipTrigger
              className="h-full"
              render={<span />}
              style={{
                width: `${(entry.count / total) * 100}%`,
                backgroundColor: getDomainColor(entry.domain, colors),
              }}
            />
            <TooltipContent side="bottom">
              {labels.domains[entry.domain]}: {entry.count}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

// The same charts the overview's stats band draws, in the same treatment
// (neutral columns with the domains on hover, totals above each bar) so the
// sidebar doesn't read as a second, differently-styled set. What it leaves out
// is the click-to-focus wiring: the focus filters the overview's card grid, and
// there is no grid beside the sidebar to filter.
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
        revealDomainsOnHover
        showTotals
        footnote="Counts the main deck only."
      />
      <TypeBreakdown
        data={stats.typeBreakdown}
        domains={stats.typeBreakdownDomains}
        revealDomainsOnHover
        showTotals
      />
    </div>
  );
}

export function DeckStatsPanel({ deckId }: { deckId: string }) {
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
      </CollapsibleContent>
    </Collapsible>
  );
}
