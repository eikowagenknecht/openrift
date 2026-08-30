import type {
  AcceptedMetaEventResponse,
  AcceptedMetaEventWithPlayersResponse,
  AcceptedMetaPlayerResponse,
  MetaCandidateDetail,
  MetaCandidateQueueRow,
  MetaEventLinkResult,
  MetaEventMatchSuggestion,
  MetaPlayerLinkResult,
  MetaPlayerMatchSuggestion,
  MetaUploadBody,
  MetaUploadResponse,
} from "@openrift/shared";
import type {
  MetaEventAcceptField,
  MetaPlayerAcceptField,
} from "@openrift/shared/contracts/admin/meta";
import { adminMetaCandidatesContract } from "@openrift/shared/contracts/admin/meta";
import { isDefinedError, safe } from "@orpc/client";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// The Meta Archive's candidate review queue (ADR-014), full-admin only. Split
// out of `use-admin-meta.ts` because the queue is its own surface with its own
// query keys — the curation hooks there talk to the live archive, these talk to
// staging.
//
// The unit of review is a standings row, not a deck: a candidate carries the
// whole field and a decklist is an optional attachment to one player's row.
//
// Every write invalidates the queue AND the live archive keys: an accept adds
// or edits a live event or standings row, an upload or an ignore reshapes the
// queue, and `checkedAt` changes what the queue's default filter shows.

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
 * Every staged candidate event with its standings and unresolved-name counts.
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
 * Query options for one candidate event, its diff, and all its standings.
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
 * Re-runs card-name matching over every staged list, picking up alias fixes.
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
export type ResolveMetaNameInput = ContractInput<typeof adminMetaCandidatesContract, "resolveName">;

const resolveMetaNameFn = createServerFn({ method: "POST" })
  .validator((input: ResolveMetaNameInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).resolveName(data),
  );

/**
 * Records a card-name alias and rematches every staged list against it.
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

/**
 * What a whole-source accept did. The refusal is a return value rather than a
 * thrown error because it is a question, not a failure: the live event also
 * carries another source's values, and the answer is either "yes, overwrite" —
 * a retry with `overwriteAll` — or "no, take the fields one at a time". Letting
 * it throw would put it in the global error toast, where it reads as a bug and
 * offers the admin nothing to do about it.
 */
export type MetaAcceptEventResult =
  | { status: "accepted"; event: AcceptedMetaEventResponse }
  | { status: "needsOverwriteConfirm"; message: string };

/** The same, for the accept that takes the event's ready standings with it. */
export type MetaAcceptEventWithPlayersResult =
  | { status: "accepted"; event: AcceptedMetaEventWithPlayersResponse }
  | { status: "needsOverwriteConfirm"; message: string };

/** An accept, with the confirmation the multi-source guard asks for. */
export type AcceptMetaEventInput = Partial<
  ContractInput<typeof adminMetaCandidatesContract, "acceptEvent">
> & { id: string };

/**
 * The bulk accept, which additionally decides what to do with a standings-only
 * entry whose legend name matched nothing.
 */
export interface AcceptMetaEventWithPlayersInput extends AcceptMetaEventInput {
  allowUnresolvedLegend?: boolean;
}

const acceptMetaCandidateEventFn = createServerFn({ method: "POST" })
  .validator((input: AcceptMetaEventInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<MetaAcceptEventResult> => {
    const { error, data: event } = await safe(
      apiOrpcClient(adminMetaCandidatesContract, context.cookie).acceptEvent({
        id: data.id,
        overwriteAll: data.overwriteAll ?? false,
      }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "OVERWRITE_NOT_CONFIRMED") {
        return { status: "needsOverwriteConfirm", message: error.message };
      }
      throw error;
    }
    return { status: "accepted", event };
  });

/**
 * Accepts a candidate event into the archive, creating or updating the live row.
 * Resolves with a refusal instead of throwing when a second source feeds the
 * event and the overwrite was not confirmed.
 *
 * @returns The mutation; resolves with the live event, or the refusal to confirm.
 */
export function useAcceptMetaCandidateEvent() {
  return useMutationWithInvalidation<MetaAcceptEventResult, AcceptMetaEventInput>({
    mutationFn: (vars) => acceptMetaCandidateEventFn({ data: vars }),
    invalidates: ALL_META_KEYS,
  });
}

const acceptMetaCandidateEventWithPlayersFn = createServerFn({ method: "POST" })
  .validator((input: AcceptMetaEventWithPlayersInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<MetaAcceptEventWithPlayersResult> => {
    const { error, data: event } = await safe(
      apiOrpcClient(adminMetaCandidatesContract, context.cookie).acceptEventWithPlayers({
        id: data.id,
        overwriteAll: data.overwriteAll ?? false,
        allowUnresolvedLegend: data.allowUnresolvedLegend ?? false,
      }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "OVERWRITE_NOT_CONFIRMED") {
        return { status: "needsOverwriteConfirm", message: error.message };
      }
      throw error;
    }
    return { status: "accepted", event };
  });

/**
 * Accepts a candidate event together with every standings row under it that is
 * ready.
 *
 * @returns The mutation; resolves with the accepted and skipped rows, or the
 *   refusal to confirm.
 */
export function useAcceptMetaCandidateEventWithPlayers() {
  return useMutationWithInvalidation<
    MetaAcceptEventWithPlayersResult,
    AcceptMetaEventWithPlayersInput
  >({
    mutationFn: (vars) => acceptMetaCandidateEventWithPlayersFn({ data: vars }),
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
 * Hides a candidate event from the queue and skips its key on every future
 * upload. The staged row and its live link survive, so un-ignoring brings the
 * same candidate back rather than staging a duplicate.
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
// Standings-row review actions
// ---------------------------------------------------------------------------

/**
 * Accepting one candidate standings row. `allowUnresolvedLegend` files an entry
 * whose legend name matched nothing: the archive still knows who played and how
 * they finished, and the alternative is a silent hole in the play-rate stats.
 */
export interface AcceptMetaPlayerInput {
  id: string;
  allowUnresolvedLegend?: boolean;
}

const acceptMetaCandidatePlayerFn = createServerFn({ method: "POST" })
  .validator((input: AcceptMetaPlayerInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<AcceptedMetaPlayerResponse> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).acceptPlayer({
      id: data.id,
      allowUnresolvedLegend: data.allowUnresolvedLegend ?? false,
    }),
  );

/**
 * Files one candidate standings row under its already-accepted event, with the
 * decklist it carries when it has one.
 *
 * @returns The mutation; resolves with the live row's id and any deck it made.
 */
export function useAcceptMetaCandidatePlayer() {
  return useMutationWithInvalidation<AcceptedMetaPlayerResponse, AcceptMetaPlayerInput>({
    mutationFn: (vars) => acceptMetaCandidatePlayerFn({ data: vars }),
    invalidates: ALL_META_KEYS,
  });
}

const checkMetaCandidatePlayerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; checked: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCandidatesContract, context.cookie).checkPlayer(data);
  });

/**
 * Marks a candidate standings row reviewed, or unmarks it.
 *
 * @returns The mutation.
 */
export function useCheckMetaCandidatePlayer() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string; checked: boolean }) =>
      checkMetaCandidatePlayerFn({ data: vars }),
    invalidates: [queryKeys.admin.meta.candidates],
  });
}

const ignoreMetaCandidatePlayerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCandidatesContract, context.cookie).ignorePlayer({ id: data.id });
  });

/**
 * Hides a candidate standings row from the queue and skips its key on every
 * future upload. The staged row survives, so un-ignoring brings it back.
 *
 * @returns The mutation.
 */
export function useIgnoreMetaCandidatePlayer() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string }) => ignoreMetaCandidatePlayerFn({ data: vars }),
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
 * One ignored standings-row key. Player ids restart per event at the source, so
 * an ignored row names the event it belongs to as well.
 */
export interface IgnoredMetaCandidatePlayer extends IgnoredMetaCandidate {
  eventExternalId: string;
}

const fetchIgnoredMetaCandidates = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({
      context,
    }): Promise<{
      events: IgnoredMetaCandidate[];
      players: IgnoredMetaCandidatePlayer[];
    }> => apiOrpcClient(adminMetaCandidatesContract, context.cookie).listIgnored(),
  );

const adminMetaIgnoredQueryOptions = queryOptions({
  queryKey: queryKeys.admin.meta.ignored,
  queryFn: () => fetchIgnoredMetaCandidates(),
  staleTime: 5 * 60 * 1000,
});

/**
 * The ignored event and standings-row keys, which the queue hides and uploads
 * skip. A plain query, not a suspense one: it is opened from a dialog, so there
 * is no route loader to warm it and no sensible boundary to suspend against.
 *
 * @returns The query holding both ignore lists.
 */
export function useAdminMetaIgnoredCandidates() {
  return useQuery(adminMetaIgnoredQueryOptions);
}

/** A `(provider, externalId)` pair, the key the event ignore list uses. */
export type MetaSourceKey = ContractInput<typeof adminMetaCandidatesContract, "unignoreEvent">;

/** The standings-row ignore list's key, which needs the source's event id too. */
export interface MetaPlayerSourceKey extends MetaSourceKey {
  eventExternalId: string;
}

const unignoreMetaEventFn = createServerFn({ method: "POST" })
  .validator((input: MetaSourceKey) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCandidatesContract, context.cookie).unignoreEvent(data);
  });

/**
 * Puts an ignored event key back in the queue.
 *
 * @returns The mutation.
 */
export function useUnignoreMetaCandidateEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: MetaSourceKey) => unignoreMetaEventFn({ data: vars }),
    invalidates: ALL_META_KEYS_WITH_IGNORED,
  });
}

const unignoreMetaPlayerFn = createServerFn({ method: "POST" })
  .validator((input: MetaPlayerSourceKey) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCandidatesContract, context.cookie).unignorePlayer(data);
  });

/**
 * Puts an ignored standings-row key back in the queue.
 *
 * @returns The mutation.
 */
export function useUnignoreMetaCandidatePlayer() {
  return useMutationWithInvalidation({
    mutationFn: (vars: MetaPlayerSourceKey) => unignoreMetaPlayerFn({ data: vars }),
    invalidates: ALL_META_KEYS_WITH_IGNORED,
  });
}

// ---------------------------------------------------------------------------
// Linking (ADR-014, multi-source)
// ---------------------------------------------------------------------------
// Separate from accepting on purpose: a source whose field values were rejected
// still contributed, usually its standings, so the link — and the citation the
// API writes with it — must not depend on taking any of them.

const linkMetaCandidateEventFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; metaEventId: string; relink: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaEventLinkResult> => {
    const client = apiOrpcClient(adminMetaCandidatesContract, context.cookie);
    const body = { id: data.id, metaEventId: data.metaEventId };
    if (data.relink) {
      return client.relinkCandidateEvent(body);
    }
    return client.linkCandidateEvent(body);
  });

/** Which verb a link action uses: `relink` moves a candidate that already has one. */
export type LinkMetaEventInput = ContractInput<
  typeof adminMetaCandidatesContract,
  "linkCandidateEvent"
> & {
  /** True when the candidate is already linked, since `link` refuses that. */
  relink?: boolean;
};

/**
 * Points a candidate event at a live event, or moves an existing link.
 *
 * @returns The mutation; resolves with the live event it now points at.
 */
export function useLinkMetaCandidateEvent() {
  return useMutationWithInvalidation<MetaEventLinkResult, LinkMetaEventInput>({
    mutationFn: (vars) =>
      linkMetaCandidateEventFn({
        data: { id: vars.id, metaEventId: vars.metaEventId, relink: vars.relink ?? false },
      }),
    invalidates: ALL_META_KEYS,
  });
}

const unlinkMetaCandidateEventFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaEventLinkResult> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).unlinkCandidateEvent({
      id: data.id,
    }),
  );

/**
 * Detaches a candidate event from its live event, which also removes that
 * provider's citation. No field value on the live event changes.
 *
 * @returns The mutation.
 */
export function useUnlinkMetaCandidateEvent() {
  return useMutationWithInvalidation<MetaEventLinkResult, { id: string }>({
    mutationFn: (vars) => unlinkMetaCandidateEventFn({ data: vars }),
    invalidates: ALL_META_KEYS,
  });
}

const linkMetaCandidatePlayerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; metaEventPlayerId: string; relink: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaPlayerLinkResult> => {
    const client = apiOrpcClient(adminMetaCandidatesContract, context.cookie);
    const body = { id: data.id, metaEventPlayerId: data.metaEventPlayerId };
    if (data.relink) {
      return client.relinkCandidatePlayer(body);
    }
    return client.linkCandidatePlayer(body);
  });

/** A candidate row may only link to a standings row inside its own live event. */
export interface LinkMetaPlayerInput {
  id: string;
  metaEventPlayerId: string;
  relink?: boolean;
}

/**
 * Points a candidate standings row at a live one, or moves an existing link.
 *
 * @returns The mutation; resolves with the live row it now points at.
 */
export function useLinkMetaCandidatePlayer() {
  return useMutationWithInvalidation<MetaPlayerLinkResult, LinkMetaPlayerInput>({
    mutationFn: (vars) =>
      linkMetaCandidatePlayerFn({
        data: {
          id: vars.id,
          metaEventPlayerId: vars.metaEventPlayerId,
          relink: vars.relink ?? false,
        },
      }),
    invalidates: ALL_META_KEYS,
  });
}

const unlinkMetaCandidatePlayerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaPlayerLinkResult> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).unlinkCandidatePlayer({
      id: data.id,
    }),
  );

/**
 * Detaches a candidate standings row from the live one.
 *
 * @returns The mutation.
 */
export function useUnlinkMetaCandidatePlayer() {
  return useMutationWithInvalidation<MetaPlayerLinkResult, { id: string }>({
    mutationFn: (vars) => unlinkMetaCandidatePlayerFn({ data: vars }),
    invalidates: ALL_META_KEYS,
  });
}

// ---------------------------------------------------------------------------
// Per-field accept (the compare grid's arrow)
// ---------------------------------------------------------------------------
// With two sources on one event, "accept" cannot mean "take all of it": one
// provider would silently revert the other's name on every re-publish.

const acceptMetaEventFieldFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; field: MetaEventAcceptField }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).acceptMetaEventField(data),
  );

/**
 * Writes one source's value into one column of the live event.
 *
 * @returns The mutation; resolves with the live event's id.
 */
export function useAcceptMetaEventField() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string; field: MetaEventAcceptField }) =>
      acceptMetaEventFieldFn({ data: vars }),
    invalidates: ALL_META_KEYS,
  });
}

const acceptMetaPlayerFieldFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; field: MetaPlayerAcceptField }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).acceptMetaPlayerField(data),
  );

/**
 * Writes one source's value into one column of a live standings row.
 *
 * @returns The mutation; resolves with the live row's id.
 */
export function useAcceptMetaPlayerField() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string; field: MetaPlayerAcceptField }) =>
      acceptMetaPlayerFieldFn({ data: vars }),
    // `admin.meta.events` is the prefix of the per-event standings and citation
    // keys, so invalidating it refetches the roster's live rows too.
    invalidates: ALL_META_KEYS,
  });
}

const acceptMetaDeckListFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).acceptMetaDeckList({ id: data.id }),
  );

/**
 * Replaces a standings row's decklist with this source's. Card lists move
 * whole: per-card accept would write `deck_cards` row by row for a marginal
 * gain over taking a list and editing it in the deck editor.
 *
 * @returns The mutation; resolves with the live row's id and its deck's.
 */
export function useAcceptMetaDeckList() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string }) => acceptMetaDeckListFn({ data: vars }),
    invalidates: ALL_META_KEYS,
  });
}

// ---------------------------------------------------------------------------
// Match suggestions
// ---------------------------------------------------------------------------
// Ranked hints for the link action, never applied automatically: a wrong link
// fans two unrelated tournaments onto one page.

const fetchMetaEventSuggestionsFn = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<{ suggestions: MetaEventMatchSuggestion[]; windowDays: number }> =>
      apiOrpcClient(adminMetaCandidatesContract, context.cookie).eventMatchSuggestions({
        id: data.id,
      }),
  );

/**
 * Live events this candidate might describe, best first. Fetched only while the
 * candidate is unlinked — a linked one has nothing to propose.
 *
 * @param candidateId - The candidate event.
 * @param enabled - False once the candidate is linked.
 * @returns The query holding the ranked suggestions and the date window.
 */
export function useMetaEventMatchSuggestions(candidateId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.meta.eventSuggestions(candidateId),
    queryFn: () => fetchMetaEventSuggestionsFn({ data: { id: candidateId } }),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

const fetchMetaPlayerSuggestionsFn = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<{ suggestions: MetaPlayerMatchSuggestion[] }> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).playerMatchSuggestions({
      id: data.id,
    }),
  );

/**
 * Live standings rows inside this candidate's event that its player might be.
 *
 * @param candidatePlayerId - The candidate standings row.
 * @param enabled - False while the row is linked, or its event is not.
 * @returns The query holding the ranked suggestions.
 */
export function useMetaPlayerMatchSuggestions(candidatePlayerId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.meta.playerSuggestions(candidatePlayerId),
    queryFn: () => fetchMetaPlayerSuggestionsFn({ data: { id: candidatePlayerId } }),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}
