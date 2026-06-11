import type {
  DeckCheckEntryDetailResponse,
  DeckCheckEventDetailResponse,
  DeckCheckEventListResponse,
  DeckCheckEventSummaryResponse,
  DeckCheckKeyMintedResponse,
  DeckCheckKeysResponse,
} from "@openrift/shared";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

/** Multi-judge shared state is polled; this is the reconcile cadence. */
const POLL_INTERVAL_MS = 5000;

// ── Server functions: queries ───────────────────────────────────────────────

const fetchDeckCheckEvents = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: slug }): Promise<DeckCheckEventListResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].checks.$get({
          param: encodeParams({ slug }),
        }),
        "Couldn't load deck checks",
      ),
  );

const fetchDeckCheckEvent = createServerFn({ method: "GET" })
  .validator((input: { slug: string; eventId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEventDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].checks[":eventId"].$get({
          param: encodeParams({ slug: data.slug, eventId: data.eventId }),
        }),
        "Couldn't load the event",
      ),
  );

const fetchDeckCheckEntry = createServerFn({ method: "GET" })
  .validator((input: { slug: string; eventId: string; entryId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].checks[":eventId"].entries[
          ":entryId"
        ].$get({
          param: encodeParams({ slug: data.slug, eventId: data.eventId, entryId: data.entryId }),
        }),
        "Couldn't load the entry",
      ),
  );

const fetchDeckCheckKeys = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: slug }): Promise<DeckCheckKeysResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"]["deck-check-keys"].$get({
          param: encodeParams({ slug }),
        }),
        "Couldn't load push keys",
      ),
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
 * Polls so concurrent judges' ticks and verdicts reconcile.
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
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].checks.$post({
          param: encodeParams({ slug: data.slug }),
          json: {
            name: data.name,
            eventDate: data.eventDate,
            format: data.format,
            allowedSets: data.allowedSets,
          },
        }),
        "Couldn't create the event",
      ),
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
    }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEventSummaryResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].checks[":eventId"].$patch({
          param: encodeParams({ slug: data.slug, eventId: data.eventId }),
          json: {
            name: data.name,
            eventDate: data.eventDate,
            format: data.format,
            allowedSets: data.allowedSets,
            status: data.status,
          },
        }),
        "Couldn't update the event",
      ),
  );

const deleteEventFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; eventId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].checks[":eventId"].$delete({
        param: encodeParams({ slug: data.slug, eventId: data.eventId }),
      }),
      "Couldn't delete the event",
    );
  });

const reResolveEventFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; eventId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<{ updatedLines: number }> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].checks[":eventId"][
          "re-resolve"
        ].$post({ param: encodeParams({ slug: data.slug, eventId: data.eventId }) }),
        "Couldn't re-resolve cards",
      ),
  );

const setVerdictFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      slug: string;
      eventId: string;
      entryId: string;
      checkStatus: "unchecked" | "checked" | "issue";
      notes?: string | null;
    }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].checks[":eventId"].entries[
          ":entryId"
        ].verdict.$put({
          param: encodeParams({ slug: data.slug, eventId: data.eventId, entryId: data.entryId }),
          json: { checkStatus: data.checkStatus, notes: data.notes },
        }),
        "Couldn't store the verdict",
      ),
  );

const updateEntryFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      slug: string;
      eventId: string;
      entryId: string;
      playerName?: string;
      playerEmail?: string | null;
      playerHandle?: string | null;
    }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].checks[":eventId"].entries[
          ":entryId"
        ].$patch({
          param: encodeParams({ slug: data.slug, eventId: data.eventId, entryId: data.entryId }),
          json: {
            playerName: data.playerName,
            playerEmail: data.playerEmail,
            playerHandle: data.playerHandle,
          },
        }),
        "Couldn't update the player",
      ),
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
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].checks[":eventId"].entries[
          ":entryId"
        ].cards.$post({
          param: encodeParams({ slug: data.slug, eventId: data.eventId, entryId: data.entryId }),
          json: { name: data.name, quantity: data.quantity, section: data.section },
        }),
        "Couldn't add the card",
      ),
  );

const renameCardFn = createServerFn({ method: "POST" })
  .validator(
    (input: { slug: string; eventId: string; entryId: string; cardId: string; name: string }) =>
      input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckEntryDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].checks[":eventId"].entries[
          ":entryId"
        ].cards[":cardId"].$patch({
          param: encodeParams({
            slug: data.slug,
            eventId: data.eventId,
            entryId: data.entryId,
            cardId: data.cardId,
          }),
          json: { name: data.name },
        }),
        "Couldn't fix the card",
      ),
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
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].checks[":eventId"].entries[
        ":entryId"
      ].cards[":cardId"].copies[":copyIndex"].$delete({
        param: encodeParams({
          slug: data.slug,
          eventId: data.eventId,
          entryId: data.entryId,
          cardId: data.cardId,
          copyIndex: String(data.copyIndex),
        }),
      }),
      "Couldn't remove the card",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"].checks[":eventId"].entries[
        ":entryId"
      ].cards[":cardId"].$put({
        param: encodeParams({
          slug: data.slug,
          eventId: data.eventId,
          entryId: data.entryId,
          cardId: data.cardId,
        }),
        json: { copyIndex: data.copyIndex, found: data.found },
      }),
      "Couldn't store the tick",
    );
  });

const mintKeyFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckCheckKeyMintedResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["friend-groups"][":slug"]["deck-check-keys"].$post({
          param: encodeParams({ slug: data.slug }),
          json: { label: data.label },
        }),
        "Couldn't mint a push key",
      ),
  );

const renameKeyFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; keyId: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"]["deck-check-keys"][
        ":keyId"
      ].$patch({
        param: encodeParams({ slug: data.slug, keyId: data.keyId }),
        json: { label: data.label },
      }),
      "Couldn't rename the key",
    );
  });

const revokeKeyFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; keyId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1["friend-groups"][":slug"]["deck-check-keys"][
        ":keyId"
      ].$delete({ param: encodeParams({ slug: data.slug, keyId: data.keyId }) }),
      "Couldn't revoke the key",
    );
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

export function useSetDeckCheckVerdict() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: Parameters<typeof setVerdictFn>[0]["data"]) => setVerdictFn({ data: vars }),
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
