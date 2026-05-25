import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/groups/$slug_/lists/$listId")({
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Shared list", noIndex: true }),
  errorComponent: RouteErrorFallback,
});
