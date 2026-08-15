import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { META_DESCRIPTION } from "@/components/meta/meta-copy";
import { initQueryOptions } from "@/hooks/use-init";
import { metaEventsQueryOptions, metaStatsQueryOptions } from "@/hooks/use-meta";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { metaOverviewSearchSchema } from "@/lib/meta-deck-search";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/meta")({
  validateSearch: metaOverviewSearchSchema,
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Riftbound Meta",
      description: META_DESCRIPTION,
      path: "/meta",
    }),
  beforeLoad: async ({ context }) => {
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    if (!featureEnabled(flags, "meta")) {
      throw redirect({ to: "/cards" });
    }
  },
  // The stats endpoint scopes its aggregates server-side, so the filters are
  // loader deps rather than a client-side narrowing.
  loaderDeps: ({ search }) => ({ format: search.format, from: search.from, to: search.to }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(initQueryOptions),
      context.queryClient.ensureQueryData(metaEventsQueryOptions),
      context.queryClient.ensureQueryData(
        metaStatsQueryOptions({ format: deps.format, dateFrom: deps.from, dateTo: deps.to }),
      ),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
