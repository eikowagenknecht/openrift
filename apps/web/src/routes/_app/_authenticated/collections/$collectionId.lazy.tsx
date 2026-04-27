import { createLazyFileRoute } from "@tanstack/react-router";

import { CollectionGrid } from "@/components/collection/collection-grid";
import { useCollectionsMap } from "@/hooks/use-collections";

export const Route = createLazyFileRoute("/_app/_authenticated/collections/$collectionId")({
  component: CollectionDetail,
});

function CollectionDetail() {
  const { collectionId } = Route.useParams();
  const collectionsMap = useCollectionsMap();
  const collection = collectionsMap.get(collectionId);
  return <CollectionGrid collectionId={collectionId} title={collection?.name ?? "Collection"} />;
}
