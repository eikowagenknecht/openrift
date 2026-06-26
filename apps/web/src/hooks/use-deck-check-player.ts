import type {
  DeckCheckClaimLandingResponse,
  DeckCheckClaimResultResponse,
  DeckCheckSubmissionPageResponse,
  DeckCheckSubmissionResultResponse,
  PlayerDeckCheckEntriesResponse,
  PlayerDeckCheckEntryDetailResponse,
} from "@openrift/shared";
import { deckCheckClaimContract, deckCheckPlayerContract } from "@openrift/shared/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

/**
 * One of an own deck's id, a pasted deck code, or the parsed lines of a
 * pasted text list; `dryRun` previews the resolved list without writing.
 */
export interface TournamentDeckSubmissionInput {
  deckId?: string;
  deckCode?: string;
  cards?: { name: string; quantity: number; section: string }[];
  /** Consent for the organizer to publish the deck list publicly; omitted = keep stored. */
  allowDeckPublishing?: boolean;
  /** Consent to show the player's name on public platforms; omitted = keep stored. */
  allowNameSharing?: boolean;
  /** Consent to show the player's Riot ID on public platforms; omitted = keep stored. */
  allowRiotIdSharing?: boolean;
  dryRun?: boolean;
}

// ── Server functions ────────────────────────────────────────────────────────

const fetchMyTournamentDecks = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<PlayerDeckCheckEntriesResponse> =>
      apiOrpcClient(deckCheckPlayerContract, context.cookie).listMine(),
  );

const fetchMyTournamentDeck = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: entryId }): Promise<PlayerDeckCheckEntryDetailResponse> =>
      apiOrpcClient(deckCheckPlayerContract, context.cookie).getMine({ entryId }),
  );

const editMyTournamentDeckFn = createServerFn({ method: "POST" })
  .validator((input: { entryId: string } & TournamentDeckSubmissionInput) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckSubmissionResultResponse> =>
      apiOrpcClient(deckCheckPlayerContract, context.cookie).editList(data),
  );

const submitMyTournamentDeckFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: entryId }): Promise<PlayerDeckCheckEntryDetailResponse> =>
      apiOrpcClient(deckCheckPlayerContract, context.cookie).submit({ entryId }),
  );

const unlockMyTournamentDeckFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: entryId }): Promise<PlayerDeckCheckEntryDetailResponse> =>
      apiOrpcClient(deckCheckPlayerContract, context.cookie).unlock({ entryId }),
  );

const cancelUnlockRequestFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: entryId }): Promise<PlayerDeckCheckEntryDetailResponse> =>
      apiOrpcClient(deckCheckPlayerContract, context.cookie).cancelUnlock({ entryId }),
  );

const fetchSubmissionPage = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: token }): Promise<DeckCheckSubmissionPageResponse> =>
      apiOrpcClient(deckCheckPlayerContract, context.cookie).submissionPage({ token }),
  );

const submitTournamentDeckFn = createServerFn({ method: "POST" })
  .validator((input: { token: string } & TournamentDeckSubmissionInput) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckSubmissionResultResponse> =>
      apiOrpcClient(deckCheckPlayerContract, context.cookie).submitToToken(data),
  );

const fetchClaimLanding = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    // Migrated to oRPC: contract-typed client instead of the hc client.
    ({ context, data: token }): Promise<DeckCheckClaimLandingResponse> =>
      apiOrpcClient(deckCheckClaimContract, context.cookie).landing({ token }),
  );

const claimTournamentDeckFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: token }): Promise<DeckCheckClaimResultResponse> =>
      apiOrpcClient(deckCheckPlayerContract, context.cookie).claim({ token }),
  );

// ── Query hooks ─────────────────────────────────────────────────────────────

export function useMyTournamentDecks() {
  const userId = useRequiredUserId();
  return useQuery({
    queryKey: queryKeys.tournamentDecks.mine(userId),
    queryFn: () => fetchMyTournamentDecks(),
  });
}

export function useMyTournamentDeck(entryId: string) {
  const userId = useRequiredUserId();
  return useQuery({
    queryKey: queryKeys.tournamentDecks.entry(userId, entryId),
    queryFn: () => fetchMyTournamentDeck({ data: entryId }),
  });
}

export function useTournamentSubmissionPage(token: string) {
  const userId = useRequiredUserId();
  return useQuery({
    queryKey: queryKeys.tournamentDecks.submission(userId, token),
    queryFn: () => fetchSubmissionPage({ data: token }),
    retry: false,
  });
}

// The pre-claim landing (public): event + group for a claim token, or 404.
export function useClaimLanding(token: string) {
  return useQuery({
    queryKey: queryKeys.tournamentDecks.claim(token),
    queryFn: () => fetchClaimLanding({ data: token }),
    retry: false,
  });
}

// ── Mutation hooks ──────────────────────────────────────────────────────────

export function useEditMyTournamentDeck() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { entryId: string } & TournamentDeckSubmissionInput) =>
      editMyTournamentDeckFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.tournamentDecks.mine(userId),
      queryKeys.tournamentDecks.entry(userId, vars.entryId),
    ],
  });
}

export function useSubmitMyTournamentDeck() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (entryId: string) => submitMyTournamentDeckFn({ data: entryId }),
    invalidates: (entryId) => [
      queryKeys.tournamentDecks.mine(userId),
      queryKeys.tournamentDecks.entry(userId, entryId),
    ],
  });
}

export function useUnlockMyTournamentDeck() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (entryId: string) => unlockMyTournamentDeckFn({ data: entryId }),
    invalidates: (entryId) => [
      queryKeys.tournamentDecks.mine(userId),
      queryKeys.tournamentDecks.entry(userId, entryId),
    ],
  });
}

export function useCancelUnlockRequest() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (entryId: string) => cancelUnlockRequestFn({ data: entryId }),
    invalidates: (entryId) => [
      queryKeys.tournamentDecks.mine(userId),
      queryKeys.tournamentDecks.entry(userId, entryId),
    ],
  });
}

export function useSubmitTournamentDeck() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { token: string } & TournamentDeckSubmissionInput) =>
      submitTournamentDeckFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.tournamentDecks.mine(userId),
      queryKeys.tournamentDecks.submission(userId, vars.token),
    ],
  });
}

/**
 * Claims an entry via a provider-issued claim link. Public (no userId): the
 * page is reachable logged-out, and the caller is established by the session
 * cookie when the POST runs.
 * @returns A mutation resolving to the claim outcome.
 */
export function useClaimTournamentDeck() {
  return useMutation({
    mutationFn: (token: string) => claimTournamentDeckFn({ data: token }),
  });
}

/**
 * Dry-run preview shared by the submission and edit flows: never invalidates
 * anything, because nothing is written.
 * @returns A mutation resolving to the previewed lines and findings.
 */
export function usePreviewTournamentDeck() {
  return useMutation({
    mutationFn: (vars: ({ token: string } | { entryId: string }) & TournamentDeckSubmissionInput) =>
      "token" in vars
        ? submitTournamentDeckFn({ data: { ...vars, dryRun: true } })
        : editMyTournamentDeckFn({ data: { ...vars, dryRun: true } }),
  });
}
