/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RouteErrorFallback } from "@/components/error-message";
import { initQueryOptions } from "@/hooks/use-init";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/stage_/source/$token")({
  // Outside `_app` on purpose: this is the OBS browser source, so it must not
  // carry the site's header, footer or background. Never indexed either — the
  // token in the path is the only thing guarding the channel, so this URL must
  // not end up in a search result.
  // No `path`: a canonical URL would have to contain the token, and the page
  // is noindexed anyway.
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Stage source",
      noIndex: true,
    }),
  // Pins the source to one saved preset, so a second OBS scene can run the same
  // channel dressed differently. Falls back to undefined rather than failing
  // validation: a browser source is added once and left alone for months, and a
  // typo in the URL must leave it painting the channel's own dressing.
  validateSearch: z.object({
    preset: z.string().optional().catch(undefined),
  }),
  loader: async ({ context }) => {
    // The pushed card arrives as a printing id, resolved against the catalog.
    // Init carries the keyword styles the plate's rules text renders with — a
    // suspending read, so it has to be in hand before the canvas mounts.
    await Promise.all([
      context.queryClient.ensureQueryData(catalogQueryOptions),
      context.queryClient.ensureQueryData(initQueryOptions),
    ]);
    return null;
  },
  errorComponent: RouteErrorFallback,
});
