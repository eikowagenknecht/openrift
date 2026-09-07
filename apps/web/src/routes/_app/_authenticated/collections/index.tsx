import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { cleanedSearchForRedirect, filterSearchSchema } from "@/features/cards/lib/search-schemas";
import { CollectionPending } from "@/features/collections/components/collection-pending";
import { collectionsQueryOptions } from "@/features/collections/lib/collections-query";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/collections/")({
  ssr: "data-only",
  beforeLoad: ({ search, location }) => {
    // Strip unknown / malformed search params — same canonicalization as
    // /cards. (The filter schema is validated by the collections layout route.)
    const cleaned = cleanedSearchForRedirect(filterSearchSchema, search, location.searchStr);
    if (cleaned) {
      throw redirect({ to: "/collections", search: cleaned, replace: true });
    }
  },
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Collections", noIndex: true }),
  loader: async ({ context }) => {
    await context.queryClient.query({
      ...collectionsQueryOptions(context.userId),
      staleTime: "static",
    });
  },
  pendingComponent: CollectionPending,
  errorComponent: RouteErrorFallback,
});
