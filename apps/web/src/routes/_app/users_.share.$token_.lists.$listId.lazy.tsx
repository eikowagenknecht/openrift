import { createLazyFileRoute } from "@tanstack/react-router";

import { PageTopBarBack } from "@/components/layout/page-top-bar";
import { SharedListContent } from "@/components/list/shared-list-content";
import { usePublicUserBundleList } from "@/hooks/use-user-share";
import { FilterSearchProvider } from "@/lib/search-schemas";

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
