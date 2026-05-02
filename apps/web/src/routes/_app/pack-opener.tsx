import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { initQueryOptions } from "@/hooks/use-init";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/pack-opener")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Pack opener — Riftbound",
      description:
        "Open virtual Riftbound booster packs with the real published pull rates. Entertainment only.",
      path: "/pack-opener",
      noIndex: true,
    }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(publicSetListQueryOptions),
      context.queryClient.ensureQueryData(initQueryOptions),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
