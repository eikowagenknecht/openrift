import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { META_DECKS_DESCRIPTION } from "@/components/meta/meta-copy";
import { initQueryOptions } from "@/hooks/use-init";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { metaDeckSearchSchema } from "@/lib/meta-deck-search";
import { breadcrumbJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/meta_/decks")({
  validateSearch: metaDeckSearchSchema,
  head: () => {
    const siteUrl = getSiteUrl();
    return {
      ...seoHead({
        siteUrl,
        title: "Archived Riftbound Decks",
        description: META_DECKS_DESCRIPTION,
        path: "/meta/decks",
      }),
      scripts: [
        breadcrumbJsonLd(siteUrl, [
          { name: "Meta Archive", path: "/meta" },
          { name: "Archived decks", path: "/meta/decks" },
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
  loader: async ({ context }) => {
    await context.queryClient.query({ ...initQueryOptions, staleTime: "static" });
  },
  errorComponent: RouteErrorFallback,
});
