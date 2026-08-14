/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { RouteErrorFallback } from "@/components/error-message";
import { overlayChannelQueryOptions } from "@/hooks/use-overlay";
import { catalogQueryOptions } from "@/lib/catalog-query";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { queueCardsSearchSchema } from "@/lib/presentation-queue-search";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

/**
 * The prepared queue lives in the URL rather than component state, so a
 * mid-stream reload or an accidental navigation doesn't wipe what the creator
 * lined up beforehand. Malformed values fall back to an empty queue instead of
 * crashing the route.
 */
const overlaySearchSchema = z.object({
  /**
   * Queue of printing ids waiting to be pushed, in order. Truncated to the
   * queue limit rather than rejected — see {@link queueCardsSearchSchema}.
   */
  cards: queueCardsSearchSchema,
});

export const Route = createFileRoute("/_app/_authenticated/overlay")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Stream overlay", noIndex: true }),
  validateSearch: overlaySearchSchema,
  beforeLoad: async ({ context }) => {
    // Same gate as /tier-lists: the dashboard hides behind the flag while the
    // feature is dark. The OBS source route (/overlay/$token) stays ungated —
    // it is viewer-facing and blanks itself for unknown tokens.
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    if (!featureEnabled(flags, "overlay")) {
      throw redirect({ to: "/cards" });
    }
  },
  loader: async ({ context }) => {
    // The card picker and the live preview both resolve printings from the
    // catalog, and the channel read is what mints the token on first visit —
    // both are on the critical path for the whole page.
    await Promise.all([
      context.queryClient.ensureQueryData(catalogQueryOptions),
      context.queryClient.ensureQueryData(overlayChannelQueryOptions(context.userId)),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
