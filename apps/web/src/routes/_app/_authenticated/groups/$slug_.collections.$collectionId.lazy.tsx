import type { PublicCollectionDetailResponse } from "@openrift/shared/types/api/collection";
import { createLazyFileRoute, Link } from "@tanstack/react-router";

import { TopBarBreadcrumbTrail } from "@/components/layout/top-bar-breadcrumb";
import { SharedCollectionView } from "@/features/collections/components/shared-collection-view";
import { useFriendGroupSharedCollection } from "@/features/groups/hooks/use-friend-group-sharing";
import { useFriendGroupDetail } from "@/features/groups/hooks/use-friend-groups";

export const Route = createLazyFileRoute(
  "/_app/_authenticated/groups/$slug_/collections/$collectionId",
)({
  component: SharedCollectionRoute,
});

function SharedCollectionRoute() {
  const { slug, collectionId } = Route.useParams();
  const { data } = useFriendGroupSharedCollection(slug, collectionId);
  const { data: groupDetail } = useFriendGroupDetail(slug);
  const search = Route.useSearch();

  // Timestamps and pagination are unused on the page; left empty/null on purpose.
  const publicShape: PublicCollectionDetailResponse = {
    collection: {
      id: data.collection.id,
      name: data.collection.name,
      description: data.collection.description,
      copyCount: data.collection.copyCount,
      totalValueCents: data.collection.totalValueCents,
      unpricedCopyCount: data.collection.unpricedCopyCount,
      createdAt: "",
      updatedAt: "",
    },
    items: data.copies,
    nextCursor: null,
    owner: { displayName: data.collection.ownerName ?? "Unknown", gravatarHash: null },
  };

  return (
    <SharedCollectionView
      data={publicShape}
      search={search}
      topBarTrailing={
        <TopBarBreadcrumbTrail
          segments={[
            { label: groupDetail.group.name, link: <Link to="/groups/$slug" params={{ slug }} /> },
            { label: "Collections", link: <Link to="/groups/$slug/shared" params={{ slug }} /> },
          ]}
        />
      }
    />
  );
}
