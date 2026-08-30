import {
  PageDescription,
  PageTopBar,
  PageTopBarBack,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { META_DECKS_DESCRIPTION } from "@/components/meta/meta-copy";
import { MetaDeckCard } from "@/components/meta/meta-deck-card";
import {
  MetaDeckActiveFilters,
  MetaDeckFilterControls,
} from "@/components/meta/meta-deck-filter-controls";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { useMetaDecks } from "@/hooks/use-meta";
import { useMetaDeckFilters } from "@/hooks/use-meta-deck-filters";
import {
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
 * @returns The deck browser page.
 */
export function MetaDeckBrowserPage() {
  const { data } = useMetaDecks();
  const filters = useMetaDeckFilters();

  const options = metaDeckFilterOptions(data.decks);
  const counts = metaDeckFilterCounts(data.decks, filters);
  const decks = sortMetaDecks(filterMetaDecks(data.decks, filters));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky width="full">
        <PageTopBar>
          <PageTopBarBack to="/meta" aria-label="Meta archive" />
          <PageTopBarTitle>Archived decks</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.full, "px-safe pt-3 pb-6")}>
        <PageDescription className="pb-4">{META_DECKS_DESCRIPTION}</PageDescription>

        <div className="flex flex-col gap-3">
          <MetaDeckFilterControls options={options} counts={counts} />
          <MetaDeckActiveFilters options={options} />
        </div>

        <p className="text-muted-foreground mt-4 text-sm">
          {decks.length} {decks.length === 1 ? "deck" : "decks"}
        </p>

        {decks.length === 0 ? (
          <Empty className="mt-6">
            <EmptyHeader>
              <EmptyDescription>No decks match these filters.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {decks.map((deck) => (
              <li key={deck.deckId}>
                <MetaDeckCard deck={deck} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
