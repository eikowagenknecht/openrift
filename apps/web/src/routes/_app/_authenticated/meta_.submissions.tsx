import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
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
    await context.queryClient.infiniteQuery({
      ...metaSubmissionsQueryOptions(context.userId),
      staleTime: "static",
    });
  },
  errorComponent: RouteErrorFallback,
});
