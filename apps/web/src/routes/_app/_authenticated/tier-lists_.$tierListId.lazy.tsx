import { createLazyFileRoute } from "@tanstack/react-router";

import { FilterSearchProvider } from "@/features/cards/lib/search-schemas";
import { TierListBuilderPage } from "@/features/stage/components/tier-list-builder-page";
import { useTierList } from "@/features/stage/hooks/use-tier-lists";

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
      <TierListBuilderPage key={tierListId} tierList={data} />
    </FilterSearchProvider>
  );
}
