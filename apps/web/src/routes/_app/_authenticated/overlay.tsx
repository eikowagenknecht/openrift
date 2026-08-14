import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { overlayChannelQueryOptions } from "@/hooks/use-overlay";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/overlay")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Stream overlay", noIndex: true }),
  loader: async ({ context }) => {
    // The card picker and the live preview both resolve printings from the
    // catalog, and the channel read is what mints the token on first visit —
    // both are on the critical path for the whole page.
    await Promise.all([
      context.queryClient.ensureQueryData(catalogQueryOptions),
      context.queryClient.ensureQueryData(overlayChannelQueryOptions(context.userId)),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
