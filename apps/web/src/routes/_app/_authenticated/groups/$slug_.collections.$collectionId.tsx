import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { filterSearchSchema } from "@/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute(
  "/_app/_authenticated/groups/$slug_/collections/$collectionId",
)({
  validateSearch: filterSearchSchema,
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Shared collection", noIndex: true }),
  errorComponent: RouteErrorFallback,
});
