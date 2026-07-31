import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { collectionsQueryOptions } from "@/lib/collections-query";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/collections_/scan")({
  // data-only: the page drives a live camera and reads collection state via
  // live queries — nothing here renders meaningfully on the server.
  ssr: "data-only",
  staticData: { hideFooter: true },
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Scan cards", noIndex: true }),
  beforeLoad: async ({ context }) => {
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    if (!featureEnabled(flags, "scanner")) {
      throw redirect({ to: "/collections" });
    }
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(catalogQueryOptions),
      context.queryClient.ensureQueryData(collectionsQueryOptions(context.userId)),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
