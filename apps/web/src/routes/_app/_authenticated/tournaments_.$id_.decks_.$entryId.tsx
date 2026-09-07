import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import {
  loadTournamentDetail,
  redirectToTournamentOverview,
} from "@/hooks/tournament-route-guards";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { canCheckDecks } from "@/lib/tournament-display";

export const Route = createFileRoute("/_app/_authenticated/tournaments_/$id_/decks_/$entryId")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Deck check", noIndex: true }),
  loader: async ({ context, params }) => {
    const detail = await loadTournamentDetail(context.queryClient, context.userId, params.id);
    if (!(detail.deckSubmission !== "none" && canCheckDecks(detail.myRoles))) {
      redirectToTournamentOverview(params.id);
    }
  },
  errorComponent: RouteErrorFallback,
});
