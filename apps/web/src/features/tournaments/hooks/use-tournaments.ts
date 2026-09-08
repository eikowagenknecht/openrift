import { publicTournamentsContract } from "@openrift/shared/contracts/public-tournaments";
import { tournamentsContract } from "@openrift/shared/contracts/tournaments";
import type {
  PublicTournamentLandingResponse,
  TournamentDetailResponse,
  TournamentListResponse,
  TournamentParticipantListResponse,
  TournamentStaffCandidateListResponse,
  TournamentStaffInviteLandingResponse,
} from "@openrift/shared/types/api/tournament";
import { isDefinedError, safe } from "@orpc/client";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { tournamentsKeys } from "@/features/tournaments/lib/tournaments-query-keys";
import { useRequiredUserId } from "@/lib/auth-session";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

// ── Server functions: queries ────────────────────────────────────────────────

const fetchTournaments = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<TournamentListResponse> =>
    apiOrpcClient(tournamentsContract, context.cookie).list(),
  );

const fetchTournamentDetail = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: id }): Promise<TournamentDetailResponse> => {
    // 404 maps to the sentinel the route boundary expects; other errors propagate.
    const { error, data } = await safe(
      apiOrpcClient(tournamentsContract, context.cookie).get({ id }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

const fetchGroupTournaments = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: slug }): Promise<TournamentListResponse> =>
    apiOrpcClient(tournamentsContract, context.cookie).listForGroup({ slug }),
  );

const fetchParticipants = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: id }): Promise<TournamentParticipantListResponse> => {
    // Map the deleted-tournament 404 to the sentinel like the other fetchers,
    // so a stale tab polling a gone tournament doesn't spam Sentry with raw
    // ORPCErrors.
    const { error, data } = await safe(
      apiOrpcClient(tournamentsContract, context.cookie).listParticipants({ id }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

const fetchSubmitLanding = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .handler(async ({ data: token }): Promise<PublicTournamentLandingResponse> => {
    const { error, data } = await safe(apiOrpcClient(publicTournamentsContract).landing({ token }));
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

const fetchStaffCandidates = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: id }): Promise<TournamentStaffCandidateListResponse> => {
    const { error, data } = await safe(
      apiOrpcClient(tournamentsContract, context.cookie).listStaffCandidates({ id }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

const fetchStaffInviteLanding = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: token }): Promise<TournamentStaffInviteLandingResponse> => {
    const { error, data } = await safe(
      apiOrpcClient(publicTournamentsContract, context.cookie).staffInviteLanding({ token }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

// ── Query options + hooks ────────────────────────────────────────────────────

export function tournamentsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: tournamentsKeys.all(userId),
    queryFn: () => fetchTournaments(),
  });
}

export function tournamentDetailQueryOptions(userId: string, id: string) {
  return queryOptions({
    queryKey: tournamentsKeys.detail(userId, id),
    queryFn: () => fetchTournamentDetail({ data: id }),
  });
}

export function groupTournamentsQueryOptions(userId: string, slug: string) {
  return queryOptions({
    queryKey: tournamentsKeys.forGroup(userId, slug),
    queryFn: () => fetchGroupTournaments({ data: slug }),
  });
}

export function tournamentParticipantsQueryOptions(userId: string, id: string) {
  return queryOptions({
    queryKey: tournamentsKeys.participants(userId, id),
    queryFn: () => fetchParticipants({ data: id }),
  });
}

export function tournamentSubmitLandingQueryOptions(token: string) {
  return queryOptions({
    queryKey: tournamentsKeys.submitLanding(token),
    queryFn: () => fetchSubmitLanding({ data: token }),
  });
}

function tournamentStaffCandidatesQueryOptions(userId: string, id: string) {
  return queryOptions({
    queryKey: tournamentsKeys.staffCandidates(userId, id),
    queryFn: () => fetchStaffCandidates({ data: id }),
  });
}

export function tournamentStaffInviteLandingQueryOptions(token: string) {
  return queryOptions({
    queryKey: tournamentsKeys.staffInviteLanding(token),
    queryFn: () => fetchStaffInviteLanding({ data: token }),
  });
}

export function useTournaments() {
  const userId = useRequiredUserId();
  return useSuspenseQuery(tournamentsQueryOptions(userId));
}

export function useTournamentDetail(id: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(tournamentDetailQueryOptions(userId, id));
}

export function useGroupTournaments(slug: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(groupTournamentsQueryOptions(userId, slug));
}

export function useTournamentParticipants(id: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(tournamentParticipantsQueryOptions(userId, id));
}

export function useTournamentSubmitLanding(token: string) {
  return useSuspenseQuery(tournamentSubmitLandingQueryOptions(token));
}

/**
 * Eligible staff candidates for the add-staff picker. Non-suspense and gated on
 * `enabled` so it fetches only when the dialog opens, never suspending the page.
 * @returns The candidate-list query.
 */
export function useTournamentStaffCandidates(id: string, enabled = true) {
  const userId = useRequiredUserId();
  return useQuery({ ...tournamentStaffCandidatesQueryOptions(userId, id), enabled });
}

export function useTournamentStaffInviteLanding(token: string) {
  return useSuspenseQuery(tournamentStaffInviteLandingQueryOptions(token));
}
