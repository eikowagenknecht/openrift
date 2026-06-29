import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { canManageTournament } from "@/lib/tournament-display";
import { loadTournamentDetail, redirectToTournamentOverview } from "@/lib/tournament-route-guards";

export const Route = createFileRoute("/_app/_authenticated/tournaments_/$id_/staff")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Staff", noIndex: true }),
  loader: async ({ context, params }) => {
    const detail = await loadTournamentDetail(context.queryClient, context.userId, params.id);
    if (!canManageTournament(detail.myRoles)) {
      redirectToTournamentOverview(params.id);
    }
  },
  errorComponent: RouteErrorFallback,
});
