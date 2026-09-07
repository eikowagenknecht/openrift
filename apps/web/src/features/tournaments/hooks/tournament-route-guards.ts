import type { QueryClient } from "@tanstack/react-query";
import { notFound, redirect } from "@tanstack/react-router";

import {
  tournamentDetailQueryOptions,
  tournamentRunStateQueryOptions,
} from "@/features/tournaments/hooks/use-tournaments";

/** Converts the server fn's NOT_FOUND sentinel into the router's notFound. */
export async function loadTournamentDetail(queryClient: QueryClient, userId: string, id: string) {
  try {
    return await queryClient.query({
      ...tournamentDetailQueryOptions(userId, id),
      staleTime: "static",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      throw notFound();
    }
    throw error;
  }
}

export function loadTournamentRunState(queryClient: QueryClient, userId: string, id: string) {
  return queryClient.query({ ...tournamentRunStateQueryOptions(userId, id), staleTime: "static" });
}

export function redirectToTournamentOverview(id: string): never {
  throw redirect({ to: "/tournaments/$id", params: { id } });
}
