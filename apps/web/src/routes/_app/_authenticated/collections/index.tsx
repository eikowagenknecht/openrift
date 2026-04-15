import { createFileRoute } from "@tanstack/react-router";

import { CollectionGrid } from "@/components/collection/collection-grid";
import { CollectionPending } from "@/components/collection/collection-pending";
import { RouteErrorFallback } from "@/components/error-message";
import { collectionsQueryOptions } from "@/hooks/use-collections";
import { copiesQueryOptions } from "@/hooks/use-copies";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/collections/")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Collections", noIndex: true }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(collectionsQueryOptions),
      context.queryClient.ensureQueryData(copiesQueryOptions()),
    ]);
  },
  component: CollectionIndex,
  pendingComponent: CollectionPending,
  errorComponent: RouteErrorFallback,
});

function CollectionIndex() {
  return <CollectionGrid title="All Cards" />;
}
