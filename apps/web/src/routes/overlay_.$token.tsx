import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { initQueryOptions } from "@/hooks/use-init";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/overlay_/$token")({
  // Never indexed: the token in the path is the only thing guarding the
  // channel, so this URL must not end up in a search result.
  // No `path`: a canonical URL would have to contain the token, and the page
  // is noindexed anyway.
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Stream overlay",
      noIndex: true,
    }),
  loader: async ({ context }) => {
    // The pushed card arrives as a printing id, resolved against the catalog.
    // Init carries the keyword styles the plate's rules text renders with — a
    // suspending read, so it has to be in hand before the canvas mounts.
    await Promise.all([
      context.queryClient.ensureQueryData(catalogQueryOptions),
      context.queryClient.ensureQueryData(initQueryOptions),
    ]);
    return null;
  },
  errorComponent: RouteErrorFallback,
});
