import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { EnergyPowerChart } from "@/components/deck/stats/energy-power-chart";
import { TypeBreakdown } from "@/components/deck/stats/type-breakdown";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DomainCount } from "@/hooks/use-deck-stats";
import { useDeckStats } from "@/hooks/use-deck-stats";
import { useDomainColors } from "@/hooks/use-domain-colors";
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
                {entry.domain}: {count}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export function DeckStatsBody({ stats }: { stats: ReturnType<typeof useDeckStats> }) {
  return (
    <div className="space-y-3">
      <EnergyPowerChart
        energyData={stats.energyCurve}
        energyStacks={stats.energyCurveStacks}
        averageEnergy={stats.averageEnergy}
        powerData={stats.powerCurve}
        powerStacks={stats.powerCurveStacks}
        averagePower={stats.averagePower}
      />
      <TypeBreakdown data={stats.typeBreakdown} domains={stats.typeBreakdownDomains} />
    </div>
  );
}

export function DeckStatsPanel({ deckId }: { deckId: string }) {
  // Start collapsed on mobile where the sidebar is hidden (display: none),
  // so Recharts doesn't render into a zero-sized container and warn.
  const [open, setOpen] = useState(() => globalThis.matchMedia("(min-width: 768px)").matches);
  const stats = useDeckStats(deckId);
  const domainColors = useDomainColors();

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? (
          <ChevronDownIcon className="size-3.5" />
        ) : (
          <ChevronRightIcon className="size-3.5" />
        )}
        <span>Stats</span>
        <DomainBar data={stats.domainDistribution} total={stats.totalCards} colors={domainColors} />
        <span className="text-muted-foreground text-xs">{stats.totalCards} cards</span>
      </button>

      {open && (
        <div className="border-t px-3 py-3">
          <DeckStatsBody stats={stats} />
        </div>
      )}
    </div>
  );
}
