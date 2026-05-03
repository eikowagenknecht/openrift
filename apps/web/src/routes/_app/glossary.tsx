import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { initQueryOptions } from "@/hooks/use-init";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/glossary")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Glossary",
      description:
        "Riftbound symbols, keywords, and shorthand. Each keyword links into the official rules.",
      path: "/glossary",
    }),
  beforeLoad: async ({ context }) => {
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    if (!featureEnabled(flags, "glossary")) {
      throw redirect({ to: "/cards" });
    }
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(initQueryOptions),
      context.queryClient.ensureQueryData(publicSetListQueryOptions),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
