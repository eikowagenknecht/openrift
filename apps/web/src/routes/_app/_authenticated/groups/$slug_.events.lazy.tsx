import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

import { FriendGroupSectionFrame, isAdmin } from "@/components/friend-groups/friend-group-shell";
import { PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { GroupTournamentsLens } from "@/components/tournaments/group-tournaments-lens";
import { useFriendGroupDetail } from "@/hooks/use-friend-groups";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/events")({
  component: GroupTournamentsRoute,
});

function GroupTournamentsRoute() {
  const { slug } = Route.useParams();
  const { data } = useFriendGroupDetail(slug);
  const canCreate = isAdmin(data.viewerRole);
  return (
    <FriendGroupSectionFrame
      slug={slug}
      title="Tournaments"
      actions={
        canCreate ? (
          <PageTopBarPrimaryButton
            render={<Link to="/tournaments/new" search={{ group: data.group.id }} />}
          >
            <PlusIcon className="size-4" />
            New tournament
          </PageTopBarPrimaryButton>
        ) : null
      }
      render={() => (
        <GroupTournamentsLens slug={slug} canCreate={canCreate} groupId={data.group.id} />
      )}
    />
  );
}
