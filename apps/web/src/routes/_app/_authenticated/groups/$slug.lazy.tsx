import { createLazyFileRoute } from "@tanstack/react-router";

import { OverviewContent } from "@/features/groups/components/friend-group-overview";
import { FriendGroupPageFrame } from "@/features/groups/components/friend-group-shell";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug")({
  component: GroupOverviewRoute,
});

function GroupOverviewRoute() {
  const { slug } = Route.useParams();
  return (
    <FriendGroupPageFrame
      slug={slug}
      render={(data) => <OverviewContent slug={slug} data={data} />}
    />
  );
}
