import type { PublicListDetailResponse } from "@openrift/shared";
import { createLazyFileRoute, Link } from "@tanstack/react-router";

import { TopBarBreadcrumbTrail } from "@/components/layout/top-bar-breadcrumb";
import type { ListExchangeContext } from "@/components/list/shared-list-content";
import { SharedListContent } from "@/components/list/shared-list-content";
import { useFriendGroupDetail, useFriendGroupSharedList } from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { FilterSearchProvider } from "@/lib/search-schemas";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/lists/$listId")({
  component: SharedListRoute,
});

function SharedListRoute() {
  const { slug, listId } = Route.useParams();
  const viewerId = useRequiredUserId();
  const { data } = useFriendGroupSharedList(slug, listId);
  const { data: groupDetail } = useFriendGroupDetail(slug);
  const search = Route.useSearch();
  const { fromUser } = search;

  // The per-card exchange only makes sense on another member's list: "Want" on
  // their tradelist (match your wishlist against their copies), "Offer" on their
  // wishlist (give them a card they want from copies you own). The owner's own
  // list and organize lists get neither.
  const isOtherMembersList = data.list.ownerUserId !== viewerId;
  const exchange: ListExchangeContext | undefined =
    isOtherMembersList && (data.list.intent === "trade" || data.list.intent === "wish")
      ? {
          mode: data.list.intent === "trade" ? "request" : "offer",
          groupSlug: slug,
          groupName: groupDetail.group.name,
          counterpartyUserId: data.list.ownerUserId,
          counterpartyName: data.list.ownerName ?? "this member",
        }
      : undefined;

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
              { label: "Trades", link: <Link to="/groups/$slug/trades" params={{ slug }} /> },
            ]
      }
    />
  );

  return (
    <FilterSearchProvider value={search}>
      <SharedListContent data={publicShape} backLink={backLink} exchange={exchange} />
    </FilterSearchProvider>
  );
}
