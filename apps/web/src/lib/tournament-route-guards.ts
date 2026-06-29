import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import {
  tournamentDetailQueryOptions,
  tournamentRunStateQueryOptions,
} from "@/hooks/use-tournaments";

/**
 * Ensures the unified tournament detail is loaded and returns it, so a tab
 * loader can both prefetch it and gate visibility on roles/config.
 * @returns The tournament detail.
 */
export function loadTournamentDetail(queryClient: QueryClient, userId: string, id: string) {
  return queryClient.ensureQueryData(tournamentDetailQueryOptions(userId, id));
}

/**
 * Ensures the pod-engine run state (pairings + standings) is loaded. Readable by
 * anyone with a relationship to the tournament, so participants can follow along.
 * @returns The pod tournament run state.
 */
export function loadTournamentRunState(queryClient: QueryClient, userId: string, id: string) {
  return queryClient.ensureQueryData(tournamentRunStateQueryOptions(userId, id));
}

/**
 * Throws a redirect to the overview tab. Callers invoke it when the tab the
 * viewer hit is not available to them — the condition lives at the call site
 * (wrong pairing style, deck check off, or an insufficient role), not here. The
 * visible tab nav never links to an unavailable tab, but a direct URL would
 * otherwise show an empty or unauthorized surface.
 * @returns Never; always throws a redirect.
 */
export function redirectToTournamentOverview(id: string): never {
  throw redirect({ to: "/tournaments/$id", params: { id } });
}
