import { createFileRoute } from "@tanstack/react-router";

import { CollectionGrid } from "@/components/collection/collection-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { catalogQueryOptions } from "@/hooks/use-cards";
import { collectionsQueryOptions } from "@/hooks/use-collections";
import { copiesQueryOptions } from "@/hooks/use-copies";

export const Route = createFileRoute("/_app/_authenticated/collections/$collectionId")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(collectionsQueryOptions),
      context.queryClient.ensureQueryData(copiesQueryOptions(params.collectionId)),
      context.queryClient.ensureQueryData(catalogQueryOptions),
    ]);
  },
  component: CollectionDetail,
  pendingComponent: CollectionDetailPending,
  errorComponent: CollectionDetailError,
});

function CollectionDetailPending() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function CollectionDetailError({ error }: { error: Error }) {
  return <p className="p-4 text-sm text-destructive">Failed to load: {error.message}</p>;
}

function CollectionDetail() {
  const { collectionId } = Route.useParams();
  return <CollectionGrid collectionId={collectionId} />;
}
