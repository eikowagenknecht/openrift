import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { EnergyPowerChart } from "@/components/deck/stats/energy-power-chart";
import { TypeBreakdown } from "@/components/deck/stats/type-breakdown";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DomainCount } from "@/hooks/use-deck-stats";
import { useDeckStats } from "@/hooks/use-deck-stats";
import { DOMAIN_COLORS } from "@/lib/domain";

function DomainBar({ data, total }: { data: DomainCount[]; total: number }) {
  if (data.length === 0 || total === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex h-2.5 flex-1 overflow-hidden rounded-full">
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
                  backgroundColor: DOMAIN_COLORS[entry.domain] ?? "#737373",
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

export function DeckStatsPanel() {
  const [open, setOpen] = useState(true);
  const stats = useDeckStats();

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
        <DomainBar data={stats.domainDistribution} total={stats.totalCards} />
        <span className="text-muted-foreground text-xs">{stats.totalCards} cards</span>
      </button>

      {open && (
        <div className="space-y-3 border-t px-3 py-3">
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
      )}
    </div>
  );
}
