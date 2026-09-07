import type { MetaLegendDetailResponse } from "@openrift/shared/types/api/meta";
import { Link } from "@tanstack/react-router";

import { DomainIcon } from "@/components/deck/domain-icon";
import { MetaHeroArt, MetaHeroCounter } from "@/components/meta/meta-hero";
import { Card } from "@/components/ui/card";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { deckGlowStyle } from "@/lib/domain";
import { splitLegendName } from "@/lib/meta-format";

type MetaLegendCounts = MetaLegendDetailResponse["counts"];

function FactCounters({ counts }: { counts: MetaLegendCounts }) {
  return (
    <div className="flex flex-wrap gap-x-9 gap-y-3">
      <MetaHeroCounter value={counts.wins} label="event wins" />
      <MetaHeroCounter value={counts.finishes} label="archived finishes" />
      <MetaHeroCounter value={counts.decklists} label="decklists" />
    </div>
  );
}

export function MetaLegendHero({
  legend,
  counts,
}: {
  legend: MetaLegendDetailResponse["legend"];
  counts: MetaLegendCounts;
}) {
  const domainColors = useDomainColors();
  const { champion, title } = splitLegendName(legend.name);

  return (
    <Card className="relative gap-0 py-0">
      <div
        aria-hidden
        className="absolute inset-0"
        style={deckGlowStyle(legend.domains, domainColors)}
      />
      <MetaHeroArt imageId={legend.imageId} alt={champion} />

      <div className="relative flex flex-col gap-3 p-5 pr-[45%] sm:pr-[38%]">
        <div className="flex flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            {/* h2: the page's h1 is the champion in the top bar. */}
            <h2 className="font-heading text-2xl font-bold">
              <Link
                to="/cards/$cardSlug"
                params={{ cardSlug: legend.slug }}
                className="hover:underline"
              >
                {champion}
              </Link>
            </h2>
            {legend.domains.length > 0 && (
              <span className="flex shrink-0 items-center gap-1">
                {legend.domains.map((domain) => (
                  <DomainIcon key={domain} domain={domain} className="size-5" />
                ))}
              </span>
            )}
          </div>
          {title !== null && <p className="text-muted-foreground text-sm">{title} · Legend</p>}
        </div>

        <FactCounters counts={counts} />

        <p className="text-muted-foreground text-xs">
          Every {champion} result on record: tournament finishes, the players behind them, and the
          lists they registered.
        </p>
      </div>
    </Card>
  );
}
