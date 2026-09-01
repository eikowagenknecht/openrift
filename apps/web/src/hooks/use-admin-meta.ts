import type {
  AdminMetaEvent,
  AdminMetaEventList,
  AdminMetaEventSource,
  AdminMetaPlayer,
  DeckZone,
  META_EVENT_SORT_DIRECTIONS,
  META_EVENT_SORTS,
  MetaEventSourceFilter,
  MetaListStatus,
} from "@openrift/shared";
import { adminMetaContract } from "@openrift/shared/contracts/admin/meta";
import { keepPreviousData, queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// Curation endpoints for the Meta Archive (ADR-014), full-admin only. The unit
// of curation is a standings row and a decklist is an optional attachment to it,
// so the writes here create and edit players. Reads are suspense queries the
// routes warm in their loaders; writes invalidate the event list as well as the
// touched event's standings, because every write moves the event row's counts.

/** A column the live event list can be ordered by. */
export type AdminMetaEventSort = (typeof META_EVENT_SORTS)[number];

/** Which way that column runs. */
export type AdminMetaEventSortDirection = (typeof META_EVENT_SORT_DIRECTIONS)[number];

/** One card row in a decklist write. Built by the admin form's import parse. */
interface MetaDeckCardInput {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  preferredPrintingId?: string | null;
}

/**
 * The decklist attached to a standings row. Present creates or replaces the
 * archived deck; `null` on an update detaches and deletes it.
 */
export interface MetaPlayerListInput {
  name: string;
  format: string;
  formatConfig?: Record<string, unknown> | null;
  cards: MetaDeckCardInput[];
  /** `"none"` is not one of these: a list that exists is at least partial. */
  listStatus?: Exclude<MetaListStatus, "none">;
}

/** The body the create and update event endpoints share. */
export type MetaEventInput = ContractInput<typeof adminMetaContract, "createEvent">;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Rows per page on the live event table. */
export const ADMIN_META_EVENT_PAGE_SIZE = 50;

/** The filters and 1-based page that select one page of the live archive. */
export interface AdminMetaEventQueryParams {
  page: number;
  search?: string;
  format?: string;
  source?: MetaEventSourceFilter;
  dateFrom?: string;
  dateTo?: string;
  /** Only ever true or absent — see the note in the fetcher. */
  incompleteStandings?: boolean;
  /** Only ever true or absent — see the note in the fetcher. */
  noDecks?: boolean;
  sort?: AdminMetaEventSort;
  direction?: AdminMetaEventSortDirection;
}

/** The order the Public tab falls back to when the URL names none. */
export const META_EVENT_SORT_FALLBACK = {
  sort: "eventDate",
  direction: "desc",
} as const satisfies { sort: AdminMetaEventSort; direction: AdminMetaEventSortDirection };

/**
 * Resolves the /admin/meta search into the events-list query input. The route
 * loader and the Public tab must build the identical key, or a warmed page
 * misses the component's cache lookup and the tab suspends on first paint.
 */
export function metaEventsParamsFromSearch(search: {
  page?: number;
  q?: string;
  liveFormat?: string;
  liveSource?: MetaEventSourceFilter;
  dateFrom?: string;
  dateTo?: string;
  incompleteStandings?: boolean;
  noDecks?: boolean;
  liveSort?: AdminMetaEventSort;
  liveDir?: AdminMetaEventSortDirection;
}): AdminMetaEventQueryParams {
  return {
    page: search.page ?? 1,
    search: search.q,
    format: search.liveFormat,
    source: search.liveSource,
    dateFrom: search.dateFrom,
    dateTo: search.dateTo,
    incompleteStandings: search.incompleteStandings,
    noDecks: search.noDecks,
    sort: search.liveSort ?? META_EVENT_SORT_FALLBACK.sort,
    direction: search.liveDir ?? META_EVENT_SORT_FALLBACK.direction,
  };
}

const fetchMetaEvents = createServerFn({ method: "GET" })
  .validator((input: AdminMetaEventQueryParams) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<AdminMetaEventList> =>
    apiOrpcClient(adminMetaContract, context.cookie).listEvents({
      page: data.page,
      limit: ADMIN_META_EVENT_PAGE_SIZE,
      search: data.search,
      format: data.format,
      source: data.source,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      sort: data.sort,
      direction: data.direction,
      // The flag filters are coerced from query strings on the way in, and
      // "false" coerces to true, so an off toggle has to be absent rather than
      // false.
      incompleteStandings: data.incompleteStandings === true ? true : undefined,
      noDecks: data.noDecks === true ? true : undefined,
    }),
  );

/**
 * Query options for one filtered page of the live archive.
 *
 * @param params - The page and its filters.
 * @returns The query options.
 */
export function adminMetaEventsQueryOptions(params: AdminMetaEventQueryParams) {
  return queryOptions({
    queryKey: queryKeys.admin.meta.eventList(params),
    queryFn: () => fetchMetaEvents({ data: params }),
    // Paging and filtering keep the previous rows on screen, so the table never
    // blinks back to empty between pages.
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * One filtered page of archived events with their standings and deck counts.
 *
 * @param params - The page and its filters.
 * @returns The suspense query holding the page.
 */
export function useAdminMetaEvents(params: AdminMetaEventQueryParams) {
  return useSuspenseQuery(adminMetaEventsQueryOptions(params));
}

const fetchMetaEvent = createServerFn({ method: "GET" })
  .validator((eventId: string) => eventId)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<AdminMetaEvent> =>
    apiOrpcClient(adminMetaContract, context.cookie).getEvent({ id: data }),
  );

/**
 * Query options for one archived event.
 *
 * @param eventId - The event's id.
 * @returns The query options.
 */
export function adminMetaEventQueryOptions(eventId: string) {
  return queryOptions({
    queryKey: queryKeys.admin.meta.event(eventId),
    queryFn: () => fetchMetaEvent({ data: eventId }),
  });
}

/**
 * One archived event on its own. The list is paged, so a page about a single
 * event reads it here rather than looking for it in whatever page is cached.
 *
 * @param eventId - The event's id.
 * @returns The suspense query holding the event.
 */
export function useAdminMetaEvent(eventId: string) {
  return useSuspenseQuery(adminMetaEventQueryOptions(eventId));
}

/**
 * The live event a candidate is linked to, or undefined while it is unlinked.
 * A plain query rather than a suspense one, since the id only exists once the
 * candidate has been reviewed.
 *
 * @param eventId - The linked event's id, or null while the candidate is loose.
 * @returns The query holding the event.
 */
export function useAdminMetaLinkedEvent(eventId: string | null) {
  return useQuery({ ...adminMetaEventQueryOptions(eventId ?? ""), enabled: eventId !== null });
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
  .validator((input: { id: string; slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaContract, context.cookie).updateEvent(data);
  });

/**
 * Renames an event's slug, which is the only field this endpoint takes: the
 * archive's own facts are corrected as overlays instead, so a re-promote can
 * never silently revert an admin's edit.
 *
 * @returns The mutation.
 */
export function useUpdateMetaEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string; slug: string }) => updateMetaEventFn({ data: vars }),
    invalidates: [queryKeys.admin.meta.events, queryKeys.meta.all],
  });
}

const reclassifyMetaEventsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }) => apiOrpcClient(adminMetaContract, context.cookie).reclassifyEvents());

/**
 * What a reclassify pass moves. It rewrites tier, country and location on the
 * candidates and on the live events they feed, so both review surfaces and the
 * public archive go stale — whether the pass was started from the Reapply
 * button or fell out of a template's tier mapping.
 */
export const reclassifyInvalidates = [
  queryKeys.admin.meta.catalogue,
  queryKeys.admin.meta.events,
  queryKeys.admin.meta.overlays,
  queryKeys.meta.all,
] as const;

/**
 * Re-runs the tier and country rules over the pipeline's candidates and the
 * live events they feed; hand-set values are kept.
 *
 * @returns The mutation; resolves with what the pass changed and kept.
 */
export function useReclassifyMetaEvents() {
  return useMutationWithInvalidation({
    mutationFn: () => reclassifyMetaEventsFn(),
    invalidates: reclassifyInvalidates,
  });
}

const deleteMetaEventFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaContract, context.cookie).deleteEvent({ id: data.id });
  });

/**
 * Deletes an event, its standings, and the decks archived under them.
 *
 * @returns The mutation.
 */
export function useDeleteMetaEvent() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => deleteMetaEventFn({ data: { id } }),
    invalidates: (id) => [
      queryKeys.admin.meta.events,
      queryKeys.admin.meta.eventPlayers(id),
      queryKeys.meta.all,
    ],
  });
}

// ---------------------------------------------------------------------------
// Standings rows
// ---------------------------------------------------------------------------

const fetchMetaEventPlayers = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<{ players: AdminMetaPlayer[] }> =>
    apiOrpcClient(adminMetaContract, context.cookie).eventPlayers({ id: data.id }),
  );

/**
 * Query options for one event's standings, best finish first.
 *
 * @param eventId - The event whose standings to load.
 * @returns The query options.
 */
export function adminMetaEventPlayersQueryOptions(eventId: string) {
  return queryOptions({
    queryKey: queryKeys.admin.meta.eventPlayers(eventId),
    queryFn: () => fetchMetaEventPlayers({ data: { id: eventId } }),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * One event's standings, decks and deckless entries alike.
 *
 * @param eventId - The event whose standings to load.
 * @returns The suspense query holding the standings.
 */
export function useAdminMetaEventPlayers(eventId: string) {
  return useSuspenseQuery(adminMetaEventPlayersQueryOptions(eventId));
}

/** Everything `createPlayer` needs. `list` absent leaves the row standings-only. */
export interface CreateMetaPlayerInput {
  eventId: string;
  playerName: string;
  rank: number;
  rankIsTier?: boolean;
  wins?: number | null;
  losses?: number | null;
  draws?: number | null;
  legendCardId?: string | null;
  championCardId?: string | null;
  list?: MetaPlayerListInput | null;
}

const createMetaPlayerFn = createServerFn({ method: "POST" })
  .validator((input: CreateMetaPlayerInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminMetaContract, context.cookie).createPlayer(data),
  );

/**
 * Adds a standings row to an event, with a decklist when one is known.
 *
 * @returns The mutation; resolves with the row's id and, when a list came with
 *   it, the new deck's id and share token.
 */
export function useCreateMetaPlayer() {
  return useMutationWithInvalidation({
    mutationFn: (vars: CreateMetaPlayerInput) => createMetaPlayerFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.admin.meta.eventPlayers(vars.eventId),
      queryKeys.admin.meta.events,
      queryKeys.meta.all,
    ],
  });
}

const renamePlayerDeckFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; eventId: string; name: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaContract, context.cookie).renamePlayerDeck({
      id: data.id,
      name: data.name,
    });
  });

/**
 * Renames the deck on one standings row.
 *
 * Deliberately not an overlay: promotion preserves deck names, so a rename
 * survives a re-promote on its own and claiming the field would take the whole
 * list out of the sources' hands to change a label.
 *
 * @returns The mutation.
 */
export function useRenamePlayerDeck() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string; eventId: string; name: string }) =>
      renamePlayerDeckFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.admin.meta.eventPlayers(vars.eventId),
      queryKeys.admin.meta.events,
      queryKeys.meta.all,
    ],
  });
}

const deleteMetaPlayerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaContract, context.cookie).deletePlayer({ id: data.id });
  });

/**
 * Removes a standings row, and the deck hanging off it when it has one.
 *
 * @returns The mutation.
 */
export function useDeleteMetaPlayer() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string; eventId: string }) =>
      deleteMetaPlayerFn({ data: { id: vars.id } }),
    invalidates: (vars) => [
      queryKeys.admin.meta.eventPlayers(vars.eventId),
      queryKeys.admin.meta.events,
      queryKeys.meta.all,
    ],
  });
}

// ---------------------------------------------------------------------------
// Source citations
// ---------------------------------------------------------------------------

const fetchMetaEventSources = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<{ sources: AdminMetaEventSource[] }> =>
    apiOrpcClient(adminMetaContract, context.cookie).eventSources({ id: data.id }),
  );

/**
 * Query options for one event's citation list.
 *
 * @param eventId - The event whose citations to load.
 * @returns The query options.
 */
function adminMetaEventSourcesQueryOptions(eventId: string) {
  return queryOptions({
    queryKey: queryKeys.admin.meta.eventSources(eventId),
    queryFn: () => fetchMetaEventSources({ data: { id: eventId } }),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * One event's citations. A plain query, not a suspense one: the editor opens
 * inside a dialog, so no route loader warms it and there is no boundary to
 * suspend against.
 *
 * @param eventId - The event whose citations to load, or null while the dialog
 *   is creating an event that does not exist yet.
 * @returns The query holding the citation list.
 */
export function useAdminMetaEventSources(eventId: string | null) {
  return useQuery({
    ...adminMetaEventSourcesQueryOptions(eventId ?? ""),
    enabled: eventId !== null,
  });
}

/** A hand-entered citation. Provider citations are written by linking, never here. */
export type CreateMetaEventSourceInput = Omit<
  ContractInput<typeof adminMetaContract, "createEventSource">,
  "id"
> & {
  eventId: string;
};

const createMetaEventSourceFn = createServerFn({ method: "POST" })
  .validator((input: CreateMetaEventSourceInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<AdminMetaEventSource> =>
    apiOrpcClient(adminMetaContract, context.cookie).createEventSource({
      id: data.eventId,
      label: data.label,
      sourceUrl: data.sourceUrl ?? null,
    }),
  );

/**
 * Adds a hand-entered citation to an event.
 *
 * @returns The mutation; resolves with the created citation row.
 */
export function useCreateMetaEventSource() {
  return useMutationWithInvalidation<AdminMetaEventSource, CreateMetaEventSourceInput>({
    mutationFn: (vars) => createMetaEventSourceFn({ data: vars }),
    invalidates: (vars) => [queryKeys.admin.meta.eventSources(vars.eventId), queryKeys.meta.all],
  });
}

const deleteMetaEventSourceFn = createServerFn({ method: "POST" })
  .validator((input: { eventId: string; sourceId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaContract, context.cookie).deleteEventSource({
      id: data.eventId,
      sourceId: data.sourceId,
    });
  });

/**
 * Removes a citation. The API refuses a provider row — that one belongs to its
 * candidate's link, and unlinking is what takes it away.
 *
 * @returns The mutation.
 */
export function useDeleteMetaEventSource() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { eventId: string; sourceId: string }) =>
      deleteMetaEventSourceFn({ data: vars }),
    invalidates: (vars) => [queryKeys.admin.meta.eventSources(vars.eventId), queryKeys.meta.all],
  });
}
