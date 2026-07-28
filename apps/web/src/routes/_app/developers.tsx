import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/developers")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Developers",
      description:
        "OpenRift's free public API for Riftbound card data: catalog, cards, sets, prices, rules, promos, and products.",
      path: "/developers",
    }),
  beforeLoad: async ({ context }) => {
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    if (!featureEnabled(flags, "developers")) {
      throw redirect({ to: "/cards" });
    }
  },
  errorComponent: RouteErrorFallback,
});
