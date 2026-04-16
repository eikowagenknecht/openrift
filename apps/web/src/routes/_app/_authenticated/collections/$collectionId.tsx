import { createFileRoute, notFound } from "@tanstack/react-router";

import { CollectionGrid } from "@/components/collection/collection-grid";
import { CollectionPending } from "@/components/collection/collection-pending";
import { RouteErrorFallback } from "@/components/error-message";
import { collectionsQueryOptions, useCollectionsMap } from "@/hooks/use-collections";
import { copiesQueryOptions } from "@/hooks/use-copies";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/collections/$collectionId")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Collection", noIndex: true }),
  loader: async ({ context, params }) => {
    const [collections] = await Promise.all([
      context.queryClient.ensureQueryData(collectionsQueryOptions),
      // Preload all user copies so the copies collection is hydrated. The
      // per-collection view is a client-side live-query filter, not a separate
      // cache key.
      context.queryClient.ensureQueryData(copiesQueryOptions()),
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
  return <CollectionGrid collectionId={collectionId} title={collection?.name ?? "Collection"} />;
}
