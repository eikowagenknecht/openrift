import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

// Outside `_authenticated` on purpose: the confirm step is reachable logged-out
// so a claim link renders "Claim your spot in <tournament>?" before routing through login.
export const Route = createFileRoute("/_app/tournaments_/claim/$token")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Claim your spot", noIndex: true }),
  errorComponent: RouteErrorFallback,
});
