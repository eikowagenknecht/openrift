import { createLazyFileRoute } from "@tanstack/react-router";

import { SharedListContent } from "@/components/list/shared-list-content";
import { usePublicList } from "@/hooks/use-lists";
import { FilterSearchProvider } from "@/lib/search-schemas";

export const Route = createLazyFileRoute("/_app/lists_/share/$token")({
  component: SharedListPage,
});

function SharedListPage() {
  const { token } = Route.useParams();
  const { data } = usePublicList(token);
  const search = Route.useSearch();

  return (
    <FilterSearchProvider value={search}>
      <SharedListContent data={data} />
    </FilterSearchProvider>
  );
}
