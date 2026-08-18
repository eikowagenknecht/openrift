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
 * `/meta/submit` — send a decklist without starting from an event page.
 *
 * This is also the only way in for a tournament the archive does not have yet:
 * `/meta/$slug/submit` needs a slug and a proposal has none, so the event
 * fields live behind this route's picker instead (ADR-014's User submissions).
 */
export const Route = createFileRoute("/_app/_authenticated/meta_/submit")({
  // Signed-in, and the catalog it needs is a client payload, so there is
  // nothing here worth rendering into the initial HTML.
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
      // The catalog turns a pasted deck code's short codes into the card names
      // the submission endpoint takes.
      context.queryClient.ensureQueryData(catalogQueryOptions),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
