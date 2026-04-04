import { createFileRoute, notFound } from "@tanstack/react-router";

import { CollectionGrid } from "@/components/collection/collection-grid";
import { CollectionPending } from "@/components/collection/collection-pending";
import { RouteErrorFallback } from "@/components/error-message";
import { catalogQueryOptions } from "@/hooks/use-cards";
import { collectionsQueryOptions, useCollectionsMap } from "@/hooks/use-collections";
import { copiesQueryOptions } from "@/hooks/use-copies";

import { useCollectionTitle } from "./route";

export const Route = createFileRoute("/_app/_authenticated/collections/$collectionId")({
  loader: async ({ context, params }) => {
    const [collections] = await Promise.all([
      context.queryClient.ensureQueryData(collectionsQueryOptions),
      context.queryClient.ensureQueryData(copiesQueryOptions(params.collectionId)),
      context.queryClient.ensureQueryData(catalogQueryOptions),
    ]);
    if (!collections.items.some((col) => col.id === params.collectionId)) {
      throw notFound();
    }
  },
  component: CollectionDetail,
  pendingComponent: CollectionPending,
  errorComponent: RouteErrorFallback,
});

function CollectionDetail() {
  const { collectionId } = Route.useParams();
  const collectionsMap = useCollectionsMap();
  const collection = collectionsMap.get(collectionId);
  useCollectionTitle(collection?.name ?? "Collection");
  return <CollectionGrid collectionId={collectionId} />;
}
