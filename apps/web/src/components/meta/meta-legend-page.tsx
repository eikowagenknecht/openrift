import type { MetaDeckSummary } from "@openrift/shared";
import { Link, getRouteApi } from "@tanstack/react-router";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { TopBarBreadcrumbBar } from "@/components/layout/top-bar-breadcrumb";
import { MetaArchiveDeckTile } from "@/components/meta/meta-archive-deck-tile";
import { MetaLegendFinishes } from "@/components/meta/meta-legend-finishes";
import { MetaLegendHero } from "@/components/meta/meta-legend-hero";
import { Button } from "@/components/ui/button";
import { useMetaDecks, useMetaLegend } from "@/hooks/use-meta";
import { splitLegendName } from "@/lib/meta-format";
import { metaLegendCounts, metaLegendDecks } from "@/lib/meta-legend-page";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const routeApi = getRouteApi("/_app/meta_/legends_/$slug");

const DECK_GRID_LIMIT = 8;

/**
 * The rest of the lists arrive in place rather than behind a link: the deck
 * browser has no per-legend address, and sending a reader to the unfiltered
 * archive would promise a narrower list than it opens on.
 */
function ArchivedDecks({ decks }: { decks: readonly MetaDeckSummary[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? decks : decks.slice(0, DECK_GRID_LIMIT);
  const remaining = decks.length - shown.length;

  return (
    <section className="flex flex-col gap-3">
      <Heading>Archived decklists</Heading>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((deck) => (
          <li key={deck.deckId}>
            <MetaArchiveDeckTile deck={deck} />
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setExpanded(true)}>
            Show all {decks.length.toLocaleString("en-US")} decklists
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * `/meta/legends/$slug` — one legend's place in the archive: what it has won,
 * every finish on its record, and the lists that were registered with it.
 */
export function MetaLegendPage() {
  const { slug } = routeApi.useParams();
  const { data } = useMetaLegend(slug);
  const { data: decksData } = useMetaDecks();

  const decks = metaLegendDecks(decksData.decks, data.legend.cardId);
  const counts = metaLegendCounts(data.finishes, decks);
  const { champion } = splitLegendName(data.legend.name);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBarBreadcrumbBar
        segments={[
          { label: "Meta Archive", link: <Link to="/meta" /> },
          { label: "Legends", link: <Link to="/meta/legends" /> },
          { label: champion },
        ]}
      />

      <div className={cn(PAGE_WIDTH.capped, "px-safe flex flex-col gap-8 pt-3 pb-10")}>
        <MetaLegendHero legend={data.legend} counts={counts} />

        <MetaLegendFinishes finishes={data.finishes} />

        {decks.length > 0 && <ArchivedDecks decks={decks} />}
      </div>
    </div>
  );
}
