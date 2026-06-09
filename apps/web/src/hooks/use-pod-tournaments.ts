import type {
  PodReportResponse,
  PodScoringScheme,
  PodTournamentDetailResponse,
  PodTournamentListResponse,
  PodTournamentResponse,
} from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface Placement {
  playerId: string;
  placement: number;
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
      callApiJson(
        serverApiClient(context.cookie).api.v1["pod-tournaments"].$get(),
        "Couldn't load tournaments",
      ),
  );

const fetchTournamentDetail = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: id }): Promise<PodTournamentDetailResponse> => {
    const res = await callApi(
      serverApiClient(context.cookie).api.v1["pod-tournaments"][":id"].$get({
        param: encodeParams({ id }),
      }),
      "Couldn't load tournament",
      [404],
    );
    if ((res.status as number) === 404) {
      throw new Error("NOT_FOUND");
    }
    return res.json() as Promise<PodTournamentDetailResponse>;
  });

const fetchReport = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .handler(async ({ data: token }): Promise<PodReportResponse> => {
    const res = await callApi(
      serverApiClient().api.v1["pod-tournaments"].report[":token"].$get({
        param: encodeParams({ token }),
      }),
      "Couldn't load tournament",
      [404],
    );
    if ((res.status as number) === 404) {
      throw new Error("NOT_FOUND");
    }
    return res.json() as Promise<PodReportResponse>;
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
      callApiJson(
        serverApiClient(context.cookie).api.v1["pod-tournaments"].$post({ json: data }),
        "Couldn't create tournament",
      ),
  );

const updateTournamentFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      id: string;
      name?: string;
      status?: "running" | "completed";
      scoringScheme?: PodScoringScheme;
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<PodTournamentDetailResponse> => {
    const { id, ...fields } = data;
    return callApiJson(
      serverApiClient(context.cookie).api.v1["pod-tournaments"][":id"].$patch({
        param: encodeParams({ id }),
        json: fields,
      }),
      "Couldn't update tournament",
    );
  });

const deleteTournamentFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: id }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1["pod-tournaments"][":id"].$delete({
        param: encodeParams({ id }),
      }),
      "Couldn't delete tournament",
    );
  });

const addPlayerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; displayName: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["pod-tournaments"][":id"].players.$post({
          param: encodeParams({ id: data.id }),
          json: { displayName: data.displayName },
        }),
        "Couldn't add player",
      ),
  );

const renamePlayerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; playerId: string; displayName: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["pod-tournaments"][":id"].players[
          ":playerId"
        ].$patch({
          param: encodeParams({ id: data.id, playerId: data.playerId }),
          json: { displayName: data.displayName },
        }),
        "Couldn't rename player",
      ),
  );

const dropPlayerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; playerId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["pod-tournaments"][":id"].players[
          ":playerId"
        ].drop.$post({
          param: encodeParams({ id: data.id, playerId: data.playerId }),
        }),
        "Couldn't drop player",
      ),
  );

const reactivatePlayerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; playerId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["pod-tournaments"][":id"].players[
          ":playerId"
        ].reactivate.$post({
          param: encodeParams({ id: data.id, playerId: data.playerId }),
        }),
        "Couldn't reactivate player",
      ),
  );

const removePlayerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; playerId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["pod-tournaments"][":id"].players[
          ":playerId"
        ].$delete({
          param: encodeParams({ id: data.id, playerId: data.playerId }),
        }),
        "Couldn't remove player",
      ),
  );

const generateRoundFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; byes: string[] }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["pod-tournaments"][":id"].rounds.$post({
          param: encodeParams({ id: data.id }),
          json: { byes: data.byes },
        }),
        "Couldn't generate round",
      ),
  );

const replacePairingFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; roundNumber: number; pods: PairingPodInput[]; byes: string[] }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["pod-tournaments"][":id"].rounds[
          ":roundNumber"
        ].pairing.$put({
          param: encodeParams({ id: data.id, roundNumber: String(data.roundNumber) }),
          json: { pods: data.pods, byes: data.byes },
        }),
        "Couldn't save pairing",
      ),
  );

const rerollRoundFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; roundNumber: number }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["pod-tournaments"][":id"].rounds[
          ":roundNumber"
        ].reroll.$post({
          param: encodeParams({ id: data.id, roundNumber: String(data.roundNumber) }),
        }),
        "Couldn't re-roll round",
      ),
  );

const finalizeRoundFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; roundNumber: number }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["pod-tournaments"][":id"].rounds[
          ":roundNumber"
        ].finalize.$post({
          param: encodeParams({ id: data.id, roundNumber: String(data.roundNumber) }),
        }),
        "Couldn't finalize round",
      ),
  );

const submitResultFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; podId: string; placements: Placement[] }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["pod-tournaments"][":id"].pods[":podId"].result.$put(
          {
            param: encodeParams({ id: data.id, podId: data.podId }),
            json: { placements: data.placements },
          },
        ),
        "Couldn't save result",
      ),
  );

const setReportTokenFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; enabled: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<PodTournamentDetailResponse> => {
    const endpoint = serverApiClient(context.cookie).api.v1["pod-tournaments"][":id"][
      "report-token"
    ];
    const param = encodeParams({ id: data.id });
    return callApiJson(
      data.enabled ? endpoint.$post({ param }) : endpoint.$delete({ param }),
      "Couldn't update report link",
    );
  });

const submitReportResultFn = createServerFn({ method: "POST" })
  .validator((input: { token: string; podId: string; placements: Placement[] }) => input)
  .handler(
    ({ data }): Promise<PodReportResponse> =>
      callApiJson(
        serverApiClient().api.v1["pod-tournaments"].report[":token"].pods[":podId"].result.$put({
          param: encodeParams({ token: data.token, podId: data.podId }),
          json: { placements: data.placements },
        }),
        "Couldn't save result",
      ),
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
  return useIdMutation<{ id: string; podId: string; placements: Placement[] }>((data) =>
    submitResultFn({ data }),
  );
}

export function useSetPodReportToken() {
  return useIdMutation<{ id: string; enabled: boolean }>((data) => setReportTokenFn({ data }));
}

export function useSubmitReportResult(token: string) {
  return useMutationWithInvalidation<PodReportResponse, { podId: string; placements: Placement[] }>(
    {
      mutationFn: (data) => submitReportResultFn({ data: { token, ...data } }),
      invalidates: () => [queryKeys.podTournaments.report(token)],
    },
  );
}
