import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { metaDecksQueryOptions } from "@/hooks/use-meta";
import { metaSubmissionsQueryOptions } from "@/hooks/use-meta-submissions";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

/**
 * `/meta/submissions` — what happened to every decklist this person sent
 * (ADR-014's User submissions). Provider uploads keep no outcome ledger; a
 * person who types in a top-8 list needs one, and this page is what reads it.
 */
export const Route = createFileRoute("/_app/_authenticated/meta_/submissions")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Decklists you sent", noIndex: true }),
  loader: async ({ context }) => {
    const flags = (await context.queryClient.query({
      ...featureFlagsQueryOptions,
      staleTime: "static",
    })) as FeatureFlags;
    if (!featureEnabled(flags, "meta")) {
      throw redirect({ to: "/cards" });
    }
    await Promise.all([
      context.queryClient.infiniteQuery({
        ...metaSubmissionsQueryOptions(context.userId),
        staleTime: "static",
      }),
      // An accepted row names a deck id, while a public archive link is keyed by
      // the deck's share token. The archive payload is what maps one to the other.
      context.queryClient.query({ ...metaDecksQueryOptions, staleTime: "static" }),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
