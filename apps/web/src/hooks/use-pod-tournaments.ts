import type {
  PodReportResponse,
  PodScoringScheme,
  PodTournamentDetailResponse,
  PodTournamentListResponse,
  PodTournamentResponse,
} from "@openrift/shared";
import { podTournamentsContract, publicPodTournamentsContract } from "@openrift/shared/contracts";
import { ORPCError } from "@orpc/client";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface PodResultEntry {
  playerId: string;
  gamePoints: number;
}

interface PairingPodInput {
  size: 3 | 4;
  playerIds: string[];
}

// ── Server functions: queries ────────────────────────────────────────────────

const fetchTournaments = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<PodTournamentListResponse> =>
      apiOrpcClient(podTournamentsContract, context.cookie).list(),
  );

const fetchTournamentDetail = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: id }): Promise<PodTournamentDetailResponse> => {
    // 404 (unknown tournament) is a typed NOT_FOUND mapped to the sentinel the
    // route boundary expects; 403 (non-owner) propagates as a normal error.
    try {
      return await apiOrpcClient(podTournamentsContract, context.cookie).get({ id });
    } catch (error) {
      if (error instanceof ORPCError && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
  });

const fetchReport = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .handler(async ({ data: token }): Promise<PodReportResponse> => {
    // Migrated to oRPC: 404 (disabled/rotated token) is a typed NOT_FOUND error
    // mapped to the sentinel the route boundary expects.
    try {
      return await apiOrpcClient(publicPodTournamentsContract).report({ token });
    } catch (error) {
      if (error instanceof ORPCError && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
  });

// ── Query options + hooks ────────────────────────────────────────────────────

export function podTournamentsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.podTournaments.all(userId),
    queryFn: () => fetchTournaments(),
  });
}

export function podTournamentDetailQueryOptions(userId: string, id: string) {
  return queryOptions({
    queryKey: queryKeys.podTournaments.detail(userId, id),
    queryFn: () => fetchTournamentDetail({ data: id }),
  });
}

export function podTournamentReportQueryOptions(token: string) {
  return queryOptions({
    queryKey: queryKeys.podTournaments.report(token),
    queryFn: () => fetchReport({ data: token }),
  });
}

export function usePodTournaments() {
  const userId = useRequiredUserId();
  return useSuspenseQuery(podTournamentsQueryOptions(userId));
}

export function usePodTournamentDetail(id: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(podTournamentDetailQueryOptions(userId, id));
}

export function usePodTournamentReport(token: string) {
  return useSuspenseQuery(podTournamentReportQueryOptions(token));
}

// ── Server functions: mutations ──────────────────────────────────────────────

const createTournamentFn = createServerFn({ method: "POST" })
  .validator((input: { name: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentResponse> =>
      apiOrpcClient(podTournamentsContract, context.cookie).create(data),
  );

const updateTournamentFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      id: string;
      name?: string;
      status?: "running" | "completed";
      scoringScheme?: PodScoringScheme;
      byePoints?: number;
    }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      apiOrpcClient(podTournamentsContract, context.cookie).update(data),
  );

const deleteTournamentFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: id }) => {
    await apiOrpcClient(podTournamentsContract, context.cookie).remove({ id });
  });

const addPlayerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; displayName: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      apiOrpcClient(podTournamentsContract, context.cookie).addPlayer(data),
  );

const renamePlayerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; playerId: string; displayName: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      apiOrpcClient(podTournamentsContract, context.cookie).renamePlayer(data),
  );

const dropPlayerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; playerId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      apiOrpcClient(podTournamentsContract, context.cookie).dropPlayer(data),
  );

const reactivatePlayerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; playerId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      apiOrpcClient(podTournamentsContract, context.cookie).reactivatePlayer(data),
  );

const removePlayerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; playerId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      apiOrpcClient(podTournamentsContract, context.cookie).removePlayer(data),
  );

const generateRoundFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; byes: string[] }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      apiOrpcClient(podTournamentsContract, context.cookie).generateRound(data),
  );

const replacePairingFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; roundNumber: number; pods: PairingPodInput[]; byes: string[] }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      apiOrpcClient(podTournamentsContract, context.cookie).replacePairing(data),
  );

const rerollRoundFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; roundNumber: number }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      apiOrpcClient(podTournamentsContract, context.cookie).rerollRound(data),
  );

const finalizeRoundFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; roundNumber: number }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      apiOrpcClient(podTournamentsContract, context.cookie).finalizeRound(data),
  );

const submitResultFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; podId: string; results: PodResultEntry[] }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      apiOrpcClient(podTournamentsContract, context.cookie).submitResult(data),
  );

const setReportTokenFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; enabled: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<PodTournamentDetailResponse> => {
    const client = apiOrpcClient(podTournamentsContract, context.cookie);
    return data.enabled
      ? client.enableReportToken({ id: data.id })
      : client.disableReportToken({ id: data.id });
  });

const submitReportResultFn = createServerFn({ method: "POST" })
  .validator((input: { token: string; podId: string; results: PodResultEntry[] }) => input)
  .handler(
    // Migrated to oRPC: token + podId become path params, results the body.
    ({ data }): Promise<PodReportResponse> =>
      apiOrpcClient(publicPodTournamentsContract).submitResult({
        token: data.token,
        podId: data.podId,
        results: data.results,
      }),
  );

// ── Mutation hooks ───────────────────────────────────────────────────────────

export function useCreatePodTournament() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<PodTournamentResponse, { name: string }>({
    mutationFn: (data) => createTournamentFn({ data }),
    invalidates: () => [queryKeys.podTournaments.all(userId)],
  });
}

export function useUpdatePodTournament() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    PodTournamentDetailResponse,
    {
      id: string;
      name?: string;
      status?: "running" | "completed";
      scoringScheme?: PodScoringScheme;
      byePoints?: number;
    }
  >({
    mutationFn: (data) => updateTournamentFn({ data }),
    invalidates: (variables) => [
      queryKeys.podTournaments.all(userId),
      queryKeys.podTournaments.detail(userId, variables.id),
    ],
  });
}

export function useDeletePodTournament() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (id: string) => deleteTournamentFn({ data: id }),
    invalidates: () => [queryKeys.podTournaments.all(userId)],
  });
}

/**
 * Shared invalidation for the id-scoped owner mutations (list + that detail).
 * @returns A mutation that invalidates the tournament list and the id's detail.
 */
function useIdMutation<TVariables extends { id: string }>(
  mutationFn: (variables: TVariables) => Promise<PodTournamentDetailResponse>,
) {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<PodTournamentDetailResponse, TVariables>({
    mutationFn,
    invalidates: (variables) => [
      queryKeys.podTournaments.all(userId),
      queryKeys.podTournaments.detail(userId, variables.id),
    ],
  });
}

export function useAddPodPlayer() {
  return useIdMutation<{ id: string; displayName: string }>((data) => addPlayerFn({ data }));
}

export function useRenamePodPlayer() {
  return useIdMutation<{ id: string; playerId: string; displayName: string }>((data) =>
    renamePlayerFn({ data }),
  );
}

export function useDropPodPlayer() {
  return useIdMutation<{ id: string; playerId: string }>((data) => dropPlayerFn({ data }));
}

export function useReactivatePodPlayer() {
  return useIdMutation<{ id: string; playerId: string }>((data) => reactivatePlayerFn({ data }));
}

export function useRemovePodPlayer() {
  return useIdMutation<{ id: string; playerId: string }>((data) => removePlayerFn({ data }));
}

export function useGeneratePodRound() {
  return useIdMutation<{ id: string; byes?: string[] }>((data) =>
    generateRoundFn({ data: { id: data.id, byes: data.byes ?? [] } }),
  );
}

export function useReplacePodPairing() {
  return useIdMutation<{
    id: string;
    roundNumber: number;
    pods: PairingPodInput[];
    byes: string[];
  }>((data) => replacePairingFn({ data }));
}

export function useRerollPodRound() {
  return useIdMutation<{ id: string; roundNumber: number }>((data) => rerollRoundFn({ data }));
}

export function useFinalizePodRound() {
  return useIdMutation<{ id: string; roundNumber: number }>((data) => finalizeRoundFn({ data }));
}

export function useSubmitPodResult() {
  return useIdMutation<{ id: string; podId: string; results: PodResultEntry[] }>((data) =>
    submitResultFn({ data }),
  );
}

export function useSetPodReportToken() {
  return useIdMutation<{ id: string; enabled: boolean }>((data) => setReportTokenFn({ data }));
}

export function useSubmitReportResult(token: string) {
  return useMutationWithInvalidation<
    PodReportResponse,
    { podId: string; results: PodResultEntry[] }
  >({
    mutationFn: (data) => submitReportResultFn({ data: { token, ...data } }),
    invalidates: () => [queryKeys.podTournaments.report(token)],
  });
}
