import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import type { TournamentTab } from "@/components/tournaments/tournament-detail-frame";
import { TOURNAMENT_TABS } from "@/components/tournaments/tournament-detail-frame";
import { tournamentParticipantsQueryOptions } from "@/hooks/use-tournaments";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { loadTournamentDetail } from "@/lib/tournament-route-guards";

/**
 * Sends a legacy `?tab=…` link to its dedicated route. Tabs used to be a search
 * param; they are now sibling routes, so old bookmarks redirect once.
 * @returns Nothing; throws a redirect when a non-overview tab is requested.
 */
function redirectLegacyTab(tab: TournamentTab, id: string, entry?: string): void {
  const params = { id };
  switch (tab) {
    case "overview": {
      return;
    }
    case "participants": {
      throw redirect({ to: "/tournaments/$id/participants", params });
    }
    case "pairings": {
      throw redirect({ to: "/tournaments/$id/pairings", params });
    }
    case "standings": {
      throw redirect({ to: "/tournaments/$id/standings", params });
    }
    case "decks": {
      throw redirect({
        to: "/tournaments/$id/decks",
        params,
        search: entry ? { entry } : {},
      });
    }
    case "staff": {
      throw redirect({ to: "/tournaments/$id/staff", params });
    }
    case "settings": {
      throw redirect({ to: "/tournaments/$id/settings", params });
    }
  }
}

export const Route = createFileRoute("/_app/_authenticated/tournaments_/$id")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Tournament", noIndex: true }),
  validateSearch: (search: Record<string, unknown>): { tab?: TournamentTab; entry?: string } => {
    const tab = search.tab;
    const valid = typeof tab === "string" && (TOURNAMENT_TABS as readonly string[]).includes(tab);
    const entry = typeof search.entry === "string" ? search.entry : undefined;
    return { ...(valid ? { tab: tab as TournamentTab } : {}), ...(entry ? { entry } : {}) };
  },
  beforeLoad: ({ params, search }) => {
    if (search.tab) {
      redirectLegacyTab(search.tab, params.id, search.entry);
    }
  },
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
