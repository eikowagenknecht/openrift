import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { catalogQueryOptions } from "@/features/cards/hooks/catalog-query";
import { loadCatalogTail } from "@/features/cards/lib/catalog-query";
import { collectionsQueryOptions } from "@/features/collections/lib/collections-query";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/scan")({
  // data-only: the page drives a live camera and reads collection state via
  // live queries — nothing here renders meaningfully on the server.
  ssr: "data-only",
  staticData: { hideFooter: true },
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Scan cards", noIndex: true }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...catalogQueryOptions, staleTime: "static" }),
      context.queryClient.query({
        ...collectionsQueryOptions(context.userId),
        staleTime: "static",
      }),
    ]);
    // The catalog's client fetch covers the user's languages first; the scanner
    // must match printings of ANY language, so pull the remaining ones now
    // (no-op when complete) without blocking the route transition on them.
    void loadCatalogTail(context.queryClient);
  },
  errorComponent: RouteErrorFallback,
});
