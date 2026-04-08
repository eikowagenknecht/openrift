import { createFileRoute } from "@tanstack/react-router";

import { CollectionGrid } from "@/components/collection/collection-grid";
import { CollectionPending } from "@/components/collection/collection-pending";
import { RouteErrorFallback } from "@/components/error-message";
import { catalogQueryOptions } from "@/hooks/use-cards";
import { collectionsQueryOptions } from "@/hooks/use-collections";
import { copiesQueryOptions } from "@/hooks/use-copies";

export const Route = createFileRoute("/_app/_authenticated/collections/")({
  head: () => ({ meta: [{ title: "Collections — OpenRift" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(collectionsQueryOptions),
      context.queryClient.ensureQueryData(copiesQueryOptions()),
      context.queryClient.ensureQueryData(catalogQueryOptions),
    ]);
  },
  component: CollectionIndex,
  pendingComponent: CollectionPending,
  errorComponent: RouteErrorFallback,
});

function CollectionIndex() {
  return <CollectionGrid title="All Cards" />;
}
