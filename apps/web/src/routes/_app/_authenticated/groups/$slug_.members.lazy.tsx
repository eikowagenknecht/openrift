import { createLazyFileRoute } from "@tanstack/react-router";

import { MembersPageContent } from "@/components/friend-groups/friend-group-members-page";
import { FriendGroupPageFrame } from "@/components/friend-groups/friend-group-shell";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/members")({
  component: GroupMembersRoute,
});

function GroupMembersRoute() {
  const { slug } = Route.useParams();
  return (
    <FriendGroupPageFrame
      slug={slug}
      active="members"
      render={(data) => <MembersPageContent slug={slug} data={data} />}
    />
  );
}
