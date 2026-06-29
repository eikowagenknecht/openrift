import { createLazyFileRoute } from "@tanstack/react-router";

import { FriendGroupSectionFrame, isAdmin } from "@/components/friend-groups/friend-group-shell";
import { GroupTournamentsLens } from "@/components/tournaments/group-tournaments-lens";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/events")({
  component: GroupTournamentsRoute,
});

function GroupTournamentsRoute() {
  const { slug } = Route.useParams();
  return (
    <FriendGroupSectionFrame
      slug={slug}
      title="Tournaments"
      render={(data) => (
        <GroupTournamentsLens
          slug={slug}
          groupId={data.group.id}
          canCreate={isAdmin(data.viewerRole)}
        />
      )}
    />
  );
}
