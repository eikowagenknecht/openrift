import { Suspense, useEffect, useState } from "react";

import {
  PageDescription,
  PageTopBar,
  PageTopBarBack,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { MetaArchiveDeckTile } from "@/components/meta/meta-archive-deck-tile";
import { META_DECKS_DESCRIPTION } from "@/components/meta/meta-copy";
import {
  MetaDeckActiveFilters,
  MetaDeckFilterControls,
} from "@/components/meta/meta-deck-filter-controls";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { useHydrated } from "@/hooks/use-hydrated";
import { useMetaDecks } from "@/hooks/use-meta";
import { useMetaDeckFilters } from "@/hooks/use-meta-deck-filters";
import { useMetaDeckOwnership } from "@/hooks/use-meta-deck-ownership";
import { useMetaEras } from "@/hooks/use-meta-eras";
import { useSession } from "@/lib/auth-session";
import type { MetaDeckOwnership } from "@/lib/meta-deck-collection";
import { mostlyBuildableDeckIds } from "@/lib/meta-deck-collection";
import {
  curateMetaDecks,
  filterMetaDecks,
  metaDeckFilterCounts,
  metaDeckFilterOptions,
  sortMetaDecks,
} from "@/lib/meta-deck-filters";
import { cn, PAGE_WIDTH } from "@/lib/utils";

/**
 * `/meta/decks` — the cross-event deck browser. The endpoint hands over the
 * whole archive and every filter runs client-side (ADR-014), so narrowing is
 * instant and one cacheable payload serves every view.
 *
 * It opens curated: one tile per legend per event, showing that legend's best
 * finish there. A big Swiss event archives the same legend a dozen times over,
 * and a wall of near-identical tiles buries everything else the day produced.
 */
export function MetaDeckBrowserPage() {
  const { data } = useMetaDecks();
  const filters = useMetaDeckFilters();
  const eras = useMetaEras();
  const hydrated = useHydrated();
  const { data: session } = useSession();
  const [ownership, setOwnership] = useState<ReadonlyMap<string, MetaDeckOwnership>>();

  const signedIn = Boolean(session?.user);
  const values = {
    scope: filters.scope,
    eras,
    events: filters.events,
    legends: filters.legends,
    maxRank: filters.maxRank,
    buildable: filters.buildable,
    showAll: filters.showAll,
  };
  const context = {
    buildableDeckIds: ownership === undefined ? undefined : mostlyBuildableDeckIds(ownership),
  };

  const options = metaDeckFilterOptions(data.decks);
  const counts = metaDeckFilterCounts(data.decks, values, context);
  const matching = filterMetaDecks(data.decks, values, context);
  const decks = sortMetaDecks(curateMetaDecks(matching, values));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hydrated && signedIn && (
        <Suspense fallback={null}>
          <MetaDeckOwnershipBridge onChange={setOwnership} />
        </Suspense>
      )}

      <PageTopBarSticky width="full">
        <PageTopBar>
          <PageTopBarBack to="/meta" aria-label="Meta archive" />
          <PageTopBarTitle>Archived decks</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.full, "px-safe pt-3 pb-6")}>
        <PageDescription className="pb-4">{META_DECKS_DESCRIPTION}</PageDescription>

        <div className="flex flex-col gap-3">
          <MetaDeckFilterControls
            options={options}
            counts={counts}
            eras={eras}
            showCollectionFilter={ownership !== undefined}
          />
          <MetaDeckActiveFilters options={options} eras={eras} />
        </div>

        <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span>
            {decks.length} {decks.length === 1 ? "deck" : "decks"}
          </span>
          {matching.length > 0 && (
            <CurationNote
              matching={matching.length}
              showAll={filters.showAll}
              onShowAll={(value) => filters.setShowAll(value)}
            />
          )}
        </div>

        {decks.length === 0 ? (
          <Empty className="mt-6">
            <EmptyHeader>
              <EmptyDescription>No decks match these filters.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {decks.map((deck) => (
              <li key={deck.deckId}>
                <MetaArchiveDeckTile deck={deck} ownership={ownership?.get(deck.deckId)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * What the curation left out, and the way back to it. Counts of archived lists,
 * never a judgement of them: the tile that survives is the one that finished
 * best at its own event, which is a published result.
 */
function CurationNote({
  matching,
  showAll,
  onShowAll,
}: {
  /** Lists passing the filters, before the curation folds them. */
  matching: number;
  showAll: boolean;
  onShowAll: (value: boolean) => void;
}) {
  if (showAll) {
    return (
      <>
        <span aria-hidden>·</span>
        <span>every archived list</span>
        <Button type="button" variant="link" size="sm" onClick={() => onShowAll(false)}>
          Best finish per legend
        </Button>
      </>
    );
  }
  return (
    <>
      <span aria-hidden>·</span>
      <span>best finish per legend at each event</span>
      <Button type="button" variant="link" size="sm" onClick={() => onShowAll(true)}>
        Show all {matching}
      </Button>
    </>
  );
}

/**
 * Compares the archive against the reader's collection, and only ever on the
 * client: the copies live query has no server snapshot, and the catalog it needs
 * to match printings back to cards is a payload this page otherwise never pulls.
 */
function MetaDeckOwnershipBridge({
  onChange,
}: {
  onChange: (value: ReadonlyMap<string, MetaDeckOwnership> | undefined) => void;
}) {
  const ownership = useMetaDeckOwnership();
  useEffect(() => {
    onChange(ownership);
  }, [ownership, onChange]);
  return null;
}
