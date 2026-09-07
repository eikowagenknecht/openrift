import { deckCheckClaimContract } from "@openrift/shared/contracts/deck-check-claim";
import { deckCheckPlayerContract } from "@openrift/shared/contracts/deck-check-player";
import type {
  DeckCheckClaimLandingResponse,
  DeckCheckClaimResultResponse,
  DeckCheckSubmissionPageResponse,
  DeckCheckSubmissionResultResponse,
  PlayerDeckCheckEntryDetailResponse,
} from "@openrift/shared/types/api/deck-check";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import {
  tournamentDecksKeys,
  tournamentsKeys,
} from "@/features/tournaments/lib/tournaments-query-keys";
import { useRequiredUserId } from "@/lib/auth-session";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

/**
 * One of an own deck's id, a pasted deck code, or the parsed lines of a
 * pasted text list; `dryRun` previews the resolved list without writing.
 */
export type TournamentDeckSubmissionInput = Omit<
  ContractInput<typeof deckCheckPlayerContract, "editList">,
  "entryId"
>;

const fetchMyTournamentDeck = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: tournamentId }): Promise<PlayerDeckCheckEntryDetailResponse> =>
    apiOrpcClient(deckCheckPlayerContract, context.cookie).getMine({ tournamentId }),
  );

const editMyTournamentDeckFn = createServerFn({ method: "POST" })
  .validator((input: { entryId: string } & TournamentDeckSubmissionInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckCheckSubmissionResultResponse> =>
    apiOrpcClient(deckCheckPlayerContract, context.cookie).editList(data),
  );

const submitMyTournamentDeckFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: entryId }): Promise<PlayerDeckCheckEntryDetailResponse> =>
    apiOrpcClient(deckCheckPlayerContract, context.cookie).submit({ entryId }),
  );

const unlockMyTournamentDeckFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: entryId }): Promise<PlayerDeckCheckEntryDetailResponse> =>
    apiOrpcClient(deckCheckPlayerContract, context.cookie).unlock({ entryId }),
  );

const cancelUnlockRequestFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: entryId }): Promise<PlayerDeckCheckEntryDetailResponse> =>
    apiOrpcClient(deckCheckPlayerContract, context.cookie).cancelUnlock({ entryId }),
  );

const fetchSubmissionPage = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: token }): Promise<DeckCheckSubmissionPageResponse> =>
    apiOrpcClient(deckCheckPlayerContract, context.cookie).submissionPage({ token }),
  );

const submitTournamentDeckFn = createServerFn({ method: "POST" })
  .validator((input: { token: string } & TournamentDeckSubmissionInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckCheckSubmissionResultResponse> =>
    apiOrpcClient(deckCheckPlayerContract, context.cookie).submitToToken(data),
  );

const fetchClaimLanding = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: token }): Promise<DeckCheckClaimLandingResponse> =>
    apiOrpcClient(deckCheckClaimContract, context.cookie).landing({ token }),
  );

const claimTournamentDeckFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: token }): Promise<DeckCheckClaimResultResponse> =>
    apiOrpcClient(deckCheckPlayerContract, context.cookie).claim({ token }),
  );

/**
 * Addressed by tournament, since that is what the route carries; the entry id
 * it resolves to is what the write hooks below take.
 */
export function useMyTournamentDeck(tournamentId: string) {
  const userId = useRequiredUserId();
  return useQuery({
    queryKey: tournamentDecksKeys.entry(userId, tournamentId),
    queryFn: () => fetchMyTournamentDeck({ data: tournamentId }),
  });
}

export function useTournamentSubmissionPage(token: string) {
  const userId = useRequiredUserId();
  return useQuery({
    queryKey: tournamentDecksKeys.submission(userId, token),
    queryFn: () => fetchSubmissionPage({ data: token }),
    retry: false,
  });
}

// The pre-claim landing (public): event + group for a claim token, or 404.
export function useClaimLanding(token: string) {
  return useQuery({
    queryKey: tournamentDecksKeys.claim(token),
    queryFn: () => fetchClaimLanding({ data: token }),
    retry: false,
  });
}

/**
 * Every write addresses the entry by id but is cached under its tournament,
 * which the tournament detail also carries (`myDeckEntry`), so both refresh.
 */
function deckWriteKeys(userId: string, tournamentId: string) {
  return [
    tournamentDecksKeys.entry(userId, tournamentId),
    tournamentsKeys.detail(userId, tournamentId),
  ];
}

interface DeckEntryRef {
  entryId: string;
  tournamentId: string;
}

export function useEditMyTournamentDeck() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    // `tournamentId` addresses the cache, not the endpoint; drop it from the body.
    mutationFn: ({
      tournamentId: _tournamentId,
      ...body
    }: DeckEntryRef & TournamentDeckSubmissionInput) => editMyTournamentDeckFn({ data: body }),
    invalidates: (vars) => deckWriteKeys(userId, vars.tournamentId),
  });
}

export function useSubmitMyTournamentDeck() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: DeckEntryRef) => submitMyTournamentDeckFn({ data: vars.entryId }),
    invalidates: (vars) => deckWriteKeys(userId, vars.tournamentId),
  });
}

export function useUnlockMyTournamentDeck() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: DeckEntryRef) => unlockMyTournamentDeckFn({ data: vars.entryId }),
    invalidates: (vars) => deckWriteKeys(userId, vars.tournamentId),
  });
}

export function useCancelUnlockRequest() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: DeckEntryRef) => cancelUnlockRequestFn({ data: vars.entryId }),
    invalidates: (vars) => deckWriteKeys(userId, vars.tournamentId),
  });
}

export function useSubmitTournamentDeck() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { token: string } & TournamentDeckSubmissionInput) =>
      submitTournamentDeckFn({ data: vars }),
    // The token names the link, not the tournament; the result is what says
    // which tournament just took a deck.
    invalidates: (vars, data) => [
      tournamentDecksKeys.submission(userId, vars.token),
      ...deckWriteKeys(userId, data.tournamentId),
    ],
  });
}

/**
 * Public (no userId): the page is reachable logged-out, and the caller is
 * established by the session cookie when the POST runs.
 */
export function useClaimTournamentDeck() {
  return useMutation({
    mutationFn: (token: string) => claimTournamentDeckFn({ data: token }),
  });
}

/** Dry-run preview shared by the submission and edit flows: never invalidates anything. */
export function usePreviewTournamentDeck() {
  return useMutation({
    mutationFn: (
      vars: ({ token: string } | { entryId: string }) & TournamentDeckSubmissionInput,
    ) =>
      "token" in vars
        ? submitTournamentDeckFn({ data: { ...vars, dryRun: true } })
        : editMyTournamentDeckFn({ data: { ...vars, dryRun: true } }),
  });
}
