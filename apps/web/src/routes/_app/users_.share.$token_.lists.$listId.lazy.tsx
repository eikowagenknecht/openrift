import { createLazyFileRoute } from "@tanstack/react-router";

import { PageTopBarBack } from "@/components/layout/page-top-bar";
import { FilterSearchProvider } from "@/features/cards/lib/search-schemas";
import { usePublicUserBundleList } from "@/features/groups/hooks/use-user-share";
import { SharedListContent } from "@/features/lists/components/shared-list-content";

export const Route = createLazyFileRoute("/_app/users_/share/$token_/lists/$listId")({
  component: BundleListPage,
});

function BundleListPage() {
  const { token, listId } = Route.useParams();
  const { data } = usePublicUserBundleList(token, listId);
  const search = Route.useSearch();

  return (
    <FilterSearchProvider value={search}>
      <SharedListContent
        data={data}
        backLink={<PageTopBarBack to="/users/share/$token" params={{ token }} />}
      />
    </FilterSearchProvider>
  );
}
