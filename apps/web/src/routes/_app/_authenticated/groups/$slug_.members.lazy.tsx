import { createLazyFileRoute } from "@tanstack/react-router";

import {
  MembersInviteAction,
  MembersPageContent,
  MembersTradedAction,
} from "@/components/friend-groups/friend-group-members-page";
import { FriendGroupSectionFrame } from "@/components/friend-groups/friend-group-shell";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/members")({
  component: GroupMembersRoute,
});

function GroupMembersRoute() {
  const { slug } = Route.useParams();
  return (
    <FriendGroupSectionFrame
      slug={slug}
      title="Members"
      actions={
        <>
          <MembersTradedAction slug={slug} />
          <MembersInviteAction slug={slug} />
        </>
      }
      render={(data) => <MembersPageContent slug={slug} data={data} />}
    />
  );
}
