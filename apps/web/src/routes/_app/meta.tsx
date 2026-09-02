import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { META_DESCRIPTION } from "@/components/meta/meta-copy";
import { initQueryOptions } from "@/hooks/use-init";
import { metaActivityQueryOptions, metaEventsQueryOptions } from "@/hooks/use-meta";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
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
  // The whole archive ships as two payloads and the page narrows both in the
  // browser, so the scope params are not loader deps: changing one re-renders
  // rather than re-fetching.
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...publicSetListQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...metaEventsQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...metaActivityQueryOptions, staleTime: "static" }),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
