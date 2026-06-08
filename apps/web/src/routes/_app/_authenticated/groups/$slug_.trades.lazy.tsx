import { createLazyFileRoute } from "@tanstack/react-router";

import { FriendGroupPageFrame } from "@/components/friend-groups/friend-group-shell";
import { TradesPageContent } from "@/components/friend-groups/friend-group-trades-page";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/trades")({
  component: GroupTradesRoute,
});

function GroupTradesRoute() {
  const { slug } = Route.useParams();
  return (
    <FriendGroupPageFrame
      slug={slug}
      active="trades"
      render={(data) => <TradesPageContent slug={slug} data={data} />}
    />
  );
}
