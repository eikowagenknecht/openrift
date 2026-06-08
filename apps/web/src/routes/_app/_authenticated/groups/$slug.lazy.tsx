import { createLazyFileRoute } from "@tanstack/react-router";

import { OverviewContent } from "@/components/friend-groups/friend-group-overview";
import { FriendGroupPageFrame } from "@/components/friend-groups/friend-group-shell";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug")({
  component: GroupOverviewRoute,
});

function GroupOverviewRoute() {
  const { slug } = Route.useParams();
  return (
    <FriendGroupPageFrame
      slug={slug}
      active="overview"
      render={(data) => <OverviewContent slug={slug} data={data} />}
    />
  );
}
