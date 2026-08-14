import { createLazyFileRoute } from "@tanstack/react-router";

import { TierListBuilderPage } from "@/components/tier-lists/tier-list-builder-page";
import { useTierList } from "@/hooks/use-tier-lists";
import { FilterSearchProvider } from "@/lib/search-schemas";

export const Route = createLazyFileRoute("/_app/_authenticated/tier-lists_/$tierListId")({
  component: TierListBuilderRoute,
});

function TierListBuilderRoute() {
  const { tierListId } = Route.useParams();
  const search = Route.useSearch();
  const { data } = useTierList(tierListId);
  // The pool is a card browser and reads its filters from the URL through the
  // provider, so the builder has to sit inside one.
  return (
    <FilterSearchProvider value={search}>
      {/* Keyed on the id so switching lists remounts the builder rather than
          reconciling one board's drag state onto another's. */}
      <TierListBuilderPage key={tierListId} tierList={data} />
    </FilterSearchProvider>
  );
}
