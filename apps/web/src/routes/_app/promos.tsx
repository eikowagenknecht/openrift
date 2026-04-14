import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { initQueryOptions } from "@/hooks/use-init";
import { publicPromoListQueryOptions } from "@/hooks/use-public-promos";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/promos")({
  head: () => {
    const siteUrl = getSiteUrl();
    return seoHead({
      siteUrl,
      title: "Promo Cards — Riftbound",
      description:
        "Browse all promotional card printings for the Riftbound trading card game, grouped by promo type.",
      path: "/promos",
    });
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(publicPromoListQueryOptions),
      context.queryClient.ensureQueryData(initQueryOptions),
    ]),
  component: () => null,
  pendingComponent: () => null,
  errorComponent: RouteErrorFallback,
});
