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
import type { META_CATALOG_DISPLAY_STATUSES, MetaEventTier } from "@openrift/shared/types/enums";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { metaKeys } from "@/features/meta/lib/meta-query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const META_CATALOG_PAGE_SIZE = 50;

type MetaCatalogDisplayStatus = (typeof META_CATALOG_DISPLAY_STATUSES)[number];

export interface MetaCatalogQueryParams {
  page: number;
  search?: string;
  triage?: MetaCatalogTriage;
  displayStatus?: MetaCatalogDisplayStatus;
  minPlayers?: number;
  decklistPublished?: boolean;
  missing?: boolean;
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
      // Query strings coerce "false" to true; an off toggle must be absent, never false.
      decklistPublished: data.decklistPublished === true ? true : undefined,
      missing: data.missing === true ? true : undefined,
      awaitingResults: data.awaitingResults === true ? true : undefined,
    }),
  );

function adminMetaCatalogQueryOptions(params: MetaCatalogQueryParams) {
  return queryOptions({
    queryKey: adminKeys.meta.catalogueList(params),
    queryFn: () => fetchMetaCatalog({ data: params }),
    placeholderData: keepPreviousData,
  });
}

/** Includes the unfiltered triage counts alongside the page. */
export function useAdminMetaCatalog(params: MetaCatalogQueryParams) {
  return useQuery(adminMetaCatalogQueryOptions(params));
}

const acceptCatalogEventFn = createServerFn({ method: "POST" })
  .validator((input: { externalId: string; format?: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).accept(data),
  );

/** An accept also creates a live event, its candidate, and a public archive row. */
const acceptInvalidates = [
  adminKeys.meta.catalogue,
  adminKeys.meta.syncStatus.prefix,
  adminKeys.meta.events,
  adminKeys.meta.overlays,
  metaKeys.all,
] as const;

/** `format` is required only when the source's own format maps to nothing of ours. */
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

/** Writes the ignore key for a catalogue row, so triage and ingest both skip it. */
export function useDismissCatalogEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { externalId: string }) => dismissCatalogEventFn({ data: vars }),
    invalidates: [adminKeys.meta.catalogue, adminKeys.meta.ignoredSources],
  });
}

const undismissCatalogEventFn = createServerFn({ method: "POST" })
  .validator((input: { externalId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCatalogContract, context.cookie).undismiss(data);
  });

export function useUndismissCatalogEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { externalId: string }) => undismissCatalogEventFn({ data: vars }),
    invalidates: [adminKeys.meta.catalogue, adminKeys.meta.ignoredSources],
  });
}

const fetchMetaSourceTemplates = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).listTemplates(),
  );

/** Every event template the source publishes, plus any the mirror still carries. */
export function useMetaSourceTemplates() {
  return useQuery({
    queryKey: adminKeys.meta.sourceTemplates,
    queryFn: () => fetchMetaSourceTemplates(),
  });
}

export interface MetaSourceTemplateInput {
  templateId: string;
  watched?: boolean;
  tier?: MetaEventTier | null;
}

const updateMetaSourceTemplateFn = createServerFn({ method: "POST" })
  .validator((input: MetaSourceTemplateInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).updateTemplate(data),
  );

/** A tier mapping only writes here; the events it maps move when the retier pass runs. */
const vocabularyInvalidates = [
  adminKeys.meta.sourceTemplates,
  adminKeys.meta.sourceFormats,
  adminKeys.meta.catalogue,
  adminKeys.meta.syncStatus.prefix,
] as const;

export function useUpdateMetaSourceTemplate() {
  return useMutationWithInvalidation<MetaSourceTemplate, MetaSourceTemplateInput>({
    mutationFn: (vars) => updateMetaSourceTemplateFn({ data: vars }),
    invalidates: vocabularyInvalidates,
  });
}

const fetchMetaSourceFormats = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) => apiOrpcClient(adminMetaCatalogContract, context.cookie).listFormats());

export function useMetaSourceFormats() {
  return useQuery({
    queryKey: adminKeys.meta.sourceFormats,
    queryFn: () => fetchMetaSourceFormats(),
  });
}

/** Null unmaps the format, which bars it from auto-accept. */
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

export function useMetaSyncSettings() {
  return useQuery({
    queryKey: adminKeys.meta.syncSettings,
    queryFn: () => fetchMetaSyncSettings(),
    staleTime: 5 * 60 * 1000,
  });
}

/** Fields left out keep their stored value. */
export interface MetaSyncSettingsInput {
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

export function useUpdateMetaSyncSettings() {
  return useMutationWithInvalidation<MetaSyncSettings, MetaSyncSettingsInput>({
    mutationFn: (vars) => updateMetaSyncSettingsFn({ data: vars }),
    invalidates: [adminKeys.meta.syncSettings],
  });
}

const fetchMetaSyncStatus = createServerFn({ method: "GET" })
  .validator((input: { source: MetaSource }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaSyncStatus> =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).syncStatus({ source: data.source }),
  );

export const SYNC_STATUS_POLL_MS = 15_000;

export function useMetaSyncStatus(source: MetaSource) {
  return useQuery({
    queryKey: adminKeys.meta.syncStatus(source),
    queryFn: () => fetchMetaSyncStatus({ data: { source } }),
    refetchInterval: SYNC_STATUS_POLL_MS,
  });
}

const fetchMetaArchiveJobsFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<MetaArchiveJobs> =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).archiveJobs(),
  );

export function useMetaArchiveJobs() {
  return useQuery({
    queryKey: adminKeys.meta.archiveJobs,
    queryFn: () => fetchMetaArchiveJobsFn(),
    refetchInterval: SYNC_STATUS_POLL_MS,
  });
}

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

const syncRunInvalidates = [
  adminKeys.meta.syncStatus.prefix,
  adminKeys.meta.archiveJobs,
  adminKeys.meta.catalogue,
  adminKeys.meta.playloltcgCatalogue,
  adminKeys.jobRuns,
] as const;

/** The result says `running`; the crawl itself finishes in the background. */
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

/** Stops at the job's next checkpoint, not immediately; the panel keeps polling to see it land. */
export function useCancelMetaRun(source: MetaSource) {
  return useMutationWithInvalidation<MetaSyncCancelResult, { job: MetaCancellableJob }>({
    mutationFn: (vars) => cancelRunFn({ data: { source, job: vars.job } }),
    invalidates: syncRunInvalidates,
  });
}

/** Runs inline, so the result carries the fetch's summary, unlike a scheduled recheck. */
export function useFetchCatalogEvent() {
  return useMutationWithInvalidation<MetaSyncTriggerResult, { externalId: string }>({
    mutationFn: (vars) => fetchCatalogEventFn({ data: vars }),
    invalidates: acceptInvalidates,
  });
}
