import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { META_LEGENDS_DESCRIPTION } from "@/components/meta/meta-copy";
import { initQueryOptions } from "@/hooks/use-init";
import { metaEventsQueryOptions, metaLegendsQueryOptions } from "@/hooks/use-meta";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { metaLegendsSearchSchema } from "@/lib/meta-legends-search";
import { breadcrumbJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/meta_/legends")({
  validateSearch: metaLegendsSearchSchema,
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
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    if (!featureEnabled(flags, "meta")) {
      throw redirect({ to: "/cards" });
    }
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(initQueryOptions),
      context.queryClient.ensureQueryData(metaLegendsQueryOptions),
      // The rows join their records against the events payload client-side.
      context.queryClient.ensureQueryData(metaEventsQueryOptions),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
