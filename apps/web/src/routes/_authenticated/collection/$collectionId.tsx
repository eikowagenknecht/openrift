import { createFileRoute } from "@tanstack/react-router";

import { CollectionGrid } from "@/components/collection/collection-grid";

export const Route = createFileRoute("/_authenticated/collection/$collectionId")({
  component: CollectionDetail,
});

function CollectionDetail() {
  const { collectionId } = Route.useParams();
  return <CollectionGrid collectionId={collectionId} />;
}
