import { createFileRoute } from "@tanstack/react-router";

import { CollectionGrid } from "@/components/collection/collection-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { catalogQueryOptions } from "@/hooks/use-cards";
import { collectionsQueryOptions } from "@/hooks/use-collections";
import { copiesQueryOptions } from "@/hooks/use-copies";

export const Route = createFileRoute("/_authenticated/collections/$collectionId")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(collectionsQueryOptions),
      context.queryClient.ensureQueryData(copiesQueryOptions(params.collectionId)),
      context.queryClient.ensureQueryData(catalogQueryOptions),
    ]);
  },
  component: CollectionDetail,
  pendingComponent: CollectionDetailPending,
});

function CollectionDetailPending() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function CollectionDetail() {
  const { collectionId } = Route.useParams();
  return <CollectionGrid collectionId={collectionId} />;
}
