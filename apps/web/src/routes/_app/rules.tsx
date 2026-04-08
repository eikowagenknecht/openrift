import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { ruleVersionsQueryOptions, rulesQueryOptions } from "@/hooks/use-rules";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/rules")({
  head: () =>
    seoHead({
      title: "Rules",
      description: "Read the official Riftbound rules, with version history and keyword reference.",
      path: "/rules",
    }),
  beforeLoad: async ({ context }) => {
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    if (!featureEnabled(flags, "rules")) {
      throw redirect({ to: "/cards" });
    }
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(rulesQueryOptions),
      context.queryClient.ensureQueryData(ruleVersionsQueryOptions),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
