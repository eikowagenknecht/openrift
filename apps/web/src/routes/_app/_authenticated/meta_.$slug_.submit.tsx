import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { catalogQueryOptions } from "@/features/cards/hooks/catalog-query";
import { metaDeckQueryOptions, metaEventsQueryOptions } from "@/features/meta/hooks/use-meta";
import { parseMetaSubmitSearch } from "@/features/meta/lib/meta-submit-link";
import { initQueryOptions } from "@/hooks/use-init";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

/** An unknown slug renders the picker; it does not 404. */
export const Route = createFileRoute("/_app/_authenticated/meta_/$slug_/submit")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Send a decklist", noIndex: true }),
  validateSearch: parseMetaSubmitSearch,
  loaderDeps: ({ search }) => ({ deck: search.deck }),
  loader: async ({ context, deps }) => {
    const flags = (await context.queryClient.query({
      ...featureFlagsQueryOptions,
      staleTime: "static",
    })) as FeatureFlags;
    if (!featureEnabled(flags, "meta")) {
      throw redirect({ to: "/cards" });
    }
    await Promise.all([
      context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...metaEventsQueryOptions(), staleTime: "static" }),
      context.queryClient.query({ ...catalogQueryOptions, staleTime: "static" }),
      // Puts the edited list in cache before the form mounts. A token that no
      // longer resolves is not fatal: the box just opens empty.
      deps.deck === undefined
        ? Promise.resolve()
        : context.queryClient
            .query({ ...metaDeckQueryOptions(deps.deck), staleTime: "static" })
            .catch(() => null),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
