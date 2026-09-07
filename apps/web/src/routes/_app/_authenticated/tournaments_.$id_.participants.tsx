import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import {
  loadTournamentDetail,
  redirectToTournamentOverview,
} from "@/features/tournaments/hooks/tournament-route-guards";
import { tournamentParticipantsQueryOptions } from "@/features/tournaments/hooks/use-tournaments";
import { isTournamentStaff } from "@/features/tournaments/lib/tournament-display";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/tournaments_/$id_/participants")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Participants", noIndex: true }),
  loader: async ({ context, params }) => {
    // The roster's API endpoint is staff-only; a plain participant lands on
    // the overview.
    const detail = await loadTournamentDetail(context.queryClient, context.userId, params.id);
    if (!isTournamentStaff(detail.myRoles)) {
      redirectToTournamentOverview(params.id);
    }
    await context.queryClient.query({
      ...tournamentParticipantsQueryOptions(context.userId, params.id),
      staleTime: "static",
    });
  },
  errorComponent: RouteErrorFallback,
});
