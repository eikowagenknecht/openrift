import { createLazyFileRoute } from "@tanstack/react-router";

import { FriendGroupManagePage } from "@/features/groups/components/friend-group-manage-page";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/manage")({
  component: GroupManageRoute,
});

function GroupManageRoute() {
  const { slug } = Route.useParams();
  return <FriendGroupManagePage slug={slug} />;
}
