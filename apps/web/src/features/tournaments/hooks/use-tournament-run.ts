import { publicPodTournamentsContract } from "@openrift/shared/contracts/public-pod-tournaments";
import { tournamentsContract } from "@openrift/shared/contracts/tournaments";
import type {
  PodReportResponse,
  PodTournamentDetailResponse,
} from "@openrift/shared/types/api/pod-tournament";
import type { TournamentDetailResponse } from "@openrift/shared/types/api/tournament";
import { isDefinedError, safe } from "@orpc/client";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useTournamentDetailMutation } from "@/features/tournaments/hooks/use-tournament-mutations";
import { openRoundRefetchInterval } from "@/features/tournaments/lib/open-round-polling";
import { podRoundMutationInvalidationKeys } from "@/features/tournaments/lib/tournament-invalidation";
import { podTournamentsKeys } from "@/features/tournaments/lib/tournaments-query-keys";
import { useRequiredUserId } from "@/lib/auth-session";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// ── Running surface (pairingStyle='pod') ─────────────────────────────────────
// The pod pairings + standings engine, keyed by the same tournament id. These
// call the unified tournaments contract, which authorizes the host, org
// owners/managers, organizer/judge staff, and (read-only) participants — unlike
// the retired owner-only pod route. The follow-along report stays on the public
// token-gated contract.

interface PodResultEntry {
  playerId: string;
  gamePoints: number;
}

interface PairingPodInput {
  size: 2 | 3 | 4;
  playerIds: string[];
}

interface LegendMetaShareInput {
  legendCardId: string;
  /** Percent, one decimal. */
  share: number;
}

const fetchRunState = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: id }): Promise<PodTournamentDetailResponse> => {
    // 404 (unknown / no relationship) maps to the sentinel the route boundary
    // expects; 403 (not a manager, for a mutation) propagates as a normal error.
    const { error, data } = await safe(
      apiOrpcClient(tournamentsContract, context.cookie).runState({ id }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

const fetchReport = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .handler(async ({ data: token }): Promise<PodReportResponse> => {
    // 404 (disabled/rotated token) maps to the sentinel the route boundary expects.
    const { error, data } = await safe(
      apiOrpcClient(publicPodTournamentsContract).report({ token }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

export function tournamentRunStateQueryOptions(userId: string, id: string) {
  return queryOptions({
    queryKey: podTournamentsKeys.detail(userId, id),
    queryFn: () => fetchRunState({ data: id }),
    refetchInterval: (query) => openRoundRefetchInterval(query.state.data),
  });
}

export function tournamentReportQueryOptions(token: string) {
  return queryOptions({
    queryKey: podTournamentsKeys.report(token),
    queryFn: () => fetchReport({ data: token }),
    refetchInterval: (query) => openRoundRefetchInterval(query.state.data),
  });
}

export function useTournamentRunState(id: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(tournamentRunStateQueryOptions(userId, id));
}

export function useTournamentReport(token: string) {
  return useSuspenseQuery(tournamentReportQueryOptions(token));
}

const generateRoundFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; byes: string[] }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<PodTournamentDetailResponse> =>
    apiOrpcClient(tournamentsContract, context.cookie).generateRound(data),
  );

const startGroupRoundFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; groupId: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<PodTournamentDetailResponse> =>
    apiOrpcClient(tournamentsContract, context.cookie).startGroupRound(data),
  );

const startGroupStageRoundFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<PodTournamentDetailResponse> =>
    apiOrpcClient(tournamentsContract, context.cookie).startGroupStageRound(data),
  );

const setLegendMetaSharesFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; shares: LegendMetaShareInput[] }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<PodTournamentDetailResponse> =>
    apiOrpcClient(tournamentsContract, context.cookie).setLegendMetaShares(data),
  );

const replacePairingFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; roundNumber: number; pods: PairingPodInput[]; byes: string[] }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<PodTournamentDetailResponse> =>
    apiOrpcClient(tournamentsContract, context.cookie).replacePairing(data),
  );

const rerollRoundFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; roundNumber: number }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<PodTournamentDetailResponse> =>
    apiOrpcClient(tournamentsContract, context.cookie).rerollRound(data),
  );

const finalizeRoundFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; roundNumber: number }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<PodTournamentDetailResponse> =>
    apiOrpcClient(tournamentsContract, context.cookie).finalizeRound(data),
  );

const submitResultFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; podId: string; results: PodResultEntry[] }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<PodTournamentDetailResponse> =>
    apiOrpcClient(tournamentsContract, context.cookie).submitResult(data),
  );

const setReportTokenFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; enabled: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<TournamentDetailResponse> => {
    const client = apiOrpcClient(tournamentsContract, context.cookie);
    return data.enabled
      ? client.enableReportToken({ id: data.id })
      : client.disableReportToken({ id: data.id });
  });

const setFollowTokenFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; enabled: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<TournamentDetailResponse> => {
    const client = apiOrpcClient(tournamentsContract, context.cookie);
    return data.enabled
      ? client.enableFollowToken({ id: data.id })
      : client.disableFollowToken({ id: data.id });
  });

const submitReportPlayerResultFn = createServerFn({ method: "POST" })
  .validator(
    (input: { token: string; podId: string; playerId: string; gamePoints: number }) => input,
  )
  .handler(({ data }): Promise<PodReportResponse> =>
    apiOrpcClient(publicPodTournamentsContract).submitPlayerResult(data),
  );

const startReportGroupRoundFn = createServerFn({ method: "POST" })
  .validator((input: { token: string; groupId: string }) => input)
  .handler(({ data }): Promise<PodReportResponse> =>
    apiOrpcClient(publicPodTournamentsContract).startGroupRound(data),
  );

const submitReportResultFn = createServerFn({ method: "POST" })
  .validator((input: { token: string; podId: string; results: PodResultEntry[] }) => input)
  .handler(({ data }): Promise<PodReportResponse> =>
    apiOrpcClient(publicPodTournamentsContract).submitResult({
      token: data.token,
      podId: data.podId,
      results: data.results,
    }),
  );

/**
 * Shared invalidation for the pod round mutations: drops the pod run-state cache
 * and the unified list/detail (a round writes `current_round`/`status`/`hasRounds`).
 * @returns A mutation wired with the round invalidation set.
 */
function useRunMutation<TVariables extends { id: string }>(
  mutationFn: (variables: TVariables) => Promise<PodTournamentDetailResponse>,
) {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<PodTournamentDetailResponse, TVariables>({
    mutationFn,
    invalidates: (variables) => podRoundMutationInvalidationKeys(userId, variables.id),
  });
}

export function useGenerateTournamentRound() {
  return useRunMutation<{ id: string; byes?: string[] }>((data) =>
    generateRoundFn({ data: { id: data.id, byes: data.byes ?? [] } }),
  );
}

export function useStartGroupRound() {
  return useRunMutation<{ id: string; groupId: string }>((data) => startGroupRoundFn({ data }));
}

export function useStartGroupStageRound() {
  return useRunMutation<{ id: string }>((data) => startGroupStageRoundFn({ data }));
}

export function useSetLegendMetaShares() {
  return useRunMutation<{ id: string; shares: LegendMetaShareInput[] }>((data) =>
    setLegendMetaSharesFn({ data }),
  );
}

export function useReplaceTournamentPairing() {
  return useRunMutation<{
    id: string;
    roundNumber: number;
    pods: PairingPodInput[];
    byes: string[];
  }>((data) => replacePairingFn({ data }));
}

export function useRerollTournamentRound() {
  return useRunMutation<{ id: string; roundNumber: number }>((data) => rerollRoundFn({ data }));
}

export function useFinalizeTournamentRound() {
  return useRunMutation<{ id: string; roundNumber: number }>((data) => finalizeRoundFn({ data }));
}

export function useSubmitTournamentResult() {
  return useRunMutation<{ id: string; podId: string; results: PodResultEntry[] }>((data) =>
    submitResultFn({ data }),
  );
}

export function useSetTournamentReportToken() {
  // Returns the unified detail (reportToken lives there); invalidate list + detail.
  return useTournamentDetailMutation<{ id: string; enabled: boolean }, TournamentDetailResponse>(
    (data) => setReportTokenFn({ data }),
  );
}

export function useSetTournamentFollowToken() {
  // Returns the unified detail (followToken lives there); invalidate list + detail.
  return useTournamentDetailMutation<{ id: string; enabled: boolean }, TournamentDetailResponse>(
    (data) => setFollowTokenFn({ data }),
  );
}

export function useSubmitTournamentReportPlayerResult(token: string) {
  return useMutationWithInvalidation<
    PodReportResponse,
    { podId: string; playerId: string; gamePoints: number }
  >({
    mutationFn: (data) => submitReportPlayerResultFn({ data: { token, ...data } }),
    invalidates: () => [podTournamentsKeys.report(token)],
  });
}

export function useStartReportGroupRound(token: string) {
  return useMutationWithInvalidation<PodReportResponse, { groupId: string }>({
    mutationFn: (data) => startReportGroupRoundFn({ data: { token, ...data } }),
    invalidates: () => [podTournamentsKeys.report(token)],
  });
}

export function useSubmitTournamentReportResult(token: string) {
  return useMutationWithInvalidation<
    PodReportResponse,
    { podId: string; results: PodResultEntry[] }
  >({
    mutationFn: (data) => submitReportResultFn({ data: { token, ...data } }),
    invalidates: () => [podTournamentsKeys.report(token)],
  });
}
