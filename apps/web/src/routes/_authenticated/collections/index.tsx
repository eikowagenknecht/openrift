import { createFileRoute } from "@tanstack/react-router";

import { CollectionGrid } from "@/components/collection/collection-grid";
import { catalogQueryOptions } from "@/hooks/use-cards";
import { collectionsQueryOptions } from "@/hooks/use-collections";
import { copiesQueryOptions } from "@/hooks/use-copies";

export const Route = createFileRoute("/_authenticated/collections/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(collectionsQueryOptions),
      context.queryClient.ensureQueryData(copiesQueryOptions()),
      context.queryClient.ensureQueryData(catalogQueryOptions),
    ]);
  },
  component: CollectionIndex,
});

function CollectionIndex() {
  return <CollectionGrid />;
}
