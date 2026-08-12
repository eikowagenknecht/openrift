import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { collectionsQueryOptions } from "@/lib/collections-query";
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
      context.queryClient.ensureQueryData(catalogQueryOptions),
      context.queryClient.ensureQueryData(collectionsQueryOptions(context.userId)),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
