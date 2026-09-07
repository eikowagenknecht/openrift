import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import {
  loadTournamentDetail,
  redirectToTournamentOverview,
} from "@/hooks/tournament-route-guards";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/tournaments_/$id_/my-deck")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "My deck", noIndex: true }),
  loader: async ({ context, params }) => {
    const detail = await loadTournamentDetail(context.queryClient, context.userId, params.id);
    // No staff role check: holding an entry is the whole gate, so a judge
    // without a deck of their own is redirected too.
    if (!detail.myDeckEntry) {
      redirectToTournamentOverview(params.id);
    }
  },
  errorComponent: RouteErrorFallback,
});
