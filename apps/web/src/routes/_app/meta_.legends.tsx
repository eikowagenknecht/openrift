import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { META_LEGENDS_DESCRIPTION } from "@/components/meta/meta-copy";
import { initQueryOptions } from "@/hooks/use-init";
import { metaEventsQueryOptions, metaLegendsQueryOptions } from "@/hooks/use-meta";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { metaLegendsSearchSchema } from "@/lib/meta-legends-search";
import { deriveSetEras, resolveScopeRange } from "@/lib/meta-scope";
import { breadcrumbJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/meta_/legends")({
  validateSearch: metaLegendsSearchSchema,
  // Only the window: the facets and the search box narrow the fetched era in
  // the browser.
  loaderDeps: ({ search }) => ({ era: search.era, from: search.from, to: search.to }),
  head: () => {
    const siteUrl = getSiteUrl();
    return {
      ...seoHead({
        siteUrl,
        title: "Riftbound Legends in the Meta Archive",
        description: META_LEGENDS_DESCRIPTION,
        path: "/meta/legends",
      }),
      scripts: [
        breadcrumbJsonLd(siteUrl, [
          { name: "Meta Archive", path: "/meta" },
          { name: "Legends", path: "/meta/legends" },
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
      context.queryClient.query({ ...metaLegendsQueryOptions, staleTime: "static" }),
      // The rows join their records against the events payload client-side.
      context.queryClient.query({ ...metaEventsQueryOptions(range), staleTime: "static" }),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
