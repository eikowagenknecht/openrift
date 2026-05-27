import type { PublicListDetailResponse } from "@openrift/shared";
import { createLazyFileRoute } from "@tanstack/react-router";

import { PageTopBarBack } from "@/components/layout/page-top-bar";
import { SharedListContent } from "@/components/list/shared-list-content";
import { useFriendGroupSharedList } from "@/hooks/use-friend-groups";
import { FilterSearchProvider } from "@/lib/search-schemas";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/lists/$listId")({
  component: SharedListRoute,
});

function SharedListRoute() {
  const { slug, listId } = Route.useParams();
  const { data } = useFriendGroupSharedList(slug, listId);
  const search = Route.useSearch();

  // The friend-group endpoint omits createdAt/updatedAt on the list and nests
  // the owner inside `list`; the shared browser expects the public-share
  // shape, so we project here. Timestamps aren't surfaced by the browser, so
  // the empty strings are unused.
  const publicShape: PublicListDetailResponse = {
    list: {
      id: data.list.id,
      name: data.list.name,
      intent: data.list.intent,
      kind: data.list.kind,
      tradeDefaults: data.list.tradeDefaults,
      currency: data.list.currency,
      createdAt: "",
      updatedAt: "",
    },
    entries: data.entries,
    owner: { displayName: data.list.ownerName ?? "Unknown" },
  };

  return (
    <FilterSearchProvider value={search}>
      <SharedListContent
        data={publicShape}
        backLink={<PageTopBarBack to="/groups/$slug" params={{ slug }} />}
      />
    </FilterSearchProvider>
  );
}
