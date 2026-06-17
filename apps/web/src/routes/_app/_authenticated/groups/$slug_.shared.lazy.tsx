import { createLazyFileRoute } from "@tanstack/react-router";

import {
  SharedCollectionAction,
  SharedPageContent,
} from "@/components/friend-groups/friend-group-shared-page";
import { FriendGroupSectionFrame } from "@/components/friend-groups/friend-group-shell";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/shared")({
  component: GroupSharedRoute,
});

function GroupSharedRoute() {
  const { slug } = Route.useParams();
  return (
    <FriendGroupSectionFrame
      slug={slug}
      title="Collections"
      actions={<SharedCollectionAction slug={slug} />}
      render={(data) => <SharedPageContent slug={slug} data={data} />}
    />
  );
}
