import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { initQueryOptions } from "@/hooks/use-init";
import { metaDeckQueryOptions, metaEventsQueryOptions } from "@/hooks/use-meta";
import { catalogQueryOptions } from "@/lib/catalog-query";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { parseMetaSubmitSearch } from "@/lib/meta-submit-link";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

/**
 * `/meta/$slug/submit` — send a decklist for an event the archive already has
 * (ADR-014). The slug only preselects the target; an unknown one falls through
 * to the picker rather than 404ing, so a stale link still lets someone send
 * what they came to send.
 *
 * The search params carry the standings row an event page opened the form from,
 * so someone filling a hole in the record types the decklist and nothing else.
 * Every one of them is optional and none of them is trusted: the form validates
 * what it was handed exactly as it validates what is typed.
 */
export const Route = createFileRoute("/_app/_authenticated/meta_/$slug_/submit")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Send a decklist", noIndex: true }),
  validateSearch: parseMetaSubmitSearch,
  loaderDeps: ({ search }) => ({ deck: search.deck }),
  loader: async ({ context, deps }) => {
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
      // The list a completion or a correction edits, in cache before the form
      // mounts so its paste box opens already holding it. A token that no
      // longer resolves is not fatal: the box opens empty and the sender types
      // the list, which is what they came to do.
      deps.deck === undefined
        ? Promise.resolve()
        : context.queryClient.ensureQueryData(metaDeckQueryOptions(deps.deck)).catch(() => null),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
