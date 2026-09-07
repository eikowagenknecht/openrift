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
 * Entry point for a decklist without a slug; `/meta/$slug/submit` requires
 * one that a submission-only proposal doesn't have.
 */
export const Route = createFileRoute("/_app/_authenticated/meta_/submit")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Send a decklist", noIndex: true }),
  loader: async ({ context }) => {
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
      // The catalog turns a pasted deck code's short codes into the card names
      // the submission endpoint takes.
      context.queryClient.query({ ...catalogQueryOptions, staleTime: "static" }),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
