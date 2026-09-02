import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { tournamentParticipantsQueryOptions } from "@/hooks/use-tournaments";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { isTournamentStaff } from "@/lib/tournament-display";
import { loadTournamentDetail } from "@/lib/tournament-route-guards";

export const Route = createFileRoute("/_app/_authenticated/tournaments_/$id")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Tournament", noIndex: true }),
  loader: async ({ context, params }) => {
    // The participant roster is staff-gated on the API (it carries claim
    // links), so resolve the viewer's roles first — prefetching it for a plain
    // participant 403s the whole loader into the error screen.
    const detail = await loadTournamentDetail(context.queryClient, context.userId, params.id);
    if (isTournamentStaff(detail.myRoles)) {
      await context.queryClient.query({
        ...tournamentParticipantsQueryOptions(context.userId, params.id),
        staleTime: "static",
      });
    }
  },
  errorComponent: RouteErrorFallback,
});
