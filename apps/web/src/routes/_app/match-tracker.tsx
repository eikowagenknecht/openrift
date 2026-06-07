import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/match-tracker")({
  staticData: { hideFooter: true },
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Match tracker",
      description:
        "Track points and XP for 2–4 players during a Riftbound game, right from your phone. Works offline, nothing is saved to your account.",
      path: "/match-tracker",
      noIndex: true,
    }),
  errorComponent: RouteErrorFallback,
});
