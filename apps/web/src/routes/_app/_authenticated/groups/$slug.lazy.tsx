import { createLazyFileRoute } from "@tanstack/react-router";

import { FriendGroupPage } from "@/components/friend-groups/friend-group-page";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug")({
  component: GroupDetailRoute,
});

function GroupDetailRoute() {
  const { slug } = Route.useParams();
  return <FriendGroupPage slug={slug} />;
}
