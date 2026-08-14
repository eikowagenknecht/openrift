import type {
  AcceptedMetaDeckResponse,
  AcceptedMetaEventResponse,
  AcceptedMetaEventWithDecksResponse,
  MetaCandidateDetail,
  MetaCandidateQueueRow,
  MetaUploadBody,
  MetaUploadResponse,
} from "@openrift/shared";
import { adminMetaCandidatesContract } from "@openrift/shared/contracts/admin/meta";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// The Meta Archive's candidate review queue (ADR-014), full-admin only. Split
// out of `use-admin-meta.ts` because the queue is its own surface with its own
// query keys — the curation hooks there talk to the live archive, these talk to
// staging.
//
// Every write invalidates the queue AND the live archive keys: an accept adds
// or edits a live event or deck, an upload or an ignore reshapes the queue, and
// `checkedAt` changes what the queue's default filter shows.

/** Queue, open detail, live event list, and the public archive. */
const ALL_META_KEYS = [
  queryKeys.admin.meta.candidates,
  queryKeys.admin.meta.events,
  queryKeys.meta.all,
] as const;

/** The above plus the ignore lists, for the two writes that touch them. */
const ALL_META_KEYS_WITH_IGNORED = [...ALL_META_KEYS, queryKeys.admin.meta.ignored] as const;

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

const fetchMetaCandidates = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<{ candidates: MetaCandidateQueueRow[] }> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).list(),
  );

export const adminMetaCandidatesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.meta.candidates,
  queryFn: () => fetchMetaCandidates(),
  staleTime: 5 * 60 * 1000,
});

/**
 * Every staged candidate event with its deck and unresolved-name counts.
 *
 * @returns The suspense query holding the candidate queue.
 */
export function useAdminMetaCandidates() {
  return useSuspenseQuery(adminMetaCandidatesQueryOptions);
}

/**
 * The candidate detail as the client sees it. `extraData` is `unknown` on the
 * wire — source fields that map to nothing of ours — and an unknown cannot
 * cross the server-function boundary, so it is serialized here and rendered as
 * text.
 */
export type MetaCandidateDetailView = Omit<MetaCandidateDetail, "extraData"> & {
  extraData: string | null;
};

const fetchMetaCandidate = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<MetaCandidateDetailView> => {
    const { extraData, ...detail } = await apiOrpcClient(
      adminMetaCandidatesContract,
      context.cookie,
    ).detail({ id: data.id });
    if (extraData === null || extraData === undefined) {
      return { ...detail, extraData: null };
    }
    return { ...detail, extraData: JSON.stringify(extraData, null, 2) };
  });

/**
 * Query options for one candidate event, its diff, and all its decks.
 *
 * @param candidateId - The candidate event to load.
 * @returns The query options.
 */
export function adminMetaCandidateQueryOptions(candidateId: string) {
  return queryOptions({
    queryKey: queryKeys.admin.meta.candidate(candidateId),
    queryFn: () => fetchMetaCandidate({ data: { id: candidateId } }),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * One candidate event's review detail.
 *
 * @param candidateId - The candidate event to load.
 * @returns The suspense query holding the candidate detail.
 */
export function useAdminMetaCandidate(candidateId: string) {
  return useSuspenseQuery(adminMetaCandidateQueryOptions(candidateId));
}

// ---------------------------------------------------------------------------
// Upload and matching
// ---------------------------------------------------------------------------

const uploadMetaCandidatesFn = createServerFn({ method: "POST" })
  .validator((input: MetaUploadBody) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaUploadResponse> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).upload(data),
  );

/**
 * Stages an upload payload. Each event in it wholly replaces its own candidate.
 *
 * @returns The mutation; resolves with the ingest summary.
 */
export function useUploadMetaCandidates() {
  return useMutationWithInvalidation<MetaUploadResponse, MetaUploadBody>({
    mutationFn: (vars) => uploadMetaCandidatesFn({ data: vars }),
    invalidates: ALL_META_KEYS,
  });
}

const rematchMetaCandidatesFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }) => apiOrpcClient(adminMetaCandidatesContract, context.cookie).rematch());

/**
 * Re-runs card-name matching over every staged deck, picking up alias fixes.
 *
 * @returns The mutation; resolves with the examined / updated / resolved counts.
 */
export function useRematchMetaCandidates() {
  return useMutationWithInvalidation({
    mutationFn: () => rematchMetaCandidatesFn(),
    invalidates: ALL_META_KEYS,
  });
}

/** The alias fix: "this source name means that card", then rematch. */
export interface ResolveMetaNameInput {
  name: string;
  cardId: string;
}

const resolveMetaNameFn = createServerFn({ method: "POST" })
  .validator((input: ResolveMetaNameInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).resolveName(data),
  );

/**
 * Records a card-name alias and rematches every staged deck against it.
 *
 * @returns The mutation; resolves with the examined / updated / resolved counts.
 */
export function useResolveMetaCandidateName() {
  return useMutationWithInvalidation({
    mutationFn: (vars: ResolveMetaNameInput) => resolveMetaNameFn({ data: vars }),
    invalidates: ALL_META_KEYS,
  });
}

// ---------------------------------------------------------------------------
// Event review actions
// ---------------------------------------------------------------------------

const acceptMetaCandidateEventFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<AcceptedMetaEventResponse> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).acceptEvent({ id: data.id }),
  );

/**
 * Accepts a candidate event into the archive, creating or updating the live row.
 *
 * @returns The mutation; resolves with the live event's id and slug.
 */
export function useAcceptMetaCandidateEvent() {
  return useMutationWithInvalidation<AcceptedMetaEventResponse, { id: string }>({
    mutationFn: (vars) => acceptMetaCandidateEventFn({ data: vars }),
    invalidates: ALL_META_KEYS,
  });
}

const acceptMetaCandidateEventWithDecksFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<AcceptedMetaEventWithDecksResponse> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).acceptEventWithDecks({
      id: data.id,
    }),
  );

/**
 * Accepts a candidate event together with every deck under it that is ready.
 *
 * @returns The mutation; resolves with the accepted and skipped decks.
 */
export function useAcceptMetaCandidateEventWithDecks() {
  return useMutationWithInvalidation<AcceptedMetaEventWithDecksResponse, { id: string }>({
    mutationFn: (vars) => acceptMetaCandidateEventWithDecksFn({ data: vars }),
    invalidates: ALL_META_KEYS,
  });
}

const checkMetaCandidateEventFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; checked: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCandidatesContract, context.cookie).checkEvent(data);
  });

/**
 * Marks a candidate event reviewed, or puts it back in the queue.
 *
 * @returns The mutation.
 */
export function useCheckMetaCandidateEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string; checked: boolean }) =>
      checkMetaCandidateEventFn({ data: vars }),
    invalidates: [queryKeys.admin.meta.candidates],
  });
}

const ignoreMetaCandidateEventFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCandidatesContract, context.cookie).ignoreEvent({ id: data.id });
  });

/**
 * Drops a candidate event and skips its key on every future upload.
 *
 * @returns The mutation.
 */
export function useIgnoreMetaCandidateEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string }) => ignoreMetaCandidateEventFn({ data: vars }),
    invalidates: ALL_META_KEYS_WITH_IGNORED,
  });
}

// ---------------------------------------------------------------------------
// Deck review actions
// ---------------------------------------------------------------------------

const acceptMetaCandidateDeckFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<AcceptedMetaDeckResponse> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).acceptDeck({ id: data.id }),
  );

/**
 * Archives one candidate deck under its already-accepted event.
 *
 * @returns The mutation; resolves with the live deck's id.
 */
export function useAcceptMetaCandidateDeck() {
  return useMutationWithInvalidation<AcceptedMetaDeckResponse, { id: string }>({
    mutationFn: (vars) => acceptMetaCandidateDeckFn({ data: vars }),
    invalidates: ALL_META_KEYS,
  });
}

const checkMetaCandidateDeckFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; checked: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCandidatesContract, context.cookie).checkDeck(data);
  });

/**
 * Marks a candidate deck reviewed, or unmarks it.
 *
 * @returns The mutation.
 */
export function useCheckMetaCandidateDeck() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string; checked: boolean }) =>
      checkMetaCandidateDeckFn({ data: vars }),
    invalidates: [queryKeys.admin.meta.candidates],
  });
}

const ignoreMetaCandidateDeckFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCandidatesContract, context.cookie).ignoreDeck({ id: data.id });
  });

/**
 * Drops a candidate deck and skips its key on every future upload.
 *
 * @returns The mutation.
 */
export function useIgnoreMetaCandidateDeck() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string }) => ignoreMetaCandidateDeckFn({ data: vars }),
    invalidates: ALL_META_KEYS_WITH_IGNORED,
  });
}

// ---------------------------------------------------------------------------
// Ignore lists
// ---------------------------------------------------------------------------

/** One ignored event key. */
export interface IgnoredMetaCandidate {
  provider: string;
  externalId: string;
  createdAt: string;
}

/**
 * One ignored deck key. Deck ids restart per event at the source, so an ignored
 * deck names the event it belongs to as well.
 */
export interface IgnoredMetaCandidateDeck extends IgnoredMetaCandidate {
  eventExternalId: string;
}

const fetchIgnoredMetaCandidates = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({
      context,
    }): Promise<{
      events: IgnoredMetaCandidate[];
      decks: IgnoredMetaCandidateDeck[];
    }> => apiOrpcClient(adminMetaCandidatesContract, context.cookie).listIgnored(),
  );

const adminMetaIgnoredQueryOptions = queryOptions({
  queryKey: queryKeys.admin.meta.ignored,
  queryFn: () => fetchIgnoredMetaCandidates(),
  staleTime: 5 * 60 * 1000,
});

/**
 * The ignored event and deck keys, which uploads skip. A plain query, not a
 * suspense one: it is opened from a dialog, so there is no route loader to warm
 * it and no sensible boundary to suspend against.
 *
 * @returns The query holding both ignore lists.
 */
export function useAdminMetaIgnoredCandidates() {
  return useQuery(adminMetaIgnoredQueryOptions);
}

/** A `(provider, externalId)` pair, the key the event ignore list uses. */
export interface MetaSourceKey {
  provider: string;
  externalId: string;
}

/** The deck ignore list's key, which needs the source's event id too. */
export interface MetaDeckSourceKey extends MetaSourceKey {
  eventExternalId: string;
}

const unignoreMetaEventFn = createServerFn({ method: "POST" })
  .validator((input: MetaSourceKey) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCandidatesContract, context.cookie).unignoreEvent(data);
  });

/**
 * Lets an ignored event key be staged again by the next upload.
 *
 * @returns The mutation.
 */
export function useUnignoreMetaCandidateEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: MetaSourceKey) => unignoreMetaEventFn({ data: vars }),
    invalidates: [queryKeys.admin.meta.ignored],
  });
}

const unignoreMetaDeckFn = createServerFn({ method: "POST" })
  .validator((input: MetaDeckSourceKey) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCandidatesContract, context.cookie).unignoreDeck(data);
  });

/**
 * Lets an ignored deck key be staged again by the next upload.
 *
 * @returns The mutation.
 */
export function useUnignoreMetaCandidateDeck() {
  return useMutationWithInvalidation({
    mutationFn: (vars: MetaDeckSourceKey) => unignoreMetaDeckFn({ data: vars }),
    invalidates: [queryKeys.admin.meta.ignored],
  });
}
