import { createFileRoute } from "@tanstack/react-router";

import { CollectionGrid } from "@/components/collection/collection-grid";
import { InlineError } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { catalogQueryOptions } from "@/hooks/use-cards";
import { collectionsQueryOptions } from "@/hooks/use-collections";
import { copiesQueryOptions } from "@/hooks/use-copies";

export const Route = createFileRoute("/_app/_authenticated/collections/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(collectionsQueryOptions),
      context.queryClient.ensureQueryData(copiesQueryOptions()),
      context.queryClient.ensureQueryData(catalogQueryOptions),
    ]);
  },
  component: CollectionIndex,
  pendingComponent: CollectionPending,
  errorComponent: () => <InlineError centered />,
});

function CollectionPending() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function CollectionIndex() {
  return <CollectionGrid />;
}
