import type { DeckCheckEntryDetailResponse, DeckCheckEventDetailResponse } from "@openrift/shared";
import { tournamentDeckCheckContract } from "@openrift/shared/contracts/tournament-deck-check";
import { isDefinedError, safe } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { deckCheckEntryInvalidationKeys } from "@/lib/tournament-invalidation";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const POLL_INTERVAL_MS = 5000;

const fetchEntries = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: tournamentId }): Promise<DeckCheckEventDetailResponse> => {
    // Map the 404 (deleted tournament, or deck submission disabled) to the Sentry-ignored sentinel.
    const { error, data } = await safe(
      apiOrpcClient(tournamentDeckCheckContract, context.cookie).listEntries({ tournamentId }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

const fetchEntry = createServerFn({ method: "GET" })
  .validator((input: { tournamentId: string; entryId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<DeckCheckEntryDetailResponse> => {
    const { error, data: entry } = await safe(
      apiOrpcClient(tournamentDeckCheckContract, context.cookie).getEntry(data),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return entry;
  });

// `enabled: false` skips the query for viewers who can't read deck-check; the endpoint
// is staff-only and 403s participants otherwise.
export function useTournamentDeckCheckEntries(tournamentId: string, enabled = true) {
  const userId = useRequiredUserId();
  return useQuery({
    queryKey: queryKeys.tournamentDeckCheck.entries(userId, tournamentId),
    queryFn: () => fetchEntries({ data: tournamentId }),
    enabled,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
}

export function useTournamentDeckCheckEntry(tournamentId: string, entryId: string) {
  const userId = useRequiredUserId();
  return useQuery({
    queryKey: queryKeys.tournamentDeckCheck.entry(userId, tournamentId, entryId),
    queryFn: () => fetchEntry({ data: { tournamentId, entryId } }),
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
}

const createEntryFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      tournamentId: string;
      participantId: string;
      cards: { name: string; quantity: number; section: string }[];
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
    apiOrpcClient(tournamentDeckCheckContract, context.cookie).createEntry(data),
  );

const setEntryStateFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      tournamentId: string;
      entryId: string;
      state: "editable" | "submitted" | "approved" | "checked" | "withdrawn";
      reviewOutcome?: "ok" | "issue" | null;
      notes?: string | null;
      playerMessage?: string | null;
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
    apiOrpcClient(tournamentDeckCheckContract, context.cookie).setEntryState(data),
  );

const denyUnlockRequestFn = createServerFn({ method: "POST" })
  .validator((input: { tournamentId: string; entryId: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
    apiOrpcClient(tournamentDeckCheckContract, context.cookie).denyUnlockRequest(data),
  );

const updateEntryFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      tournamentId: string;
      entryId: string;
      playerName?: string;
      riotId?: string | null;
      playerMessage?: string | null;
      allowDeckPublishing?: boolean;
      allowNameSharing?: boolean;
      allowRiotIdSharing?: boolean;
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
    apiOrpcClient(tournamentDeckCheckContract, context.cookie).updateEntry(data),
  );

const deleteEntryFn = createServerFn({ method: "POST" })
  .validator((input: { tournamentId: string; entryId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(tournamentDeckCheckContract, context.cookie).deleteEntry(data);
  });

const unlinkEntryFn = createServerFn({ method: "POST" })
  .validator((input: { tournamentId: string; entryId: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
    apiOrpcClient(tournamentDeckCheckContract, context.cookie).unlinkEntry(data),
  );

const reResolveFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: tournamentId }): Promise<{ updatedLines: number }> =>
    apiOrpcClient(tournamentDeckCheckContract, context.cookie).reResolve({ tournamentId }),
  );

const addCardFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      tournamentId: string;
      entryId: string;
      name: string;
      quantity: number;
      section: string;
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
    apiOrpcClient(tournamentDeckCheckContract, context.cookie).addCard(data),
  );

const renameCardFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      tournamentId: string;
      entryId: string;
      cardId: string;
      name: string;
      section?: string;
      copies?: number;
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
    apiOrpcClient(tournamentDeckCheckContract, context.cookie).renameCard(data),
  );

const applyZoneFixesFn = createServerFn({ method: "POST" })
  .validator((input: { tournamentId: string; entryId: string; cardIds: string[] }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
    apiOrpcClient(tournamentDeckCheckContract, context.cookie).applyZoneFixes(data),
  );

const removeCardFn = createServerFn({ method: "POST" })
  .validator(
    (input: { tournamentId: string; entryId: string; cardId: string; copyIndex: number }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(tournamentDeckCheckContract, context.cookie).removeCardCopy(data);
  });

const tickCardFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      tournamentId: string;
      entryId: string;
      cardId: string;
      copyIndex: number;
      found: boolean;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(tournamentDeckCheckContract, context.cookie).tickCard(data);
  });

export function useCreateTournamentDeckCheckEntry() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof createEntryFn>[0]["data"]) =>
      createEntryFn({ data: vars }),
    invalidates: (vars) => deckCheckEntryInvalidationKeys(userId, vars),
  });
}

export function useSetTournamentDeckCheckEntryState() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof setEntryStateFn>[0]["data"]) =>
      setEntryStateFn({ data: vars }),
    invalidates: (vars) => deckCheckEntryInvalidationKeys(userId, vars),
  });
}

export function useDenyTournamentDeckCheckUnlock() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { tournamentId: string; entryId: string }) =>
      denyUnlockRequestFn({ data: vars }),
    invalidates: (vars) => deckCheckEntryInvalidationKeys(userId, vars),
  });
}

export function useUpdateTournamentDeckCheckEntry() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof updateEntryFn>[0]["data"]) =>
      updateEntryFn({ data: vars }),
    invalidates: (vars) => deckCheckEntryInvalidationKeys(userId, vars),
  });
}

export function useDeleteTournamentDeckCheckEntry() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { tournamentId: string; entryId: string }) => deleteEntryFn({ data: vars }),
    invalidates: (vars) => [queryKeys.tournamentDeckCheck.entries(userId, vars.tournamentId)],
  });
}

export function useUnlinkTournamentDeckCheckEntry() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { tournamentId: string; entryId: string }) => unlinkEntryFn({ data: vars }),
    invalidates: (vars) => deckCheckEntryInvalidationKeys(userId, vars),
  });
}

export function useReResolveTournamentDeckCheck() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { tournamentId: string }) => reResolveFn({ data: vars.tournamentId }),
    invalidates: (vars) => [queryKeys.tournamentDeckCheck.entries(userId, vars.tournamentId)],
  });
}

export function useAddTournamentDeckCheckCard() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof addCardFn>[0]["data"]) => addCardFn({ data: vars }),
    invalidates: (vars) => deckCheckEntryInvalidationKeys(userId, vars),
  });
}

export function useFixTournamentDeckCheckCard() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof renameCardFn>[0]["data"]) => renameCardFn({ data: vars }),
    invalidates: (vars) => deckCheckEntryInvalidationKeys(userId, vars),
  });
}

export function useApplyTournamentDeckCheckZoneFixes() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { tournamentId: string; entryId: string; cardIds: string[] }) =>
      applyZoneFixesFn({ data: vars }),
    invalidates: (vars) => deckCheckEntryInvalidationKeys(userId, vars),
  });
}

export function useRemoveTournamentDeckCheckCard() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: {
      tournamentId: string;
      entryId: string;
      cardId: string;
      copyIndex: number;
    }) => removeCardFn({ data: vars }),
    invalidates: (vars) => deckCheckEntryInvalidationKeys(userId, vars),
  });
}

export function useTickTournamentDeckCheckCard() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof tickCardFn>[0]["data"]) => tickCardFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.tournamentDeckCheck.entry(userId, vars.tournamentId, vars.entryId),
    ],
  });
}
