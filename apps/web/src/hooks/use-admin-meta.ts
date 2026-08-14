import type { AdminMetaDeck, AdminMetaEvent, DeckZone, MetaListStatus } from "@openrift/shared";
import { adminMetaContract } from "@openrift/shared/contracts/admin/meta";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// Curation endpoints for the Meta Archive (ADR-014), full-admin only. Reads are
// suspense queries the routes warm in their loaders; writes invalidate the event
// list as well as the touched event's deck list, because every deck write moves
// the event row's deck count.

/** One card row in a deck write. Built by the admin form's import parse. */
interface MetaDeckCardInput {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  preferredPrintingId?: string | null;
}

/** The body the create and update event endpoints share. */
export interface MetaEventInput {
  slug: string;
  name: string;
  eventDate: string;
  format: string;
  playerCount?: number | null;
  organizer?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const fetchMetaEvents = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<{ events: AdminMetaEvent[] }> =>
    apiOrpcClient(adminMetaContract, context.cookie).listEvents(),
  );

export const adminMetaEventsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.meta.events,
  queryFn: () => fetchMetaEvents(),
  staleTime: 5 * 60 * 1000,
});

/**
 * Every archived event with its deck count.
 *
 * @returns The suspense query holding the admin event list.
 */
export function useAdminMetaEvents() {
  return useSuspenseQuery(adminMetaEventsQueryOptions);
}

const createMetaEventFn = createServerFn({ method: "POST" })
  .validator((input: MetaEventInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminMetaContract, context.cookie).createEvent(data),
  );

/**
 * Creates an event.
 *
 * @returns The mutation; resolves with the created event row.
 */
export function useCreateMetaEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: MetaEventInput) => createMetaEventFn({ data: vars }),
    invalidates: [queryKeys.admin.meta.events, queryKeys.meta.all],
  });
}

const updateMetaEventFn = createServerFn({ method: "POST" })
  .validator((input: { id: string } & Partial<MetaEventInput>) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaContract, context.cookie).updateEvent(data);
  });

/**
 * Updates an event. Fields left out keep their stored value.
 *
 * @returns The mutation.
 */
export function useUpdateMetaEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string } & Partial<MetaEventInput>) =>
      updateMetaEventFn({ data: vars }),
    invalidates: [queryKeys.admin.meta.events, queryKeys.meta.all],
  });
}

const deleteMetaEventFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaContract, context.cookie).deleteEvent({ id: data.id });
  });

/**
 * Deletes an event and the decks archived under it.
 *
 * @returns The mutation.
 */
export function useDeleteMetaEvent() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => deleteMetaEventFn({ data: { id } }),
    invalidates: (id) => [
      queryKeys.admin.meta.events,
      queryKeys.admin.meta.eventDecks(id),
      queryKeys.meta.all,
    ],
  });
}

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

const fetchMetaEventDecks = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<{ decks: AdminMetaDeck[] }> =>
    apiOrpcClient(adminMetaContract, context.cookie).eventDecks({ id: data.id }),
  );

/**
 * Query options for one event's archived decks, best finish first.
 *
 * @param eventId - The event whose decks to load.
 * @returns The query options.
 */
export function adminMetaEventDecksQueryOptions(eventId: string) {
  return queryOptions({
    queryKey: queryKeys.admin.meta.eventDecks(eventId),
    queryFn: () => fetchMetaEventDecks({ data: { id: eventId } }),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * One event's archived decks.
 *
 * @param eventId - The event whose decks to load.
 * @returns The suspense query holding the deck list.
 */
export function useAdminMetaEventDecks(eventId: string) {
  return useSuspenseQuery(adminMetaEventDecksQueryOptions(eventId));
}

/** Everything `createDeck` needs: the metadata plus the resolved card rows. */
export interface CreateMetaDeckInput {
  eventId: string;
  name: string;
  format: string;
  cards: MetaDeckCardInput[];
  playerName: string;
  finishTier: number;
  record?: string | null;
  /** Defaults to `"full"` server-side; `"archetype"` mints no share token. */
  listStatus?: MetaListStatus;
}

const createMetaDeckFn = createServerFn({ method: "POST" })
  .validator((input: CreateMetaDeckInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminMetaContract, context.cookie).createDeck(data),
  );

/**
 * Archives a deck under an event.
 *
 * @returns The mutation; resolves with the new deck's id and share token.
 */
export function useCreateMetaDeck() {
  return useMutationWithInvalidation({
    mutationFn: (vars: CreateMetaDeckInput) => createMetaDeckFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.admin.meta.eventDecks(vars.eventId),
      queryKeys.admin.meta.events,
      queryKeys.meta.all,
    ],
  });
}

/**
 * An archived deck's editable fields. `eventId` is not sent — it only scopes the
 * cache invalidation to the list the row is shown in. Omitting `cards` keeps the
 * stored card list; passing one replaces it wholesale.
 */
export interface UpdateMetaDeckInput {
  id: string;
  eventId: string;
  name?: string;
  playerName?: string;
  finishTier?: number;
  record?: string | null;
  cards?: MetaDeckCardInput[];
  /** Promoting out of `"archetype"` alongside a real list is what mints the permalink. */
  listStatus?: MetaListStatus;
}

const updateMetaDeckFn = createServerFn({ method: "POST" })
  .validator((input: Omit<UpdateMetaDeckInput, "eventId">) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaContract, context.cookie).updateDeck(data);
  });

/**
 * Updates an archived deck's metadata, and its cards when a new list is passed.
 *
 * @returns The mutation.
 */
export function useUpdateMetaDeck() {
  return useMutationWithInvalidation({
    mutationFn: ({ eventId: _eventId, ...rest }: UpdateMetaDeckInput) =>
      updateMetaDeckFn({ data: rest }),
    invalidates: (vars) => [
      queryKeys.admin.meta.eventDecks(vars.eventId),
      queryKeys.admin.meta.events,
      queryKeys.meta.all,
    ],
  });
}

const deleteMetaDeckFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaContract, context.cookie).deleteDeck({ id: data.id });
  });

/**
 * Removes a deck from the archive.
 *
 * @returns The mutation.
 */
export function useDeleteMetaDeck() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string; eventId: string }) =>
      deleteMetaDeckFn({ data: { id: vars.id } }),
    invalidates: (vars) => [
      queryKeys.admin.meta.eventDecks(vars.eventId),
      queryKeys.admin.meta.events,
      queryKeys.meta.all,
    ],
  });
}
