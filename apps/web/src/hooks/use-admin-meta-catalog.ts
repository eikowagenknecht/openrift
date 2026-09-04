import type { META_CATALOG_DISPLAY_STATUSES, MetaEventTier } from "@openrift/shared";
import type {
  MetaCancellableJob,
  MetaCatalogListResponse,
  MetaCatalogSort,
  MetaCatalogSortDirection,
  MetaCatalogTriage,
  MetaArchiveJobs,
  MetaSource,
  MetaSourceFormat,
  MetaSourceTemplate,
  MetaSyncCancelResult,
  MetaSyncSettings,
  MetaSyncStatus,
  MetaSyncTriggerResult,
} from "@openrift/shared/contracts/admin/meta-catalog";
import { adminMetaCatalogContract } from "@openrift/shared/contracts/admin/meta-catalog";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// The catalogue mirror and the sync controls (ADR-014). The catalogue holds
// hundreds of thousands of rows, so its list is paged on the server and every
// filter travels with the query key. Accepting a row creates a live event and
// its candidate, which is why the writes here reach past the catalogue into the
// event, candidate and public archive caches.

/** Rows per page on the catalogue table. */
export const META_CATALOG_PAGE_SIZE = 50;

/** The source's own status vocabulary, as the list filter accepts it. */
type MetaCatalogDisplayStatus = (typeof META_CATALOG_DISPLAY_STATUSES)[number];

/** The filters and 1-based page that select one page of the catalogue. */
export interface MetaCatalogQueryParams {
  page: number;
  search?: string;
  triage?: MetaCatalogTriage;
  displayStatus?: MetaCatalogDisplayStatus;
  minPlayers?: number;
  /** Only ever true or absent — see the note in the fetcher. */
  decklistPublished?: boolean;
  /** Only ever true or absent — see the note in the fetcher. */
  missing?: boolean;
  /** Only ever true or absent — see the note in the fetcher. */
  awaitingResults?: boolean;
  dateFrom?: string;
  dateTo?: string;
  sort?: MetaCatalogSort;
  direction?: MetaCatalogSortDirection;
}

const fetchMetaCatalog = createServerFn({ method: "GET" })
  .validator((input: MetaCatalogQueryParams) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaCatalogListResponse> =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).list({
      page: data.page,
      limit: META_CATALOG_PAGE_SIZE,
      search: data.search,
      triage: data.triage,
      displayStatus: data.displayStatus,
      minPlayers: data.minPlayers,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      sort: data.sort,
      direction: data.direction,
      // The two flag filters are coerced from query strings on the way in, and
      // "false" coerces to true, so an off toggle has to be absent rather than
      // false.
      decklistPublished: data.decklistPublished === true ? true : undefined,
      missing: data.missing === true ? true : undefined,
      awaitingResults: data.awaitingResults === true ? true : undefined,
    }),
  );

/**
 * Query options for one filtered page of the catalogue.
 *
 * @param params - The page and its filters.
 * @returns The query options.
 */
function adminMetaCatalogQueryOptions(params: MetaCatalogQueryParams) {
  return queryOptions({
    queryKey: queryKeys.admin.meta.catalogueList(params),
    queryFn: () => fetchMetaCatalog({ data: params }),
    // Paging and filtering keep the previous rows on screen, so triage never
    // blinks back to an empty table between pages.
    placeholderData: keepPreviousData,
  });
}

/**
 * One filtered page of the catalogue, with the unfiltered triage counts.
 *
 * @param params - The page and its filters.
 * @returns The query holding the page.
 */
export function useAdminMetaCatalog(params: MetaCatalogQueryParams) {
  return useQuery(adminMetaCatalogQueryOptions(params));
}

const acceptCatalogEventFn = createServerFn({ method: "POST" })
  .validator((input: { externalId: string; format?: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).accept(data),
  );

/** Every cache an accept moves: the catalogue row, the live event it creates,
 *  the candidate the deep fetch will write into, and the public archive. */
const acceptInvalidates = [
  queryKeys.admin.meta.catalogue,
  queryKeys.admin.meta.syncStatus.prefix,
  queryKeys.admin.meta.events,
  queryKeys.admin.meta.overlays,
  queryKeys.meta.all,
] as const;

/**
 * Accepts a catalogue row into the archive. `format` is required only when the
 * source's own format maps to nothing of ours.
 *
 * @returns The mutation; resolves with the live event and its candidate.
 */
export function useAcceptCatalogEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { externalId: string; format?: string }) =>
      acceptCatalogEventFn({ data: vars }),
    invalidates: acceptInvalidates,
  });
}

const dismissCatalogEventFn = createServerFn({ method: "POST" })
  .validator((input: { externalId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCatalogContract, context.cookie).dismiss(data);
  });

/**
 * Writes the ignore key for a catalogue row, so triage and ingest both skip it.
 *
 * @returns The mutation.
 */
export function useDismissCatalogEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { externalId: string }) => dismissCatalogEventFn({ data: vars }),
    invalidates: [queryKeys.admin.meta.catalogue, queryKeys.admin.meta.ignoredSources],
  });
}

const undismissCatalogEventFn = createServerFn({ method: "POST" })
  .validator((input: { externalId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCatalogContract, context.cookie).undismiss(data);
  });

/**
 * Removes the ignore key, putting the row back in the new queue.
 *
 * @returns The mutation.
 */
export function useUndismissCatalogEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { externalId: string }) => undismissCatalogEventFn({ data: vars }),
    invalidates: [queryKeys.admin.meta.catalogue, queryKeys.admin.meta.ignoredSources],
  });
}

// ---------------------------------------------------------------------------
// Source vocabulary
// ---------------------------------------------------------------------------
// The event templates and format strings the crawl discovers, which the
// maintainer names and maps rather than the code hardcoding. Watching a
// template is what earns an event its badge, its place in the daily poll, and
// the official auto-accept rule, so every write here reaches the catalogue.

const fetchMetaSourceTemplates = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).listTemplates(),
  );

/**
 * Every event template the source publishes, plus any the mirror still carries.
 *
 * @returns The query holding the templates.
 */
export function useMetaSourceTemplates() {
  return useQuery({
    queryKey: queryKeys.admin.meta.sourceTemplates,
    queryFn: () => fetchMetaSourceTemplates(),
  });
}

/** The fields a template edit writes; the name is the source's. */
export interface MetaSourceTemplateInput {
  templateId: string;
  watched?: boolean;
  /** Mapping a tier reclassifies the template's events server-side; null un-maps. */
  tier?: MetaEventTier | null;
}

const updateMetaSourceTemplateFn = createServerFn({ method: "POST" })
  .validator((input: MetaSourceTemplateInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).updateTemplate(data),
  );

/**
 * Watching a template badges catalogue rows. A tier mapping only writes here;
 * the live events it maps move when the retier pass runs, not on this save.
 */
const vocabularyInvalidates = [
  queryKeys.admin.meta.sourceTemplates,
  queryKeys.admin.meta.sourceFormats,
  queryKeys.admin.meta.catalogue,
  queryKeys.admin.meta.syncStatus.prefix,
] as const;

/**
 * Puts a template under watch, or takes it off.
 *
 * @returns The mutation; resolves with the stored template.
 */
export function useUpdateMetaSourceTemplate() {
  return useMutationWithInvalidation<MetaSourceTemplate, MetaSourceTemplateInput>({
    mutationFn: (vars) => updateMetaSourceTemplateFn({ data: vars }),
    invalidates: vocabularyInvalidates,
  });
}

const fetchMetaSourceFormats = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) => apiOrpcClient(adminMetaCatalogContract, context.cookie).listFormats());

/**
 * Every format string the crawl has seen, mapped or not.
 *
 * @returns The query holding the formats.
 */
export function useMetaSourceFormats() {
  return useQuery({
    queryKey: queryKeys.admin.meta.sourceFormats,
    queryFn: () => fetchMetaSourceFormats(),
  });
}

/** A format mapping. Null unmaps, which bars the format from auto-accept. */
export interface MetaSourceFormatInput {
  sourceFormat: string;
  mappedFormat: string | null;
}

const updateMetaSourceFormatFn = createServerFn({ method: "POST" })
  .validator((input: MetaSourceFormatInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).updateFormat(data),
  );

/**
 * Points a source format at one of our deck formats, or unmaps it.
 *
 * @returns The mutation; resolves with the stored mapping.
 */
export function useUpdateMetaSourceFormat() {
  return useMutationWithInvalidation<MetaSourceFormat, MetaSourceFormatInput>({
    mutationFn: (vars) => updateMetaSourceFormatFn({ data: vars }),
    invalidates: vocabularyInvalidates,
  });
}

const fetchMetaSyncSettings = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<MetaSyncSettings> =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).settings(),
  );

/**
 * The auto-accept rules.
 *
 * @returns The query holding the rule settings.
 */
export function useMetaSyncSettings() {
  return useQuery({
    queryKey: queryKeys.admin.meta.syncSettings,
    queryFn: () => fetchMetaSyncSettings(),
    staleTime: 5 * 60 * 1000,
  });
}

/** A settings change. Fields left out keep their stored value. */
export interface MetaSyncSettingsInput {
  /** Null turns the player-count rule off. */
  autoAcceptMinPlayers?: number | null;
  autoAcceptNotable?: boolean;
  autoAcceptOfficial?: boolean;
  competitivePlayerFloor?: number;
}

const updateMetaSyncSettingsFn = createServerFn({ method: "POST" })
  .validator((input: MetaSyncSettingsInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaSyncSettings> =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).updateSettings(data),
  );

/**
 * Saves the sync settings.
 *
 * @returns The mutation; resolves with the stored settings.
 */
export function useUpdateMetaSyncSettings() {
  return useMutationWithInvalidation<MetaSyncSettings, MetaSyncSettingsInput>({
    mutationFn: (vars) => updateMetaSyncSettingsFn({ data: vars }),
    invalidates: [queryKeys.admin.meta.syncSettings],
  });
}

const fetchMetaSyncStatus = createServerFn({ method: "GET" })
  .validator((input: { source: MetaSource }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaSyncStatus> =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).syncStatus({ source: data.source }),
  );

/** How often the sync panel re-reads the run list while it is open. */
export const SYNC_STATUS_POLL_MS = 15_000;

/**
 * One source's freshness counters, triage counts, and archive slice, plus the
 * recent `meta.*` runs (which span sources). Polls while the panel is open,
 * because the crawls it starts finish in the background.
 *
 * @param source - Which source's pipeline to read.
 * @returns The query holding the sync status.
 */
export function useMetaSyncStatus(source: MetaSource) {
  return useQuery({
    queryKey: queryKeys.admin.meta.syncStatus(source),
    queryFn: () => fetchMetaSyncStatus({ data: { source } }),
    refetchInterval: SYNC_STATUS_POLL_MS,
  });
}

const fetchMetaArchiveJobsFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<MetaArchiveJobs> =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).archiveJobs(),
  );

/**
 * Recent runs of the archive's own two passes. Polls on the same cadence as the
 * source panels, because both passes outlive the request that starts them.
 *
 * @returns The query holding the runs.
 */
export function useMetaArchiveJobs() {
  return useQuery({
    queryKey: queryKeys.admin.meta.archiveJobs,
    queryFn: () => fetchMetaArchiveJobsFn(),
    refetchInterval: SYNC_STATUS_POLL_MS,
  });
}

/** The manual triggers, by the contract procedure each one calls. */
const META_SYNC_TRIGGERS = [
  "runSync",
  "runBackfill",
  "restartBackfill",
  "runRecheck",
  "runIdSweep",
  "runAutoAccept",
  "runRetier",
  "runRepromote",
  "runPlayloltcgSync",
  "runPlayloltcgRecheck",
  "runPlayloltcgAutoAccept",
  "runPlayloltcgBackfill",
  "restartPlayloltcgBackfill",
  "runTopdeckSync",
  "runTopdeckAutoAccept",
  "runTopdeckBackfill",
  "restartTopdeckBackfill",
] as const;

export type MetaSyncTrigger = (typeof META_SYNC_TRIGGERS)[number];

const runMetaSyncFn = createServerFn({ method: "POST" })
  .validator((input: { trigger: MetaSyncTrigger }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaSyncTriggerResult> => {
    const client = apiOrpcClient(adminMetaCatalogContract, context.cookie);
    return client[data.trigger]();
  });

/** What a run touches: its own bookkeeping plus every catalogue row it wrote. */
const syncRunInvalidates = [
  queryKeys.admin.meta.syncStatus.prefix,
  queryKeys.admin.meta.archiveJobs,
  queryKeys.admin.meta.catalogue,
  queryKeys.admin.meta.playloltcgCatalogue,
  queryKeys.admin.jobRuns,
] as const;

/**
 * Starts one of the sync jobs by hand. The crawls answer as soon as they start,
 * so the result says `running` rather than carrying a summary.
 *
 * @returns The mutation; resolves with what the trigger did.
 */
export function useRunMetaSync() {
  return useMutationWithInvalidation<MetaSyncTriggerResult, { trigger: MetaSyncTrigger }>({
    mutationFn: (vars) => runMetaSyncFn({ data: vars }),
    invalidates: syncRunInvalidates,
  });
}

const fetchCatalogEventFn = createServerFn({ method: "POST" })
  .validator((input: { externalId: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaSyncTriggerResult> =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).fetchEvent(data),
  );

const cancelRunFn = createServerFn({ method: "POST" })
  .validator((input: { source: MetaSource; job: MetaCancellableJob }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaSyncCancelResult> =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).cancelRun({
      source: data.source,
      job: data.job,
    }),
  );

/**
 * Asks one of a source's running jobs to stop. It stops at its next checkpoint
 * rather than immediately, so the panel keeps polling to see it land.
 *
 * @param source - Which source's pipeline the job belongs to.
 * @returns The mutation; resolves with the run it flagged.
 */
export function useCancelMetaRun(source: MetaSource) {
  return useMutationWithInvalidation<MetaSyncCancelResult, { job: MetaCancellableJob }>({
    mutationFn: (vars) => cancelRunFn({ data: { source, job: vars.job } }),
    invalidates: syncRunInvalidates,
  });
}

/**
 * Pulls one accepted event's results now instead of waiting for its next
 * recheck. It runs inline, so the result carries the fetch's summary.
 *
 * @returns The mutation; resolves with what the fetch found.
 */
export function useFetchCatalogEvent() {
  return useMutationWithInvalidation<MetaSyncTriggerResult, { externalId: string }>({
    mutationFn: (vars) => fetchCatalogEventFn({ data: vars }),
    invalidates: acceptInvalidates,
  });
}
