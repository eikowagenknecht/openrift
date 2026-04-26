import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { ruleVersionsQueryOptions, rulesQueryOptions } from "@/hooks/use-rules";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { articleJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

const RULES_DESCRIPTION =
  "Read the official Riftbound rules, with version history and keyword reference.";

export const Route = createFileRoute("/_app/rules")({
  head: () => {
    const siteUrl = getSiteUrl();
    const head = seoHead({
      siteUrl,
      title: "Rules",
      description: RULES_DESCRIPTION,
      path: "/rules",
    });
    return {
      ...head,
      scripts: [
        articleJsonLd({
          siteUrl,
          headline: "Riftbound Rules",
          description: RULES_DESCRIPTION,
          path: "/rules",
        }),
      ],
    };
  },
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
