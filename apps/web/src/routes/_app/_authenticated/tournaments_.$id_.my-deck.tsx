import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { loadTournamentDetail, redirectToTournamentOverview } from "@/lib/tournament-route-guards";

export const Route = createFileRoute("/_app/_authenticated/tournaments_/$id_/my-deck")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "My deck", noIndex: true }),
  loader: async ({ context, params }) => {
    const detail = await loadTournamentDetail(context.queryClient, context.userId, params.id);
    // The page is the viewer's own entry, so holding one is the whole gate: a
    // judge without a deck of their own has no business here either.
    if (!detail.myDeckEntry) {
      redirectToTournamentOverview(params.id);
    }
  },
  errorComponent: RouteErrorFallback,
});
