import { formatDay, formatMonth } from "@openrift/shared/format-date";
import type { ReactNode } from "react";
import { Fragment } from "react";

import { Card } from "@/components/ui/card";
import { CountryFlag } from "@/components/ui/country-flag";
import { MetaHeroArt, MetaHeroCounter } from "@/features/meta/components/meta-hero";
import { splitLegendName } from "@/features/meta/lib/meta-format";
import type { MetaPlayerCounts, MetaPlayerFacts } from "@/features/meta/lib/meta-player-page";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { countryName } from "@/lib/country";
import { deckGlowStyle } from "@/lib/domain";

function FactCounters({ counts }: { counts: MetaPlayerCounts }) {
  return (
    <div className="flex flex-wrap gap-x-9 gap-y-3">
      <MetaHeroCounter value={counts.eventWins} label="event wins" />
      <MetaHeroCounter value={counts.topEights} label="top 8 finishes" />
      <MetaHeroCounter value={counts.finishes} label="archived finishes" />
      <MetaHeroCounter value={counts.decklists} label="decklists" />
    </div>
  );
}

function FactsLine({ facts }: { facts: MetaPlayerFacts }) {
  const parts: { key: string; node: ReactNode }[] = [];

  if (facts.country !== null) {
    parts.push({
      key: "country",
      node: (
        <span className="inline-flex items-center gap-1.5">
          <CountryFlag code={facts.country} showCode={false} size="sm" />
          {countryName(facts.country) ?? facts.country}
        </span>
      ),
    });
  }
  if (facts.firstDate !== null) {
    parts.push({ key: "since", node: <span>On record since {formatMonth(facts.firstDate)}</span> });
  }
  if (facts.lastDate !== null) {
    parts.push({ key: "last", node: <span>Last seen {formatDay(facts.lastDate)}</span> });
  }

  if (parts.length === 0) {
    return null;
  }

  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      {parts.map((part, index) => (
        <Fragment key={part.key}>
          {index > 0 && (
            <span aria-hidden className="text-muted-foreground/60">
              ·
            </span>
          )}
          {part.node}
        </Fragment>
      ))}
    </p>
  );
}

/** The name stays plain text: this page is the one it would link to. */
export function MetaPlayerHero({
  name,
  facts,
  counts,
}: {
  name: string;
  facts: MetaPlayerFacts;
  counts: MetaPlayerCounts;
}) {
  const domainColors = useDomainColors();
  const { topLegend } = facts;
  const champion = topLegend === null ? null : splitLegendName(topLegend.name).champion;

  return (
    <Card className="relative gap-0 py-0">
      <div
        aria-hidden
        className="absolute inset-0"
        style={deckGlowStyle(topLegend?.domains ?? [], domainColors)}
      />
      <MetaHeroArt imageId={topLegend?.imageId ?? null} alt={champion ?? ""} />

      <div className="relative flex flex-col gap-3 p-5 pr-[45%] sm:pr-[38%]">
        <div className="flex flex-col gap-1">
          {/* h2: the page's h1 is the player's name in the top bar. */}
          <h2 className="font-heading text-2xl font-bold">{name}</h2>
          <FactsLine facts={facts} />
        </div>

        <FactCounters counts={counts} />

        <p className="text-muted-foreground text-xs">
          Every {name} result on record: tournament finishes, the legends they brought, and the
          lists they registered.
        </p>
      </div>
    </Card>
  );
}
