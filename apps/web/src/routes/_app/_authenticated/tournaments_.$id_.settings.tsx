import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import {
  loadTournamentDetail,
  redirectToTournamentOverview,
} from "@/features/tournaments/hooks/tournament-route-guards";
import { canManageTournament } from "@/features/tournaments/lib/tournament-display";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/tournaments_/$id_/settings")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Settings", noIndex: true }),
  loader: async ({ context, params }) => {
    const detail = await loadTournamentDetail(context.queryClient, context.userId, params.id);
    if (!canManageTournament(detail.myRoles)) {
      redirectToTournamentOverview(params.id);
    }
  },
  errorComponent: RouteErrorFallback,
});
