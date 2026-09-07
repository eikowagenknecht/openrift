import type {
  MetaCrossSourceReview,
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

/** Every write invalidates the queue and the live archive keys: accepting or claiming re-promotes the event it touches. */
const ALL_META_KEYS = [
  queryKeys.admin.meta.overlays,
  queryKeys.admin.meta.events,
  queryKeys.meta.all,
] as const;

const ALL_META_KEYS_WITH_IGNORED = [...ALL_META_KEYS, queryKeys.admin.meta.ignoredSources] as const;

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

/** Every pending overlay, oldest first, with the fields it claims and the live values those would replace. */
export function useAdminMetaOverlays() {
  return useSuspenseQuery(adminMetaOverlaysQueryOptions);
}

const fetchMetaEventDrift = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .validator((id: string) => id)
  .handler(({ context, data }): Promise<MetaEventDrift> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).drift({ id: data }),
  );

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
 * Only the fields the admin actually changed are sent: claiming everything at
 * once is indistinguishable from turning the sources off.
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

/** Hands one claimed field back to the sources, so the next promote lets the winning source decide it again. */
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

/** `list` is three-valued: absent, an object of claimed cards, or null for "no list" (survives a source that keeps publishing one). */
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

/** Releasing `cards` or `listStatus` releases both; a caller names either one. */
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

const acceptEventOverlayFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator(
    (input: ContractInput<typeof adminMetaCandidatesContract, "acceptEventOverlay">) => input,
  )
  .handler(({ context, data }): Promise<MetaOverlayReviewResult> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).acceptEventOverlay(data),
  );

/** Passing `metaEventId` accepts the proposal into that existing event; omitting it mints a new one. */
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

/** An already-accepted overlay lands on the newly linked row immediately. */
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

export function useRejectMetaOverlay() {
  return useMutationWithInvalidation({
    mutationFn: (input: ContractInput<typeof adminMetaCandidatesContract, "rejectOverlay">) =>
      rejectOverlayFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

const uploadMetaOverlaysFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator((body: MetaUploadBody) => body)
  .handler(({ context, data }): Promise<MetaUploadResponse> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).upload(data),
  );

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

export function useResolveMetaOverlayName() {
  return useMutationWithInvalidation({
    mutationFn: (input: ContractInput<typeof adminMetaCandidatesContract, "resolveName">) =>
      resolveNameFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

const ignoreEventFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator((input: ContractInput<typeof adminMetaCandidatesContract, "ignoreEvent">) => input)
  .handler(({ context, data }): Promise<void> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).ignoreEvent(data),
  );

/** The overlay itself stays where it is; the ignore key stops the next crawl staging it again. */
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

const fetchEventSuggestions = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .validator((id: string) => id)
  .handler(
    ({ context, data }): Promise<{ suggestions: MetaEventMatchSuggestion[]; windowDays: number }> =>
      apiOrpcClient(adminMetaCandidatesContract, context.cookie).eventMatchSuggestions({
        id: data,
      }),
  );

/** Ranked hints only, never applied automatically; an overlay already on an event is ranked minus that event. */
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

/** See {@link useMetaEventMatchSuggestions}, for standings rows; an upload of a whole top cut opens one request per row. */
export function useMetaPlayerMatchSuggestions(overlayId: string) {
  return useQuery({
    queryKey: queryKeys.admin.meta.playerSuggestions(overlayId),
    queryFn: () => fetchPlayerSuggestions({ data: overlayId }),
    staleTime: 60 * 1000,
  });
}

const fetchCrossSourceReview = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .validator((id: string) => id)
  .handler(({ context, data }): Promise<MetaCrossSourceReview> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).crossSourceReview({ id: data }),
  );

export function useMetaCrossSourceReview(metaEventId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.meta.crossSource(metaEventId),
    queryFn: () => fetchCrossSourceReview({ data: metaEventId }),
    enabled,
    staleTime: 60 * 1000,
  });
}

const linkCrossSourcePlayersFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator(
    (input: ContractInput<typeof adminMetaCandidatesContract, "linkCrossSourcePlayers">) => input,
  )
  .handler(({ context, data }): Promise<void> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).linkCrossSourcePlayers(data),
  );

/** One call is one promote; the bulk action sends its whole batch here, not a loop of single calls. */
export function useLinkMetaCrossSourcePlayers() {
  return useMutationWithInvalidation({
    mutationFn: (
      input: ContractInput<typeof adminMetaCandidatesContract, "linkCrossSourcePlayers">,
    ) => linkCrossSourcePlayersFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

const unlinkCrossSourcePlayerFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator(
    (input: ContractInput<typeof adminMetaCandidatesContract, "unlinkCrossSourcePlayer">) => input,
  )
  .handler(({ context, data }): Promise<void> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).unlinkCrossSourcePlayer(data),
  );

/** Takes one decision back, returning the entry to the unreviewed pile. */
export function useUnlinkMetaCrossSourcePlayer() {
  return useMutationWithInvalidation({
    mutationFn: (
      input: ContractInput<typeof adminMetaCandidatesContract, "unlinkCrossSourcePlayer">,
    ) => unlinkCrossSourcePlayerFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}

const setSourceContributesFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .validator(
    (input: ContractInput<typeof adminMetaCandidatesContract, "setSourceContributes">) => input,
  )
  .handler(({ context, data }): Promise<void> =>
    apiOrpcClient(adminMetaCandidatesContract, context.cookie).setSourceContributes(data),
  );

/** Lets a cited mirror be read again, or stops it being read. The event is promoted either way. */
export function useSetMetaSourceContributes() {
  return useMutationWithInvalidation({
    mutationFn: (
      input: ContractInput<typeof adminMetaCandidatesContract, "setSourceContributes">,
    ) => setSourceContributesFn({ data: input }),
    invalidates: ALL_META_KEYS,
  });
}
