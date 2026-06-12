import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

// Outside `_authenticated` on purpose: the confirm step is reachable logged-out
// so a claim link renders "Claim this deck for <event>?" before routing through
// login (ADR-026 amendment).
export const Route = createFileRoute("/_app/tournament-claim/$token")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Claim your deck", noIndex: true }),
  errorComponent: RouteErrorFallback,
});
