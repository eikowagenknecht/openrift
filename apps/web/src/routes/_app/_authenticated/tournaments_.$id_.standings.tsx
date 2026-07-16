import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import {
  loadTournamentDetail,
  loadTournamentRunState,
  redirectToTournamentOverview,
} from "@/lib/tournament-route-guards";

export const Route = createFileRoute("/_app/_authenticated/tournaments_/$id_/standings")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Standings", noIndex: true }),
  loader: async ({ context, params }) => {
    const detail = await loadTournamentDetail(context.queryClient, context.userId, params.id);
    if (detail.pairingStyle === "none") {
      redirectToTournamentOverview(params.id);
    }
    await loadTournamentRunState(context.queryClient, context.userId, params.id);
  },
  errorComponent: RouteErrorFallback,
});
