/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RouteErrorFallback } from "@/components/error-message";
import { catalogQueryOptions } from "@/hooks/catalog-query";
import { initQueryOptions } from "@/hooks/use-init";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/stage_/source/$token")({
  // Outside `_app` on purpose: this is the OBS browser source, so it carries no
  // header, footer or background. The token in the path is the only guard, so it's noindexed.
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Stage source",
      noIndex: true,
    }),
  // Falls back to undefined on a bad value: a browser source is added once and left
  // alone for months, and a typo in the URL must not break it.
  validateSearch: z.object({
    preset: z.string().optional().catch(undefined),
  }),
  loader: async ({ context }) => {
    // initQueryOptions is a suspending read, so it must be resolved before the canvas mounts.
    await Promise.all([
      context.queryClient.query({ ...catalogQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
    ]);
    return null;
  },
  errorComponent: RouteErrorFallback,
});
