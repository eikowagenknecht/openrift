import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { CollectionPending } from "@/components/collection/collection-pending";
import { RouteErrorFallback } from "@/components/error-message";
import { collectionsQueryOptions } from "@/lib/collections-query";
import { cleanedSearchForRedirect, filterSearchSchema } from "@/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/collections/$collectionId")({
  ssr: "data-only",
  beforeLoad: ({ search, location, params }) => {
    // Strip unknown / malformed search params — same canonicalization as
    // /cards. (The filter schema is validated by the collections layout route.)
    const cleaned = cleanedSearchForRedirect(filterSearchSchema, search, location.searchStr);
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
    const collections = await context.queryClient.ensureQueryData(
      collectionsQueryOptions(context.userId),
    );
    if (!collections.items.some((col) => col.id === params.collectionId)) {
      throw notFound();
    }
  },
  pendingComponent: CollectionPending,
  errorComponent: RouteErrorFallback,
});
