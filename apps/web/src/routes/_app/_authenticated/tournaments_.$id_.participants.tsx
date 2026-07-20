import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { tournamentParticipantsQueryOptions } from "@/hooks/use-tournaments";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { isTournamentStaff } from "@/lib/tournament-display";
import { loadTournamentDetail, redirectToTournamentOverview } from "@/lib/tournament-route-guards";

export const Route = createFileRoute("/_app/_authenticated/tournaments_/$id_/participants")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Participants", noIndex: true }),
  loader: async ({ context, params }) => {
    // The roster surface (and its staff-gated API endpoint, which carries the
    // claim links) is staff-only; a plain participant lands on the overview.
    const detail = await loadTournamentDetail(context.queryClient, context.userId, params.id);
    if (!isTournamentStaff(detail.myRoles)) {
      redirectToTournamentOverview(params.id);
    }
    await context.queryClient.ensureQueryData(
      tournamentParticipantsQueryOptions(context.userId, params.id),
    );
  },
  errorComponent: RouteErrorFallback,
});
