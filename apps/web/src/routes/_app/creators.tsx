import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/creators")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "For creators",
      description:
        "Tools for Riftbound streamers and video makers: card lookups in chat, tier lists, presentation mode, and a stream overlay for OBS.",
      path: "/creators",
    }),
  beforeLoad: async ({ context }) => {
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    if (!featureEnabled(flags, "creators")) {
      throw redirect({ to: "/cards" });
    }
  },
  errorComponent: RouteErrorFallback,
});
