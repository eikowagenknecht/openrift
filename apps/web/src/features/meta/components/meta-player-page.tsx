import { Link, getRouteApi } from "@tanstack/react-router";

import { PageTopBar, PageTopBarSticky, PageTopBarTitle } from "@/components/layout/page-top-bar";
import {
  TopBarBreadcrumbSeparator,
  TopBarBreadcrumbTrail,
} from "@/components/layout/top-bar-breadcrumb";
import { MetaArchivedDecks } from "@/features/meta/components/meta-archived-decks";
import { MetaPlayerFinishes } from "@/features/meta/components/meta-player-finishes";
import { MetaPlayerHero } from "@/features/meta/components/meta-player-hero";
import { MetaPlayerLegends } from "@/features/meta/components/meta-player-legends";
import { MetaScopeBar } from "@/features/meta/components/meta-scope-bar";
import { useMetaDecks, useMetaPlayer } from "@/features/meta/hooks/use-meta";
import { useMetaEras } from "@/features/meta/hooks/use-meta-eras";
import {
  filterPlayerFinishes,
  metaPlayerCounts,
  metaPlayerCountries,
  metaPlayerDecks,
  metaPlayerFacts,
  metaPlayerLegends,
} from "@/features/meta/lib/meta-player-page";
import type { MetaScope } from "@/features/meta/lib/meta-scope";
import {
  CLEARED_SCOPE,
  isScopeRestricting,
  metaScopeQueryFromScope,
  nextScopeSearch,
  scopeKey,
} from "@/features/meta/lib/meta-scope";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const routeApi = getRouteApi("/_app/meta_/players_/$key");

export function MetaPlayerPage() {
  const { key } = routeApi.useParams();
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const { data } = useMetaPlayer(key);
  const eras = useMetaEras();
  const { data: deckData } = useMetaDecks({
    ...metaScopeQueryFromScope(search, eras),
    player: key,
  });

  const setScope = (patch: Partial<MetaScope>) => {
    void navigate({ search: (prev) => nextScopeSearch(prev, patch), replace: true });
  };
  const clearScope = () => setScope(CLEARED_SCOPE);

  const finishes = filterPlayerFinishes(data.finishes, { scope: search, eras });
  const counts = metaPlayerCounts(finishes);
  const facts = metaPlayerFacts(finishes);
  const legends = metaPlayerLegends(finishes);
  const hasDecklists = data.finishes.some((finish) => finish.shareToken !== null);
  const decks = metaPlayerDecks(deckData.decks, data.finishes);
  // Prefixed per section: two siblings sharing one key leave the first one's
  // DOM behind on the swap.
  const sectionKey = scopeKey(search);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky width="capped">
        <PageTopBar className="gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TopBarBreadcrumbTrail
              segments={[{ label: "Meta Archive", link: <Link to="/meta" /> }]}
            />
            <TopBarBreadcrumbSeparator className="hidden sm:inline" />
            <PageTopBarTitle>{data.name}</PageTopBarTitle>
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
            countries={metaPlayerCountries(data.finishes)}
          />
          <MetaPlayerHero name={data.name} facts={facts} counts={counts} />
        </div>

        <MetaPlayerLegends
          key={`legends:${sectionKey}`}
          entries={legends.entries}
          withoutLegend={legends.withoutLegend}
        />

        <MetaPlayerFinishes
          key={`finishes:${sectionKey}`}
          finishes={finishes}
          playerName={data.name}
          narrowed={isScopeRestricting(search, eras)}
        />

        {hasDecklists && (
          <MetaArchivedDecks
            key={`decks:${sectionKey}`}
            decks={decks}
            total={decks.length}
            subject="player"
          />
        )}
      </div>
    </div>
  );
}
