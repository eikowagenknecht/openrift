import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { publicSetListQueryOptions } from "@/features/cards/hooks/use-public-sets";
import { META_EVENTS_DESCRIPTION } from "@/features/meta/components/meta-copy";
import { metaCountsQueryOptions, metaEventsQueryOptions } from "@/features/meta/hooks/use-meta";
import { metaEventsSearchSchema } from "@/features/meta/lib/meta-events-search";
import { deriveSetEras, resolveScopeRange } from "@/features/meta/lib/meta-scope";
import { initQueryOptions } from "@/hooks/use-init";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { breadcrumbJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/meta_/events")({
  validateSearch: metaEventsSearchSchema,
  // Only the window: the facets, the search box and the sort all narrow the
  // fetched era in the browser.
  loaderDeps: ({ search }) => ({ era: search.era, from: search.from, to: search.to }),
  head: () => {
    const siteUrl = getSiteUrl();
    return {
      ...seoHead({
        siteUrl,
        title: "Archived Riftbound Events",
        description: META_EVENTS_DESCRIPTION,
        path: "/meta/events",
      }),
      scripts: [
        breadcrumbJsonLd(siteUrl, [
          { name: "Meta Archive", path: "/meta" },
          { name: "Events", path: "/meta/events" },
        ]),
      ],
    };
  },
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
    ]);
  },
  errorComponent: RouteErrorFallback,
});
