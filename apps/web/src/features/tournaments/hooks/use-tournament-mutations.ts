import { publicTournamentsContract } from "@openrift/shared/contracts/public-tournaments";
import { tournamentsContract } from "@openrift/shared/contracts/tournaments";
import type {
  PublicTournamentJoinResponse,
  TournamentDetailResponse,
  TournamentParticipantListResponse,
  TournamentStaffRole,
} from "@openrift/shared/types/api/tournament";
import { createServerFn } from "@tanstack/react-start";

import { participantMutationInvalidationKeys } from "@/features/tournaments/lib/tournament-invalidation";
import { tournamentsKeys } from "@/features/tournaments/lib/tournaments-query-keys";
import { useRequiredUserId, useUserId } from "@/lib/auth-session";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

type CreateTournamentInput = ContractInput<typeof tournamentsContract, "create">;
type UpdateTournamentInput = ContractInput<typeof tournamentsContract, "update">;

// ── Server functions: mutations ──────────────────────────────────────────────

const createTournamentFn = createServerFn({ method: "POST" })
  .validator((input: CreateTournamentInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<TournamentDetailResponse> =>
    apiOrpcClient(tournamentsContract, context.cookie).create(data),
  );

const updateTournamentFn = createServerFn({ method: "POST" })
  .validator((input: UpdateTournamentInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<TournamentDetailResponse> =>
    apiOrpcClient(tournamentsContract, context.cookie).update(data),
  );

const cancelTournamentFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: id }): Promise<TournamentDetailResponse> =>
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
  .handler(({ context, data }): Promise<TournamentParticipantListResponse> =>
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
      legendCardId?: string | null;
      fixedTable?: number | null;
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<TournamentParticipantListResponse> =>
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

// Teams (2v2 play mode). Membership rides on the participant rows, so both
// mutations answer with (and invalidate as) the participant list.

const createTeamFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; participantIds: string[] }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<TournamentParticipantListResponse> =>
    apiOrpcClient(tournamentsContract, context.cookie).createTeam(data),
  );

const dissolveTeamFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; teamId: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<TournamentParticipantListResponse> =>
    apiOrpcClient(tournamentsContract, context.cookie).dissolveTeam(data),
  );

const requestJoinFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: token }): Promise<PublicTournamentJoinResponse> =>
    apiOrpcClient(publicTournamentsContract, context.cookie).requestJoin({ token }),
  );

const claimStaffInviteFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: token }) =>
    apiOrpcClient(publicTournamentsContract, context.cookie).claimStaffInvite({ token }),
  );

// ── Mutation hooks ───────────────────────────────────────────────────────────

export function useCreateTournament() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<TournamentDetailResponse, CreateTournamentInput>({
    mutationFn: (data) => createTournamentFn({ data }),
    invalidates: () => [tournamentsKeys.all(userId)],
  });
}

/**
 * Invalidates the tournament list and an id's detail after an id-scoped change.
 * @returns A mutation wired with the shared invalidation set.
 */
export function useTournamentDetailMutation<TVariables extends { id: string }, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<TData, TVariables>({
    mutationFn,
    invalidates: (variables) => [
      tournamentsKeys.all(userId),
      tournamentsKeys.detail(userId, variables.id),
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
    invalidates: () => [tournamentsKeys.all(userId)],
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
    legendCardId?: string | null;
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

export function useCreateTeam() {
  return useParticipantMutation<{ id: string; participantIds: string[] }>((data) =>
    createTeamFn({ data }),
  );
}

export function useDissolveTeam() {
  return useParticipantMutation<{ id: string; teamId: string }>((data) => dissolveTeamFn({ data }));
}

// The two landing pages these drive sit outside `_authenticated`, so both hooks
// render for signed-out visitors and must not require a session. The user id is
// only an invalidation key here; the mutations themselves are rejected by the
// API without one.
export function useRequestJoinTournament() {
  const userId = useUserId();
  return useMutationWithInvalidation<PublicTournamentJoinResponse, { token: string }>({
    mutationFn: (data) => requestJoinFn({ data: data.token }),
    invalidates: () => (userId ? [tournamentsKeys.all(userId)] : []),
  });
}

export function useClaimStaffInvite() {
  const userId = useUserId();
  return useMutationWithInvalidation({
    mutationFn: (token: string) => claimStaffInviteFn({ data: token }),
    invalidates: (_token, result) => {
      if (!userId) {
        return [];
      }
      return [
        tournamentsKeys.all(userId),
        ...(result ? [tournamentsKeys.detail(userId, result.tournamentId)] : []),
      ];
    },
  });
}
