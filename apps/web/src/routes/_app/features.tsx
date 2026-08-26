import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/features")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Features",
      description:
        "Everything OpenRift does: a card scanner, collection tracking, daily prices from three marketplaces, deck building with legality checks, private trade groups, loans, tournaments, and streaming tools.",
      path: "/features",
    }),
  errorComponent: RouteErrorFallback,
});
