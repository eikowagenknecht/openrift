import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { tournamentParticipantsQueryOptions } from "@/hooks/use-tournaments";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { loadTournamentDetail } from "@/lib/tournament-route-guards";

export const Route = createFileRoute("/_app/_authenticated/tournaments_/$id")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Tournament", noIndex: true }),
  loader: async ({ context, params }) => {
    await Promise.all([
      loadTournamentDetail(context.queryClient, context.userId, params.id),
      context.queryClient.ensureQueryData(
        tournamentParticipantsQueryOptions(context.userId, params.id),
      ),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
