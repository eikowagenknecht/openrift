import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { initQueryOptions } from "@/hooks/use-init";
import { metaEventsQueryOptions } from "@/hooks/use-meta";
import { catalogQueryOptions } from "@/lib/catalog-query";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

/**
 * `/meta/$slug/submit` — send a decklist for an event the archive already has
 * (ADR-014). The slug only preselects the target; an unknown one falls through
 * to the picker rather than 404ing, so a stale link still lets someone send
 * what they came to send.
 */
export const Route = createFileRoute("/_app/_authenticated/meta_/$slug_/submit")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Send a decklist", noIndex: true }),
  loader: async ({ context }) => {
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    if (!featureEnabled(flags, "meta")) {
      throw redirect({ to: "/cards" });
    }
    await Promise.all([
      context.queryClient.ensureQueryData(initQueryOptions),
      context.queryClient.ensureQueryData(metaEventsQueryOptions),
      context.queryClient.ensureQueryData(catalogQueryOptions),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
