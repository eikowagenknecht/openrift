import { createLazyFileRoute } from "@tanstack/react-router";

import { SharedPageContent } from "@/components/friend-groups/friend-group-shared-page";
import { FriendGroupPageFrame } from "@/components/friend-groups/friend-group-shell";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/shared")({
  component: GroupSharedRoute,
});

function GroupSharedRoute() {
  const { slug } = Route.useParams();
  return (
    <FriendGroupPageFrame
      slug={slug}
      active="shared"
      render={(data) => <SharedPageContent slug={slug} data={data} />}
    />
  );
}
