import type {
  MetaEventDrift,
  MetaEventMatchSuggestion,
  MetaOverlayBulkAcceptResult,
  MetaOverlayQueueRow,
  MetaOverlayReviewResult,
  MetaPlayerMatchSuggestion,
  MetaUploadBody,
  MetaUploadResponse,
  MetaUploadRevertResult,
  MetaUploadSummary,
} from "@openrift/shared";
import { adminMetaCandidatesContract } from "@openrift/shared/contracts/admin/meta";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// The Meta Archive's overlay queue and drift view (ADR-014 revision 3),
// full-admin only. Split out of `use-admin-meta.ts` because reviewing is its
// own surface with its own query keys: the curation hooks there edit the live
// archive directly, these settle what other people proposed.
//
// Every write invalidates the queue AND the live archive keys, because
// accepting or claiming re-promotes the event it touches.

/** Queue, suggestions, live event list, and the public archive. */
const ALL_META_KEYS = [
  queryKeys.admin.meta.overlays,
  queryKeys.admin.meta.events,
  queryKeys.meta.all,
] as const;

/** The above plus the ignore lists, for the writes that touch them. */
const ALL_META_KEYS_WITH_IGNORED = [...ALL_META_KEYS, queryKeys.admin.meta.ignoredSources] as const;

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

const fetchMetaOverlays = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<{ overlays: MetaOverlayQueueRow[] }> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).list(),
  );

export const adminMetaOverlaysQueryOptions = queryOptions({
  queryKey: queryKeys.admin.meta.overlays,
  queryFn: () => fetchMetaOverlays(),
  staleTime: 5 * 60 * 1000,
});

/**
 * Every pending overlay, oldest first, with the fields it claims and the live
 * values those would replace.
 *
 * @returns The suspense query holding the review queue.
 */
export function useAdminMetaOverlays() {
  return useSuspenseQuery(adminMetaOverlaysQueryOptions);
}

// ---------------------------------------------------------------------------
// Drift
// ---------------------------------------------------------------------------

const fetchMetaEventDrift = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .validator((id: string) => id)
  .handler(({ context, data }): Promise<MetaEventDrift> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).drift({ id: data }),
  );

/**
 * What each linked mirror published for one event, beside the live values.
 *
 * A field an accepted overlay claims comes back flagged rather than compared:
 * the sources no longer decide it, so the UI greys them instead of showing a
 * conflict the reviewer cannot usefully act on.
 *
 * @param metaEventId - The event being inspected.
 * @param enabled - False while the panel is collapsed, which is most of the
 *   time: drift is a join across every linked mirror and nothing reads it until
 *   the disclosure is opened.
 * @returns The query holding the drift view.
 */
export function useMetaEventDrift(metaEventId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.admin.meta.events, metaEventId, "drift"],
    queryFn: () => fetchMetaEventDrift({ data: metaEventId }),
    enabled,
    staleTime: 60 * 1000,
  });
}

const writeEventOverlayFieldsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator(
    (input: ContractInput<typeof adminMetaCandidatesContract, "writeEventOverlayFields">) => input,
  )
  .handler(({ context, data }): Promise<MetaOverlayReviewResult> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).writeEventOverlayFields(data),
  );

/**
 * Claims event fields for the archive.
 *
 * The admin's correction is born accepted, so this lands and re-promotes in one
 * call: each named field flips to overlay-owned and no source wins it again.
 * Only the fields the admin actually changed are sent — claiming everything at
 * once is indistinguishable from turning the sources off.
 *
 * @returns The mutation.
 */
export function useWriteMetaEventOverlayFields() {
  return useMutationWithInvalidation({
    mutationFn: (
      input: ContractInput<typeof adminMetaCandidatesContract, "writeEventOverlayFields">,
    ) => writeEventOverlayFieldsFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

const releaseEventOverlayFieldFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator(
    (input: ContractInput<typeof adminMetaCandidatesContract, "releaseEventOverlayField">) => input,
  )
  .handler(({ context, data }): Promise<MetaOverlayReviewResult> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).releaseEventOverlayField(data),
  );

/**
 * Hands one claimed field back to the sources, so the next promote lets the
 * winning source decide it again.
 *
 * @returns The mutation.
 */
export function useReleaseMetaEventOverlayField() {
  return useMutationWithInvalidation({
    mutationFn: (
      input: ContractInput<typeof adminMetaCandidatesContract, "releaseEventOverlayField">,
    ) => releaseEventOverlayFieldFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

const writePlayerOverlayFieldsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator(
    (input: ContractInput<typeof adminMetaCandidatesContract, "writePlayerOverlayFields">) => input,
  )
  .handler(({ context, data }): Promise<MetaOverlayReviewResult> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).writePlayerOverlayFields(data),
  );

/**
 * Claims standings fields for the archive, mirroring
 * {@link useWriteMetaEventOverlayFields}. `list` is three-valued: absent says
 * nothing about the deck, an object claims those cards, and null claims that
 * there is no list — which is what makes a detach survive a source that keeps
 * publishing one.
 *
 * @returns The mutation.
 */
export function useWritePlayerOverlayFields() {
  return useMutationWithInvalidation({
    mutationFn: (
      input: ContractInput<typeof adminMetaCandidatesContract, "writePlayerOverlayFields">,
    ) => writePlayerOverlayFieldsFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

const releasePlayerOverlayFieldFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator(
    (input: ContractInput<typeof adminMetaCandidatesContract, "releasePlayerOverlayField">) =>
      input,
  )
  .handler(({ context, data }): Promise<MetaOverlayReviewResult> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).releasePlayerOverlayField(data),
  );

/**
 * Hands one claimed standings field back to the sources. Releasing `cards` or
 * `listStatus` releases both, so a caller names either one.
 *
 * @returns The mutation.
 */
export function useReleasePlayerOverlayField() {
  return useMutationWithInvalidation({
    mutationFn: (
      input: ContractInput<typeof adminMetaCandidatesContract, "releasePlayerOverlayField">,
    ) => releasePlayerOverlayFieldFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

const setSourcePriorityFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator(
    (input: ContractInput<typeof adminMetaCandidatesContract, "setSourcePriority">) => input,
  )
  .handler(({ context, data }): Promise<void> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).setSourcePriority(data),
  );

/** Reorders the mirrors feeding one event. The highest priority wins a contested field. */
export function useSetMetaSourcePriority() {
  return useMutationWithInvalidation({
    mutationFn: (input: ContractInput<typeof adminMetaCandidatesContract, "setSourcePriority">) =>
      setSourcePriorityFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

const acceptEventOverlayFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator(
    (input: ContractInput<typeof adminMetaCandidatesContract, "acceptEventOverlay">) => input,
  )
  .handler(({ context, data }): Promise<MetaOverlayReviewResult> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).acceptEventOverlay(data),
  );

/**
 * Applies an event overlay. `metaEventId` accepts a proposal into an event the
 * archive already has instead of minting a duplicate.
 *
 * @returns The mutation.
 */
export function useAcceptMetaEventOverlay() {
  return useMutationWithInvalidation({
    mutationFn: (input: ContractInput<typeof adminMetaCandidatesContract, "acceptEventOverlay">) =>
      acceptEventOverlayFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

const moveEventOverlayFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator(
    (input: ContractInput<typeof adminMetaCandidatesContract, "moveEventOverlay">) => input,
  )
  .handler(({ context, data }): Promise<MetaOverlayReviewResult> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).moveEventOverlay(data),
  );

export function useMoveMetaEventOverlay() {
  return useMutationWithInvalidation({
    mutationFn: (input: ContractInput<typeof adminMetaCandidatesContract, "moveEventOverlay">) =>
      moveEventOverlayFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

const acceptPlayerOverlayFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator(
    (input: ContractInput<typeof adminMetaCandidatesContract, "acceptPlayerOverlay">) => input,
  )
  .handler(({ context, data }): Promise<MetaOverlayReviewResult> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).acceptPlayerOverlay(data),
  );

export function useAcceptMetaPlayerOverlay() {
  return useMutationWithInvalidation({
    mutationFn: (input: ContractInput<typeof adminMetaCandidatesContract, "acceptPlayerOverlay">) =>
      acceptPlayerOverlayFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

const acceptPlayerOverlaysFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator(
    (input: ContractInput<typeof adminMetaCandidatesContract, "acceptPlayerOverlays">) => input,
  )
  .handler(({ context, data }): Promise<MetaOverlayBulkAcceptResult> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).acceptPlayerOverlays(data),
  );

export function useAcceptMetaPlayerOverlays() {
  return useMutationWithInvalidation({
    mutationFn: (
      input: ContractInput<typeof adminMetaCandidatesContract, "acceptPlayerOverlays">,
    ) => acceptPlayerOverlaysFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

const linkPlayerOverlayFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator(
    (input: ContractInput<typeof adminMetaCandidatesContract, "linkPlayerOverlay">) => input,
  )
  .handler(({ context, data }): Promise<MetaOverlayReviewResult> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).linkPlayerOverlay(data),
  );

/**
 * Anchors a standings overlay to the live row it describes. An already-accepted
 * overlay lands on that row immediately.
 *
 * @returns The mutation.
 */
export function useLinkMetaPlayerOverlay() {
  return useMutationWithInvalidation({
    mutationFn: (input: ContractInput<typeof adminMetaCandidatesContract, "linkPlayerOverlay">) =>
      linkPlayerOverlayFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

const fetchEventUploads = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .validator((id: string) => id)
  .handler(({ context, data }): Promise<{ uploads: MetaUploadSummary[] }> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).eventUploads({ id: data }),
  );

export function useMetaEventUploads(eventId: string) {
  return useQuery({
    queryKey: queryKeys.admin.meta.eventUploads(eventId),
    queryFn: () => fetchEventUploads({ data: eventId }),
    staleTime: 60 * 1000,
  });
}

const revertUploadFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator((input: ContractInput<typeof adminMetaCandidatesContract, "revertUpload">) => input)
  .handler(({ context, data }): Promise<MetaUploadRevertResult> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).revertUpload(data),
  );

export function useRevertMetaUpload() {
  return useMutationWithInvalidation({
    mutationFn: (input: ContractInput<typeof adminMetaCandidatesContract, "revertUpload">) =>
      revertUploadFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

const rejectOverlayFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator((input: ContractInput<typeof adminMetaCandidatesContract, "rejectOverlay">) => input)
  .handler(({ context, data }): Promise<MetaOverlayReviewResult> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).rejectOverlay(data),
  );

/** Rejecting is a status change, so the submitter still sees what happened to it. */
export function useRejectMetaOverlay() {
  return useMutationWithInvalidation({
    mutationFn: (input: ContractInput<typeof adminMetaCandidatesContract, "rejectOverlay">) =>
      rejectOverlayFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

// ---------------------------------------------------------------------------
// Upload and card names
// ---------------------------------------------------------------------------

const uploadMetaOverlaysFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator((body: MetaUploadBody) => body)
  .handler(({ context, data }): Promise<MetaUploadResponse> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).upload(data),
  );

/** The push endpoint, for providers with no crawler of their own. */
export function useUploadMetaOverlays() {
  return useMutationWithInvalidation({
    mutationFn: (body: MetaUploadBody) => uploadMetaOverlaysFn({ data: body }),
    invalidates: ALL_META_KEYS,
  });
}

const resolveNameFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator((input: ContractInput<typeof adminMetaCandidatesContract, "resolveName">) => input)
  .handler(({ context, data }): Promise<{ updated: number }> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).resolveName(data),
  );

/** Points every queued line holding one unmatched name at a card. */
export function useResolveMetaOverlayName() {
  return useMutationWithInvalidation({
    mutationFn: (input: ContractInput<typeof adminMetaCandidatesContract, "resolveName">) =>
      resolveNameFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

// ---------------------------------------------------------------------------
// Dismissed source keys
// ---------------------------------------------------------------------------

const ignoreEventFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator((input: ContractInput<typeof adminMetaCandidatesContract, "ignoreEvent">) => input)
  .handler(({ context, data }): Promise<void> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).ignoreEvent(data),
  );

/**
 * Skips one source event from now on. The overlay itself stays where it is, so
 * the key is what stops the next crawl staging it again.
 *
 * @returns The mutation.
 */
export function useIgnoreMetaSourceEvent() {
  return useMutationWithInvalidation({
    mutationFn: (input: ContractInput<typeof adminMetaCandidatesContract, "ignoreEvent">) =>
      ignoreEventFn({ data: input }),
    invalidates: ALL_META_KEYS_WITH_IGNORED,
  });
}

const ignorePlayerFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator((input: ContractInput<typeof adminMetaCandidatesContract, "ignorePlayer">) => input)
  .handler(({ context, data }): Promise<void> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).ignorePlayer(data),
  );

/** See {@link useIgnoreMetaSourceEvent}; a player key covers only its own event. */
export function useIgnoreMetaSourcePlayer() {
  return useMutationWithInvalidation({
    mutationFn: (input: ContractInput<typeof adminMetaCandidatesContract, "ignorePlayer">) =>
      ignorePlayerFn({ data: input }),
    invalidates: ALL_META_KEYS_WITH_IGNORED,
  });
}

const fetchIgnored = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).listIgnored(),
  );

/** One dismissed source key, as the ignore dialog lists it. */
export interface IgnoredMetaSourceEvent {
  provider: string;
  externalId: string;
  createdAt: string;
}

/** See {@link IgnoredMetaSourceEvent}; a player key is scoped to its event. */
export interface IgnoredMetaSourcePlayer extends IgnoredMetaSourceEvent {
  eventExternalId: string;
}

export function useAdminMetaIgnoredSources() {
  return useQuery({
    queryKey: queryKeys.admin.meta.ignoredSources,
    queryFn: () => fetchIgnored(),
    staleTime: 5 * 60 * 1000,
  });
}

const unignoreEventFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator((input: ContractInput<typeof adminMetaCandidatesContract, "unignoreEvent">) => input)
  .handler(({ context, data }): Promise<void> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).unignoreEvent(data),
  );

export function useUnignoreMetaSourceEvent() {
  return useMutationWithInvalidation({
    mutationFn: (input: ContractInput<typeof adminMetaCandidatesContract, "unignoreEvent">) =>
      unignoreEventFn({ data: input }),
    invalidates: ALL_META_KEYS_WITH_IGNORED,
  });
}

const unignorePlayerFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator((input: ContractInput<typeof adminMetaCandidatesContract, "unignorePlayer">) => input)
  .handler(({ context, data }): Promise<void> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).unignorePlayer(data),
  );

export function useUnignoreMetaSourcePlayer() {
  return useMutationWithInvalidation({
    mutationFn: (input: ContractInput<typeof adminMetaCandidatesContract, "unignorePlayer">) =>
      unignorePlayerFn({ data: input }),
    invalidates: ALL_META_KEYS_WITH_IGNORED,
  });
}

// ---------------------------------------------------------------------------
// Match suggestions
// ---------------------------------------------------------------------------

const fetchEventSuggestions = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .validator((id: string) => id)
  .handler(
    ({ context, data }): Promise<{ suggestions: MetaEventMatchSuggestion[]; windowDays: number }> =>
      apiOrpcClient(adminMetaCandidatesContract, context.cookie).eventMatchSuggestions({
        id: data,
      }),
  );

/**
 * Ranked hints for which live event an overlay describes, never applied
 * automatically. An overlay already on an event is ranked minus that event.
 *
 * @param overlayId - The event overlay being reviewed.
 * @returns The query holding the suggestions and the day window they were
 *   searched over, which is what an empty list needs to explain itself.
 */
export function useMetaEventMatchSuggestions(overlayId: string) {
  return useQuery({
    queryKey: queryKeys.admin.meta.eventSuggestions(overlayId),
    queryFn: () => fetchEventSuggestions({ data: overlayId }),
    staleTime: 60 * 1000,
  });
}

const fetchPlayerSuggestions = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .validator((id: string) => id)
  .handler(({ context, data }): Promise<{ suggestions: MetaPlayerMatchSuggestion[] }> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).playerMatchSuggestions({
      id: data,
    }),
  );

/**
 * See {@link useMetaEventMatchSuggestions}, for standings rows.
 *
 * Every standings overlay in the queue asks, so an upload of a whole top cut
 * opens one request per row.
 *
 * @param overlayId - The standings overlay being reviewed.
 * @returns The query holding the suggestions.
 */
export function useMetaPlayerMatchSuggestions(overlayId: string) {
  return useQuery({
    queryKey: queryKeys.admin.meta.playerSuggestions(overlayId),
    queryFn: () => fetchPlayerSuggestions({ data: overlayId }),
    staleTime: 60 * 1000,
  });
}
