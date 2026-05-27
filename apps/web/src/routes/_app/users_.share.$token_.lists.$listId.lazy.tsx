import { Link, createLazyFileRoute } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";

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

  const headerExtra = (
    <Link
      to="/users/share/$token"
      params={{ token }}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-3 py-2 text-sm"
    >
      <ChevronLeftIcon className="size-4" />
      Back to all lists
    </Link>
  );

  return (
    <FilterSearchProvider value={search}>
      <SharedListContent data={data} headerExtra={headerExtra} />
    </FilterSearchProvider>
  );
}
