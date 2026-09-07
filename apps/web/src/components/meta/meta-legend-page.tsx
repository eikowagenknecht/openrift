import type { MetaLegendFinish, MetaScopeQuery } from "@openrift/shared";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { Link, getRouteApi } from "@tanstack/react-router";
import { useState } from "react";

import { PageTopBar, PageTopBarSticky, PageTopBarTitle } from "@/components/layout/page-top-bar";
import {
  TopBarBreadcrumbSeparator,
  TopBarBreadcrumbTrail,
} from "@/components/layout/top-bar-breadcrumb";
import { MetaArchivedDecks } from "@/components/meta/meta-archived-decks";
import { MetaLegendFinishes } from "@/components/meta/meta-legend-finishes";
import { MetaLegendHero } from "@/components/meta/meta-legend-hero";
import { MetaScopeBar } from "@/components/meta/meta-scope-bar";
import { metaDecksQueryOptions, metaLegendQueryOptions, useMetaLegend } from "@/hooks/use-meta";
import { useMetaEras } from "@/hooks/use-meta-eras";
import { DECK_GRID_LIMIT } from "@/lib/meta-deck-grid";
import { splitLegendName } from "@/lib/meta-format";
import { metaScopedCountries } from "@/lib/meta-legend-page";
import type { MetaScope } from "@/lib/meta-scope";
import {
  CLEARED_SCOPE,
  isScopeRestricting,
  metaScopeQueryFromScope,
  nextScopeSearch,
  scopeKey,
} from "@/lib/meta-scope";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const routeApi = getRouteApi("/_app/meta_/legends_/$slug");

/** Each page is its own query under the same scope, so walking back up the list hits cache. */
function LegendRecord({
  slug,
  query,
  best,
  first,
  total,
  narrowed,
}: {
  slug: string;
  query: MetaScopeQuery;
  best: readonly MetaLegendFinish[];
  first: readonly MetaLegendFinish[];
  total: number;
  narrowed: boolean;
}) {
  const [pages, setPages] = useState(1);
  const rest = useQueries({
    queries: Array.from({ length: pages - 1 }, (_, index) =>
      metaLegendQueryOptions(slug, { ...query, page: index + 2 }),
    ),
  });

  return (
    <MetaLegendFinishes
      best={best}
      finishes={[...first, ...rest.flatMap((result) => result.data?.finishes ?? [])]}
      total={total}
      loadingMore={rest.some((result) => result.isPending)}
      onShowMore={() => setPages(pages + 1)}
      narrowed={narrowed}
    />
  );
}

function LegendDecks({
  legendCardId,
  query,
  total,
}: {
  legendCardId: string;
  query: MetaScopeQuery;
  total: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const { data } = useQuery({
    ...metaDecksQueryOptions({
      ...query,
      legend: legendCardId,
      limit: showAll ? undefined : DECK_GRID_LIMIT,
    }),
    placeholderData: keepPreviousData,
  });

  return (
    <MetaArchivedDecks
      decks={data?.decks ?? []}
      total={total}
      subject="legend"
      onShowAll={() => setShowAll(true)}
    />
  );
}

export function MetaLegendPage() {
  const { slug } = routeApi.useParams();
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const eras = useMetaEras();
  const query = metaScopeQueryFromScope(search, eras);
  const { data } = useMetaLegend(slug, query);

  const setScope = (patch: Partial<MetaScope>) => {
    void navigate({ search: (prev) => nextScopeSearch(prev, patch), replace: true });
  };
  const clearScope = () => setScope(CLEARED_SCOPE);

  const narrowed = isScopeRestricting(search, eras);
  const { champion } = splitLegendName(data.legend.name);
  // Each section prefixes this: two siblings sharing one key leave the first one's DOM behind.
  const sectionKey = scopeKey(search);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky width="capped">
        <PageTopBar className="gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TopBarBreadcrumbTrail
              segments={[
                { label: "Meta Archive", link: <Link to="/meta" /> },
                { label: "Legends", link: <Link to="/meta/legends" /> },
              ]}
            />
            <TopBarBreadcrumbSeparator className="hidden sm:inline" />
            <PageTopBarTitle>{champion}</PageTopBarTitle>
          </div>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "px-safe flex flex-col gap-8 pt-3 pb-10")}>
        <div className="flex flex-col gap-5">
          <MetaScopeBar
            scope={search}
            setScope={setScope}
            clearScope={clearScope}
            eras={eras}
            countries={metaScopedCountries([...data.best, ...data.finishes], search)}
          />
          <MetaLegendHero legend={data.legend} counts={data.counts} />
        </div>

        <LegendRecord
          key={`finishes:${sectionKey}`}
          slug={slug}
          query={query}
          best={data.best}
          first={data.finishes}
          total={data.total}
          narrowed={narrowed}
        />

        {(data.counts.decklists > 0 || narrowed) && (
          <LegendDecks
            key={`decks:${sectionKey}`}
            legendCardId={data.legend.cardId}
            query={query}
            total={data.counts.decklists}
          />
        )}
      </div>
    </div>
  );
}
