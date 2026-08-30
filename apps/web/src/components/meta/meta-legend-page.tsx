import type { MetaDeckSummary } from "@openrift/shared";
import { Link, getRouteApi } from "@tanstack/react-router";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { TopBarBreadcrumbBar } from "@/components/layout/top-bar-breadcrumb";
import { MetaArchiveDeckTile } from "@/components/meta/meta-archive-deck-tile";
import { MetaLegendFinishes } from "@/components/meta/meta-legend-finishes";
import { MetaLegendHero } from "@/components/meta/meta-legend-hero";
import { MetaScopeBar } from "@/components/meta/meta-scope-bar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { useMetaDecks, useMetaLegend } from "@/hooks/use-meta";
import { useMetaEras } from "@/hooks/use-meta-eras";
import { splitLegendName } from "@/lib/meta-format";
import {
  filterLegendDecks,
  filterLegendFinishes,
  metaLegendCounts,
  metaLegendCountries,
  metaLegendDecks,
} from "@/lib/meta-legend-page";
import type { MetaScope } from "@/lib/meta-scope";
import { CLEARED_SCOPE, isScopeNarrowed, nextScopeSearch } from "@/lib/meta-scope";
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

  if (decks.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <Heading>Archived decklists</Heading>
        <Empty>
          <EmptyHeader>
            <EmptyDescription>
              No list on this legend&apos;s record falls in this scope.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }

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
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const { data } = useMetaLegend(slug);
  const { data: decksData } = useMetaDecks();
  const eras = useMetaEras();

  // Replaced rather than pushed: a scope bar is one control the reader adjusts
  // several times, and each dropdown would otherwise cost a press of Back.
  const setScope = (patch: Partial<MetaScope>) => {
    void navigate({ search: (prev) => nextScopeSearch(prev, patch), replace: true });
  };
  const clearScope = () => setScope(CLEARED_SCOPE);

  const legendDecks = metaLegendDecks(decksData.decks, data.legend.cardId);
  const finishes = filterLegendFinishes(data.finishes, { scope: search, eras });
  const decks = filterLegendDecks(legendDecks, { scope: search, eras });
  const counts = metaLegendCounts(finishes, decks);
  const { champion } = splitLegendName(data.legend.name);
  // Remounts both sections whenever the scope changes, so a view a reader opened
  // on the old slice does not carry into the new one.
  const scopeKey = `${search.era ?? ""}|${search.from ?? ""}|${search.to ?? ""}|${search.format ?? ""}|${search.tier ?? ""}|${search.country ?? ""}`;

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
        <div className="flex flex-col gap-5">
          <MetaScopeBar
            scope={search}
            setScope={setScope}
            clearScope={clearScope}
            eras={eras}
            countries={metaLegendCountries(data.finishes, legendDecks)}
          />
          <MetaLegendHero legend={data.legend} counts={counts} />
        </div>

        <MetaLegendFinishes key={scopeKey} finishes={finishes} narrowed={isScopeNarrowed(search)} />

        {legendDecks.length > 0 && <ArchivedDecks key={scopeKey} decks={decks} />}
      </div>
    </div>
  );
}
