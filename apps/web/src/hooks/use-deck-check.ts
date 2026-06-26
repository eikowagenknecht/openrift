import type {
  DeckCheckAccountSearchResponse,
  DeckCheckEntryDetailResponse,
  DeckCheckEventDetailResponse,
  DeckCheckEventListResponse,
  DeckCheckEventSummaryResponse,
  DeckCheckKeyMintedResponse,
  DeckCheckKeysResponse,
} from "@openrift/shared";
import { deckCheckContract } from "@openrift/shared/contracts";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

/** Multi-judge shared state is polled; this is the reconcile cadence. */
const POLL_INTERVAL_MS = 5000;

// ── Server functions: queries ───────────────────────────────────────────────

const fetchDeckCheckEvents = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: slug }): Promise<DeckCheckEventListResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).listEvents({ slug }),
  );

const fetchDeckCheckEvent = createServerFn({ method: "GET" })
  .validator((input: { slug: string; eventId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEventDetailResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).getEventDetail(data),
  );

const fetchDeckCheckEntry = createServerFn({ method: "GET" })
  .validator((input: { slug: string; eventId: string; entryId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).getEntryDetail(data),
  );

const fetchDeckCheckKeys = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: slug }): Promise<DeckCheckKeysResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).listKeys({ slug }),
  );

// ── Query hooks ─────────────────────────────────────────────────────────────

function deckCheckEventsQueryOptions(userId: string, slug: string) {
  return queryOptions({
    queryKey: queryKeys.friendGroups.checks(userId, slug),
    queryFn: () => fetchDeckCheckEvents({ data: slug }),
  });
}

export function useDeckCheckEvents(slug: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(deckCheckEventsQueryOptions(userId, slug));
}

function deckCheckEventQueryOptions(userId: string, slug: string, eventId: string) {
  return queryOptions({
    queryKey: queryKeys.friendGroups.checkEvent(userId, slug, eventId),
    queryFn: () => fetchDeckCheckEvent({ data: { slug, eventId } }),
  });
}

/**
 * Polls so all judges in the room see the same entry list state.
 * @returns The event detail query, refreshed every few seconds.
 */
export function useDeckCheckEvent(slug: string, eventId: string) {
  const userId = useRequiredUserId();
  return useQuery({
    ...deckCheckEventQueryOptions(userId, slug, eventId),
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
}

function deckCheckEntryQueryOptions(
  userId: string,
  slug: string,
  eventId: string,
  entryId: string,
) {
  return queryOptions({
    queryKey: queryKeys.friendGroups.checkEntry(userId, slug, eventId, entryId),
    queryFn: () => fetchDeckCheckEntry({ data: { slug, eventId, entryId } }),
  });
}

/**
 * Polls so concurrent judges' ticks and state changes reconcile.
 * @returns The entry detail query, refreshed every few seconds.
 */
export function useDeckCheckEntry(slug: string, eventId: string, entryId: string) {
  const userId = useRequiredUserId();
  return useQuery({
    ...deckCheckEntryQueryOptions(userId, slug, eventId, entryId),
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
}

export function useDeckCheckKeys(slug: string, enabled: boolean) {
  const userId = useRequiredUserId();
  return useQuery({
    queryKey: queryKeys.friendGroups.checkKeys(userId, slug),
    queryFn: () => fetchDeckCheckKeys({ data: slug }),
    enabled,
  });
}

// ── Server functions: mutations ─────────────────────────────────────────────

const createEventFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      slug: string;
      name: string;
      eventDate?: string | null;
      format?: string | null;
      allowedSets?: string[] | null;
    }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEventSummaryResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).createEvent(data),
  );

const updateEventFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      slug: string;
      eventId: string;
      name?: string;
      eventDate?: string | null;
      format?: string | null;
      allowedSets?: string[] | null;
      status?: "active" | "archived";
      listLockMode?: "on_submit" | "at_deadline";
      allowSelfSubmission?: boolean;
      submissionsCloseAt?: string | null;
    }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEventSummaryResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).updateEvent(data),
  );

const deleteEventFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; eventId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(deckCheckContract, context.cookie).deleteEvent(data);
  });

const reResolveEventFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; eventId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<{ updatedLines: number }> =>
      apiOrpcClient(deckCheckContract, context.cookie).reResolveEvent(data),
  );

const createEntryFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      slug: string;
      eventId: string;
      playerName: string;
      playerEmail?: string | null;
      riotId?: string | null;
      cards: { name: string; quantity: number; section: string }[];
    }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).createManualEntry(data),
  );

const setEntryStateFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      slug: string;
      eventId: string;
      entryId: string;
      state: "editable" | "submitted" | "approved" | "checked" | "withdrawn";
      reviewOutcome?: "ok" | "issue" | null;
      notes?: string | null;
      playerMessage?: string | null;
    }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).setEntryState(data),
  );

const denyUnlockRequestFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; eventId: string; entryId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).denyUnlockRequest(data),
  );

const deleteEntryFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; eventId: string; entryId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(deckCheckContract, context.cookie).deleteEntry(data);
  });

const updateEntryFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      slug: string;
      eventId: string;
      entryId: string;
      playerName?: string;
      playerEmail?: string | null;
      riotId?: string | null;
      playerMessage?: string | null;
      allowDeckPublishing?: boolean;
      allowNameSharing?: boolean;
      allowRiotIdSharing?: boolean;
    }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).updateEntry(data),
  );

const linkEntryFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; eventId: string; entryId: string; userId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).linkEntry(data),
  );

const unlinkEntryFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; eventId: string; entryId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).unlinkEntry(data),
  );

const searchAccountsFn = createServerFn({ method: "GET" })
  .validator((input: { slug: string; q: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckAccountSearchResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).searchAccounts(data),
  );

const regenerateSubmissionTokenFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; eventId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEventSummaryResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).regenerateSubmissionToken(data),
  );

const addCardFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      slug: string;
      eventId: string;
      entryId: string;
      name: string;
      quantity: number;
      section: string;
    }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).addCard(data),
  );

const renameCardFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      slug: string;
      eventId: string;
      entryId: string;
      cardId: string;
      name: string;
      section?: string;
      copies?: number;
    }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).renameCard(data),
  );

const applyZoneFixesFn = createServerFn({ method: "POST" })
  .validator(
    (input: { slug: string; eventId: string; entryId: string; cardIds: string[] }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).applyZoneFixes(data),
  );

const removeCardFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      slug: string;
      eventId: string;
      entryId: string;
      cardId: string;
      copyIndex: number;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(deckCheckContract, context.cookie).removeCardCopy(data);
  });

const tickCardFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      slug: string;
      eventId: string;
      entryId: string;
      cardId: string;
      copyIndex: number;
      found: boolean;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(deckCheckContract, context.cookie).tickCard(data);
  });

const mintKeyFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckKeyMintedResponse> =>
      apiOrpcClient(deckCheckContract, context.cookie).mintKey(data),
  );

const renameKeyFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; keyId: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(deckCheckContract, context.cookie).renameKey(data);
  });

const revokeKeyFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; keyId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(deckCheckContract, context.cookie).revokeKey(data);
  });

// ── Mutation hooks ──────────────────────────────────────────────────────────

export function useCreateDeckCheckEvent() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof createEventFn>[0]["data"]) =>
      createEventFn({ data: vars }),
    invalidates: (vars) => [queryKeys.friendGroups.checks(userId, vars.slug)],
  });
}

export function useUpdateDeckCheckEvent() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof updateEventFn>[0]["data"]) =>
      updateEventFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.friendGroups.checks(userId, vars.slug),
      queryKeys.friendGroups.checkEvent(userId, vars.slug, vars.eventId),
    ],
  });
}

export function useDeleteDeckCheckEvent() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; eventId: string }) => deleteEventFn({ data: vars }),
    invalidates: (vars) => [queryKeys.friendGroups.checks(userId, vars.slug)],
  });
}

export function useReResolveDeckCheckEvent() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; eventId: string }) => reResolveEventFn({ data: vars }),
    invalidates: (vars) => [queryKeys.friendGroups.checkEvent(userId, vars.slug, vars.eventId)],
  });
}

export function useCreateDeckCheckEntry() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof createEntryFn>[0]["data"]) =>
      createEntryFn({ data: vars }),
    invalidates: (vars) => [queryKeys.friendGroups.checkEvent(userId, vars.slug, vars.eventId)],
  });
}

export function useSetDeckCheckEntryState() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof setEntryStateFn>[0]["data"]) =>
      setEntryStateFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.friendGroups.checkEvent(userId, vars.slug, vars.eventId),
      queryKeys.friendGroups.checkEntry(userId, vars.slug, vars.eventId, vars.entryId),
    ],
  });
}

export function useDenyDeckCheckUnlockRequest() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof denyUnlockRequestFn>[0]["data"]) =>
      denyUnlockRequestFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.friendGroups.checkEvent(userId, vars.slug, vars.eventId),
      queryKeys.friendGroups.checkEntry(userId, vars.slug, vars.eventId, vars.entryId),
    ],
  });
}

export function useUpdateDeckCheckEntry() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof updateEntryFn>[0]["data"]) =>
      updateEntryFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.friendGroups.checkEvent(userId, vars.slug, vars.eventId),
      queryKeys.friendGroups.checkEntry(userId, vars.slug, vars.eventId, vars.entryId),
    ],
  });
}

export function useDeleteDeckCheckEntry() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; eventId: string; entryId: string }) =>
      deleteEntryFn({ data: vars }),
    invalidates: (vars) => [queryKeys.friendGroups.checkEvent(userId, vars.slug, vars.eventId)],
  });
}

export function useLinkDeckCheckEntry() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof linkEntryFn>[0]["data"]) => linkEntryFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.friendGroups.checkEvent(userId, vars.slug, vars.eventId),
      queryKeys.friendGroups.checkEntry(userId, vars.slug, vars.eventId, vars.entryId),
    ],
  });
}

export function useUnlinkDeckCheckEntry() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; eventId: string; entryId: string }) =>
      unlinkEntryFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.friendGroups.checkEvent(userId, vars.slug, vars.eventId),
      queryKeys.friendGroups.checkEntry(userId, vars.slug, vars.eventId, vars.entryId),
    ],
  });
}

/**
 * Account candidates for the judge link search; runs once the query is at
 * least two characters.
 * @returns The account search query.
 */
export function useDeckCheckAccountSearch(slug: string, q: string) {
  const userId = useRequiredUserId();
  return useQuery({
    queryKey: [...queryKeys.friendGroups.checks(userId, slug), "account-search", q] as const,
    queryFn: () => searchAccountsFn({ data: { slug, q } }),
    enabled: q.trim().length >= 2,
  });
}

export function useRegenerateDeckCheckSubmissionToken() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; eventId: string }) =>
      regenerateSubmissionTokenFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.friendGroups.checks(userId, vars.slug),
      queryKeys.friendGroups.checkEvent(userId, vars.slug, vars.eventId),
    ],
  });
}

export function useAddDeckCheckCard() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof addCardFn>[0]["data"]) => addCardFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.friendGroups.checkEvent(userId, vars.slug, vars.eventId),
      queryKeys.friendGroups.checkEntry(userId, vars.slug, vars.eventId, vars.entryId),
    ],
  });
}

export function useFixDeckCheckCard() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof renameCardFn>[0]["data"]) => renameCardFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.friendGroups.checkEvent(userId, vars.slug, vars.eventId),
      queryKeys.friendGroups.checkEntry(userId, vars.slug, vars.eventId, vars.entryId),
    ],
  });
}

export function useApplyDeckCheckZoneFixes() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof applyZoneFixesFn>[0]["data"]) =>
      applyZoneFixesFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.friendGroups.checkEvent(userId, vars.slug, vars.eventId),
      queryKeys.friendGroups.checkEntry(userId, vars.slug, vars.eventId, vars.entryId),
    ],
  });
}

export function useRemoveDeckCheckCard() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: {
      slug: string;
      eventId: string;
      entryId: string;
      cardId: string;
      copyIndex: number;
    }) => removeCardFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.friendGroups.checkEvent(userId, vars.slug, vars.eventId),
      queryKeys.friendGroups.checkEntry(userId, vars.slug, vars.eventId, vars.entryId),
    ],
  });
}

export function useTickDeckCheckCard() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof tickCardFn>[0]["data"]) => tickCardFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.friendGroups.checkEntry(userId, vars.slug, vars.eventId, vars.entryId),
    ],
  });
}

export function useMintDeckCheckKey() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string }) => mintKeyFn({ data: vars }),
    invalidates: (vars) => [queryKeys.friendGroups.checkKeys(userId, vars.slug)],
  });
}

export function useRenameDeckCheckKey() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; keyId: string; label: string }) =>
      renameKeyFn({ data: vars }),
    invalidates: (vars) => [queryKeys.friendGroups.checkKeys(userId, vars.slug)],
  });
}

export function useRevokeDeckCheckKey() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; keyId: string }) => revokeKeyFn({ data: vars }),
    invalidates: (vars) => [queryKeys.friendGroups.checkKeys(userId, vars.slug)],
  });
}
