import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { CollectionPending } from "@/components/collection/collection-pending";
import { RouteErrorFallback } from "@/components/error-message";
import { collectionsQueryOptions } from "@/lib/collections-query";
import { cleanedSearchForRedirect, collectionDetailSearchSchema } from "@/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/collections/$collectionId")({
  ssr: "data-only",
  // The layout route validates the shared filter set; this route adds `wanted`
  // on top, because the group-box filter it drives exists on no other surface.
  validateSearch: collectionDetailSearchSchema,
  beforeLoad: ({ search, location, params }) => {
    // Strip unknown / malformed search params — same canonicalization as
    // /cards.
    const cleaned = cleanedSearchForRedirect(
      collectionDetailSearchSchema,
      search,
      location.searchStr,
    );
    if (cleaned) {
      throw redirect({
        to: "/collections/$collectionId",
        params: { collectionId: params.collectionId },
        search: cleaned,
        replace: true,
      });
    }
  },
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Collection", noIndex: true }),
  loader: async ({ context, params }) => {
    const collections = await context.queryClient.query({
      ...collectionsQueryOptions(context.userId),
      staleTime: "static",
    });
    if (!collections.some((col) => col.id === params.collectionId)) {
      throw notFound();
    }
  },
  pendingComponent: CollectionPending,
  errorComponent: RouteErrorFallback,
});
