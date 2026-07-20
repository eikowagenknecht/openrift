import type {
  PodReportResponse,
  PodTournamentDetailResponse,
  PublicTournamentJoinResponse,
  PublicTournamentLandingResponse,
  TournamentDeckSubmission,
  TournamentDetailResponse,
  TournamentListLockMode,
  TournamentListResponse,
  TournamentMatchFormat,
  TournamentPairingStyle,
  TournamentParticipantListResponse,
  TournamentStaffCandidateListResponse,
  TournamentStaffInviteLandingResponse,
  TournamentStaffRole,
  TournamentStatus,
} from "@openrift/shared";
import {
  publicPodTournamentsContract,
  publicTournamentsContract,
  tournamentsContract,
} from "@openrift/shared/contracts";
import { isDefinedError, safe } from "@orpc/client";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { openRoundRefetchInterval } from "@/lib/open-round-polling";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import {
  participantMutationInvalidationKeys,
  podRoundMutationInvalidationKeys,
} from "@/lib/tournament-invalidation";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface CreateTournamentInput {
  name: string;
  host: { type: "user" } | { type: "organization"; orgId: string };
  pairingStyle: TournamentPairingStyle;
  matchFormat?: TournamentMatchFormat;
  winPoints?: number;
  drawPoints?: number;
  byePoints?: number;
  regionsEnabled?: boolean;
  deckSubmission: TournamentDeckSubmission;
  selfRegistration?: boolean;
  submissionsCloseAt?: string | null;
  listLockMode?: TournamentListLockMode;
  deckFormat?: string | null;
  allowedSets?: string[] | null;
  groupId?: string | null;
  startsAt: string;
  endsAt?: string | null;
}

interface UpdateTournamentInput {
  id: string;
  name?: string;
  status?: TournamentStatus;
  host?: { type: "user" } | { type: "organization"; orgId: string };
  pairingStyle?: TournamentPairingStyle;
  startsAt?: string;
  endsAt?: string | null;
  scoringScheme?: "standard" | "three_pod_reduced";
  byePoints?: number;
  matchFormat?: TournamentMatchFormat;
  winPoints?: number;
  drawPoints?: number;
  regionsEnabled?: boolean;
  deckSubmission?: TournamentDeckSubmission;
  submissionsCloseAt?: string | null;
  listLockMode?: TournamentListLockMode;
  deckFormat?: string | null;
  allowedSets?: string[] | null;
  selfRegistration?: boolean;
  groupId?: string | null;
}

// ── Server functions: queries ────────────────────────────────────────────────

const fetchTournaments = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<TournamentListResponse> =>
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
  .handler(
    ({ context, data: slug }): Promise<TournamentListResponse> =>
      apiOrpcClient(tournamentsContract, context.cookie).listForGroup({ slug }),
  );

const fetchParticipants = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: id }): Promise<TournamentParticipantListResponse> => {
    // Map the deleted-tournament 404 to the sentinel like the other fetchers,
    // so a stale tab polling a gone tournament doesn't spam Sentry with raw
    // ORPCErrors (OPENRIFT-SSR-1K).
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

const claimStaffInviteFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: token }) =>
    apiOrpcClient(publicTournamentsContract, context.cookie).claimStaffInvite({ token }),
  );

// ── Query options + hooks ────────────────────────────────────────────────────

export function tournamentsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.tournaments.all(userId),
    queryFn: () => fetchTournaments(),
  });
}

export function tournamentDetailQueryOptions(userId: string, id: string) {
  return queryOptions({
    queryKey: queryKeys.tournaments.detail(userId, id),
    queryFn: () => fetchTournamentDetail({ data: id }),
  });
}

export function groupTournamentsQueryOptions(userId: string, slug: string) {
  return queryOptions({
    queryKey: queryKeys.tournaments.forGroup(userId, slug),
    queryFn: () => fetchGroupTournaments({ data: slug }),
  });
}

export function tournamentParticipantsQueryOptions(userId: string, id: string) {
  return queryOptions({
    queryKey: queryKeys.tournaments.participants(userId, id),
    queryFn: () => fetchParticipants({ data: id }),
  });
}

export function tournamentSubmitLandingQueryOptions(token: string) {
  return queryOptions({
    queryKey: queryKeys.tournaments.submitLanding(token),
    queryFn: () => fetchSubmitLanding({ data: token }),
  });
}

function tournamentStaffCandidatesQueryOptions(userId: string, id: string) {
  return queryOptions({
    queryKey: queryKeys.tournaments.staffCandidates(userId, id),
    queryFn: () => fetchStaffCandidates({ data: id }),
  });
}

export function tournamentStaffInviteLandingQueryOptions(token: string) {
  return queryOptions({
    queryKey: queryKeys.tournaments.staffInviteLanding(token),
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

// ── Server functions: mutations ──────────────────────────────────────────────

const createTournamentFn = createServerFn({ method: "POST" })
  .validator((input: CreateTournamentInput) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<TournamentDetailResponse> =>
      apiOrpcClient(tournamentsContract, context.cookie).create(data),
  );

const updateTournamentFn = createServerFn({ method: "POST" })
  .validator((input: UpdateTournamentInput) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<TournamentDetailResponse> =>
      apiOrpcClient(tournamentsContract, context.cookie).update(data),
  );

const cancelTournamentFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: id }): Promise<TournamentDetailResponse> =>
      apiOrpcClient(tournamentsContract, context.cookie).cancel({ id }),
  );

const deleteTournamentFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: id }) => {
    await apiOrpcClient(tournamentsContract, context.cookie).remove({ id });
  });

const setSubmissionTokenFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; enabled: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<TournamentDetailResponse> => {
    const client = apiOrpcClient(tournamentsContract, context.cookie);
    return data.enabled
      ? client.enableSubmissionToken({ id: data.id })
      : client.disableSubmissionToken({ id: data.id });
  });

// Staff

const addStaffFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; userId: string; role: TournamentStaffRole }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(tournamentsContract, context.cookie).addStaff(data),
  );

const setStaffInviteFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; role: TournamentStaffRole; enabled: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<TournamentDetailResponse> => {
    const client = apiOrpcClient(tournamentsContract, context.cookie);
    return data.enabled
      ? client.enableStaffInvite({ id: data.id, role: data.role })
      : client.disableStaffInvite({ id: data.id, role: data.role });
  });

const removeStaffFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; userId: string; role: TournamentStaffRole }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(tournamentsContract, context.cookie).removeStaff(data),
  );

// Participants

const addParticipantFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; displayName: string; region?: string | null }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<TournamentParticipantListResponse> =>
      apiOrpcClient(tournamentsContract, context.cookie).addParticipant(data),
  );

const updateParticipantFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      id: string;
      participantId: string;
      displayName?: string;
      seed?: number | null;
      region?: string | null;
      fixedTable?: number | null;
    }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<TournamentParticipantListResponse> =>
      apiOrpcClient(tournamentsContract, context.cookie).updateParticipant(data),
  );

const participantActionFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      id: string;
      participantId: string;
      action: "drop" | "reactivate" | "approve" | "deny" | "remove" | "unlink" | "reissue";
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<TournamentParticipantListResponse> => {
    const client = apiOrpcClient(tournamentsContract, context.cookie);
    const params = { id: data.id, participantId: data.participantId };
    switch (data.action) {
      case "drop": {
        return client.dropParticipant(params);
      }
      case "reactivate": {
        return client.reactivateParticipant(params);
      }
      case "approve": {
        return client.approveParticipant(params);
      }
      case "deny": {
        return client.denyParticipant(params);
      }
      case "remove": {
        return client.removeParticipant(params);
      }
      case "unlink": {
        return client.unlinkParticipant(params);
      }
      case "reissue": {
        return client.reissueClaim(params);
      }
    }
  });

const requestJoinFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: token }): Promise<PublicTournamentJoinResponse> =>
      apiOrpcClient(publicTournamentsContract, context.cookie).requestJoin({ token }),
  );

// ── Mutation hooks ───────────────────────────────────────────────────────────

export function useCreateTournament() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<TournamentDetailResponse, CreateTournamentInput>({
    mutationFn: (data) => createTournamentFn({ data }),
    invalidates: () => [queryKeys.tournaments.all(userId)],
  });
}

/**
 * Invalidates the tournament list and an id's detail after an id-scoped change.
 * @returns A mutation wired with the shared invalidation set.
 */
function useTournamentDetailMutation<TVariables extends { id: string }, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<TData, TVariables>({
    mutationFn,
    invalidates: (variables) => [
      queryKeys.tournaments.all(userId),
      queryKeys.tournaments.detail(userId, variables.id),
    ],
  });
}

/**
 * Invalidates the list, the detail, the roster, and the pod pairings/standings
 * after a participant change.
 * @returns A mutation wired with the participant invalidation set.
 */
function useParticipantMutation<TVariables extends { id: string }>(
  mutationFn: (variables: TVariables) => Promise<TournamentParticipantListResponse>,
) {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<TournamentParticipantListResponse, TVariables>({
    mutationFn,
    invalidates: (variables) => participantMutationInvalidationKeys(userId, variables.id),
  });
}

export function useUpdateTournament() {
  return useTournamentDetailMutation<UpdateTournamentInput, TournamentDetailResponse>((data) =>
    updateTournamentFn({ data }),
  );
}

export function useCancelTournament() {
  return useTournamentDetailMutation<{ id: string }, TournamentDetailResponse>((data) =>
    cancelTournamentFn({ data: data.id }),
  );
}

export function useDeleteTournament() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (id: string) => deleteTournamentFn({ data: id }),
    invalidates: () => [queryKeys.tournaments.all(userId)],
  });
}

export function useSetTournamentSubmissionToken() {
  return useTournamentDetailMutation<{ id: string; enabled: boolean }, TournamentDetailResponse>(
    (data) => setSubmissionTokenFn({ data }),
  );
}

export function useAddTournamentStaff() {
  return useTournamentDetailMutation<
    { id: string; userId: string; role: TournamentStaffRole },
    unknown
  >((data) => addStaffFn({ data }));
}

export function useSetTournamentStaffInvite() {
  return useTournamentDetailMutation<
    { id: string; role: TournamentStaffRole; enabled: boolean },
    TournamentDetailResponse
  >((data) => setStaffInviteFn({ data }));
}

export function useRemoveTournamentStaff() {
  return useTournamentDetailMutation<
    { id: string; userId: string; role: TournamentStaffRole },
    unknown
  >((data) => removeStaffFn({ data }));
}

export function useAddParticipant() {
  return useParticipantMutation<{ id: string; displayName: string; region?: string | null }>(
    (data) => addParticipantFn({ data }),
  );
}

export function useUpdateParticipant() {
  return useParticipantMutation<{
    id: string;
    participantId: string;
    displayName?: string;
    seed?: number | null;
    region?: string | null;
    fixedTable?: number | null;
  }>((data) => updateParticipantFn({ data }));
}

export function useParticipantAction() {
  return useParticipantMutation<{
    id: string;
    participantId: string;
    action: "drop" | "reactivate" | "approve" | "deny" | "remove" | "unlink" | "reissue";
  }>((data) => participantActionFn({ data }));
}

export function useRequestJoinTournament() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<PublicTournamentJoinResponse, { token: string }>({
    mutationFn: (data) => requestJoinFn({ data: data.token }),
    invalidates: () => [queryKeys.tournaments.all(userId)],
  });
}

export function useClaimStaffInvite() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (token: string) => claimStaffInviteFn({ data: token }),
    invalidates: (_token, result) => [
      queryKeys.tournaments.all(userId),
      ...(result ? [queryKeys.tournaments.detail(userId, result.tournamentId)] : []),
    ],
  });
}

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
    queryKey: queryKeys.podTournaments.detail(userId, id),
    queryFn: () => fetchRunState({ data: id }),
    refetchInterval: (query) => openRoundRefetchInterval(query.state.data),
  });
}

export function tournamentReportQueryOptions(token: string) {
  return queryOptions({
    queryKey: queryKeys.podTournaments.report(token),
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
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      apiOrpcClient(tournamentsContract, context.cookie).generateRound(data),
  );

const replacePairingFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; roundNumber: number; pods: PairingPodInput[]; byes: string[] }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      apiOrpcClient(tournamentsContract, context.cookie).replacePairing(data),
  );

const rerollRoundFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; roundNumber: number }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      apiOrpcClient(tournamentsContract, context.cookie).rerollRound(data),
  );

const finalizeRoundFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; roundNumber: number }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
      apiOrpcClient(tournamentsContract, context.cookie).finalizeRound(data),
  );

const submitResultFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; podId: string; results: PodResultEntry[] }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PodTournamentDetailResponse> =>
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
  .handler(
    ({ data }): Promise<PodReportResponse> =>
      apiOrpcClient(publicPodTournamentsContract).submitPlayerResult(data),
  );

const submitReportResultFn = createServerFn({ method: "POST" })
  .validator((input: { token: string; podId: string; results: PodResultEntry[] }) => input)
  .handler(
    ({ data }): Promise<PodReportResponse> =>
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
    invalidates: () => [queryKeys.podTournaments.report(token)],
  });
}

export function useSubmitTournamentReportResult(token: string) {
  return useMutationWithInvalidation<
    PodReportResponse,
    { podId: string; results: PodResultEntry[] }
  >({
    mutationFn: (data) => submitReportResultFn({ data: { token, ...data } }),
    invalidates: () => [queryKeys.podTournaments.report(token)],
  });
}
