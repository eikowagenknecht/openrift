import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/tournaments_/my-decks_/$entryId")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "My tournament deck", noIndex: true }),
  errorComponent: RouteErrorFallback,
});
