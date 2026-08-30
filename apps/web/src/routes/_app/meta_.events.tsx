import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { META_EVENTS_DESCRIPTION } from "@/components/meta/meta-copy";
import { initQueryOptions } from "@/hooks/use-init";
import { metaEventsQueryOptions } from "@/hooks/use-meta";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { metaEventsSearchSchema } from "@/lib/meta-events-search";
import { breadcrumbJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/meta_/events")({
  validateSearch: metaEventsSearchSchema,
  head: () => {
    const siteUrl = getSiteUrl();
    return {
      ...seoHead({
        siteUrl,
        title: "Archived Riftbound Tournaments",
        description: META_EVENTS_DESCRIPTION,
        path: "/meta/events",
      }),
      scripts: [
        breadcrumbJsonLd(siteUrl, [
          { name: "Meta", path: "/meta" },
          { name: "Tournaments", path: "/meta/events" },
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
  // The set list is here for the scope bar's eras, which are derived from set
  // release dates rather than stored.
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(initQueryOptions),
      context.queryClient.ensureQueryData(metaEventsQueryOptions),
      context.queryClient.ensureQueryData(publicSetListQueryOptions),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
