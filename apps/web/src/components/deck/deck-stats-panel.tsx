import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { DomainDistribution } from "@/components/deck/stats/domain-distribution";
import { EnergyCurve } from "@/components/deck/stats/energy-curve";
import { PowerCurve } from "@/components/deck/stats/power-curve";
import { TypeBreakdown } from "@/components/deck/stats/type-breakdown";
import { useDeckStats } from "@/hooks/use-deck-stats";

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
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <span className="flex-1">Stats</span>
        <span className="text-muted-foreground text-xs">{stats.totalCards} cards</span>
      </button>

      {open && (
        <div className="space-y-3 border-t px-3 py-3">
          <DomainDistribution data={stats.domainDistribution} />
          <EnergyCurve data={stats.energyCurve} domains={stats.energyCurveDomains} />
          <PowerCurve data={stats.powerCurve} />
          <TypeBreakdown data={stats.typeBreakdown} />
        </div>
      )}
    </div>
  );
}
