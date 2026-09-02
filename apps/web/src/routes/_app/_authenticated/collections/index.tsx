import { createFileRoute, redirect } from "@tanstack/react-router";

import { CollectionPending } from "@/components/collection/collection-pending";
import { RouteErrorFallback } from "@/components/error-message";
import { collectionsQueryOptions } from "@/lib/collections-query";
import { cleanedSearchForRedirect, filterSearchSchema } from "@/lib/search-schemas";
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
