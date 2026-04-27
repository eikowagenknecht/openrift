import { createFileRoute, notFound } from "@tanstack/react-router";

import { CollectionPending } from "@/components/collection/collection-pending";
import { RouteErrorFallback } from "@/components/error-message";
import { collectionsQueryOptions } from "@/lib/collections-query";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/collections/$collectionId")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Collection", noIndex: true }),
  loader: async ({ context, params }) => {
    const collections = await context.queryClient.ensureQueryData(collectionsQueryOptions);
    if (!collections.items.some((col) => col.id === params.collectionId)) {
      throw notFound();
    }
  },
  pendingComponent: CollectionPending,
  errorComponent: RouteErrorFallback,
});
