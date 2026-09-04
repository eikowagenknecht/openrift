import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { META_DESCRIPTION } from "@/components/meta/meta-copy";
import { initQueryOptions } from "@/hooks/use-init";
import {
  metaActivityQueryOptions,
  metaCountsQueryOptions,
  metaEventsQueryOptions,
} from "@/hooks/use-meta";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { metaOverviewSearchSchema } from "@/lib/meta-deck-search";
import { deriveSetEras, resolveScopeRange } from "@/lib/meta-scope";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/meta")({
  validateSearch: metaOverviewSearchSchema,
  // Only the window: the facets narrow the fetched era in the browser, so
  // adding them here would refetch the same rows.
  loaderDeps: ({ search }) => ({ era: search.era, from: search.from, to: search.to }),
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Riftbound Meta Archive",
      description: META_DESCRIPTION,
      path: "/meta",
    }),
  beforeLoad: async ({ context }) => {
    const flags = (await context.queryClient.query({
      ...featureFlagsQueryOptions,
      staleTime: "static",
    })) as FeatureFlags;
    if (!featureEnabled(flags, "meta")) {
      throw redirect({ to: "/cards" });
    }
  },
  loader: async ({ context, deps }) => {
    const sets = await context.queryClient.query({
      ...publicSetListQueryOptions,
      staleTime: "static",
    });
    const range = resolveScopeRange(deps, deriveSetEras(sets.sets));
    await Promise.all([
      context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...metaEventsQueryOptions(range), staleTime: "static" }),
      context.queryClient.query({ ...metaCountsQueryOptions(), staleTime: "static" }),
      context.queryClient.query({ ...metaActivityQueryOptions, staleTime: "static" }),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
