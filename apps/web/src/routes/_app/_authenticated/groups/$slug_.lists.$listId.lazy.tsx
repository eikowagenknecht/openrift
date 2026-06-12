import type { PublicListDetailResponse } from "@openrift/shared";
import { createLazyFileRoute, Link } from "@tanstack/react-router";

import { TopBarBreadcrumbTrail } from "@/components/layout/top-bar-breadcrumb";
import { SharedListContent } from "@/components/list/shared-list-content";
import { useFriendGroupDetail, useFriendGroupSharedList } from "@/hooks/use-friend-groups";
import { FilterSearchProvider } from "@/lib/search-schemas";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/lists/$listId")({
  component: SharedListRoute,
});

function SharedListRoute() {
  const { slug, listId } = Route.useParams();
  const { data } = useFriendGroupSharedList(slug, listId);
  const { data: groupDetail } = useFriendGroupDetail(slug);
  const search = Route.useSearch();
  const { fromUser } = search;

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
    owner: { displayName: data.list.ownerName ?? "Unknown", gravatarHash: null },
  };

  const groupCrumb = {
    label: groupDetail.group.name,
    link: <Link to="/groups/$slug" params={{ slug }} />,
  };
  const memberName = fromUser
    ? (groupDetail.members.find((member) => member.userId === fromUser)?.userName ?? "Member")
    : null;
  const backLink = (
    <TopBarBreadcrumbTrail
      segments={
        fromUser
          ? [
              groupCrumb,
              { label: "Members", link: <Link to="/groups/$slug/members" params={{ slug }} /> },
              {
                label: memberName ?? "Member",
                link: (
                  <Link to="/groups/$slug/members/$userId" params={{ slug, userId: fromUser }} />
                ),
              },
            ]
          : [
              groupCrumb,
              { label: "Shared", link: <Link to="/groups/$slug/shared" params={{ slug }} /> },
            ]
      }
    />
  );

  return (
    <FilterSearchProvider value={search}>
      <SharedListContent data={publicShape} backLink={backLink} />
    </FilterSearchProvider>
  );
}
