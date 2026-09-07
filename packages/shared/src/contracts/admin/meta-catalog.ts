import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { metaEventTierSchema } from "@openrift/shared/response-schemas";
import { isoDate, isoDateTime } from "@openrift/shared/schemas";
import { z } from "zod";

import {
  META_CATALOG_DISPLAY_STATUSES,
  META_CATALOG_PROVIDERS,
  META_CATALOG_SORT_DIRECTIONS,
  META_CATALOG_SORTS,
  META_CATALOG_TRIAGE,
  PLAYLOLTCG_STATUSES,
} from "../../types/enums.js";
import type { PlayloltcgStatus } from "../../types/enums.js";
import { authedRoute } from "../_base.js";

extendZodWithOpenApi(z);

const TAG = "Admin - Meta catalogue";
const BASE = "/api/admin/v1/meta/catalogue";

const ARCHIVE_BASE = "/api/admin/v1/meta/archive";

export interface CatalogCheckpoint {
  complete: boolean;
  cancelRequested: boolean;
  rows: number;
  coveredThrough: string | null;
}

/** A run from before this shape existed is treated as false; it starts fresh. */
export function isCatalogCheckpoint(value: unknown): value is CatalogCheckpoint {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.complete === "boolean" &&
    typeof v.cancelRequested === "boolean" &&
    typeof v.rows === "number" &&
    (v.coveredThrough === null || typeof v.coveredThrough === "string")
  );
}

export function isResumableCheckpoint(
  value: unknown,
): value is CatalogCheckpoint & { coveredThrough: string } {
  return isCatalogCheckpoint(value) && !value.complete && value.coveredThrough !== null;
}

export const metaSourceSchema = z.enum(META_CATALOG_PROVIDERS);
export type MetaSource = z.infer<typeof metaSourceSchema>;

const triageSchema = z.enum(META_CATALOG_TRIAGE);

export const metaCatalogRowSchema = z
  .object({
    externalId: z.string(),
    name: z.string(),
    startAt: isoDateTime,
    endAtEstimate: isoDateTime.nullable(),
    displayStatus: z.string(),
    decklistStatus: z.string().nullable(),
    playerCount: z.number().int().nullable(),
    eventType: z.string().nullable(),
    eventFormat: z.string().nullable(),
    mappedFormat: z.string().nullable(),
    officialLabel: z.string().nullable(),
    storeName: z.string().nullable(),
    location: z.string().nullable(),
    timezone: z.string().nullable(),
    firstSeenAt: isoDateTime,
    lastSeenAt: isoDateTime,
    missingSince: isoDateTime.nullable(),
    nextCheckAt: isoDateTime.nullable(),
    checkStage: z.number().int(),
    triage: triageSchema,
    metaEventId: z.string().nullable(),
    metaEventSlug: z.string().nullable(),
    fetchedAt: isoDateTime.nullable(),
    stagedPlayerCount: z.number().int().nonnegative(),
    stagedLegendCount: z.number().int().nonnegative(),
    stagedDeckCount: z.number().int().nonnegative(),
    sourceUrl: z.string(),
  })
  .openapi("MetaCatalogRow");

const metaCatalogCountsSchema = z.object({
  new: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  dismissed: z.number().int().nonnegative(),
});

const metaCatalogListQuerySchema = z.object({
  search: z.string().optional(),
  displayStatus: z.enum(META_CATALOG_DISPLAY_STATUSES).optional(),
  decklistPublished: z.coerce.boolean().optional(),
  minPlayers: z.coerce.number().int().min(0).optional(),
  dateFrom: isoDateTime.optional(),
  dateTo: isoDateTime.optional(),
  triage: triageSchema.optional(),
  missing: z.coerce.boolean().optional(),
  awaitingResults: z.coerce.boolean().optional(),
  sort: z.enum(META_CATALOG_SORTS).optional(),
  direction: z.enum(META_CATALOG_SORT_DIRECTIONS).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const metaCatalogListResponseSchema = z
  .object({
    rows: z.array(metaCatalogRowSchema),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    counts: metaCatalogCountsSchema,
  })
  .openapi("MetaCatalogListResponse");

const catalogKeySchema = z.object({ externalId: z.string().min(1) });

export const playloltcgCatalogRowSchema = z
  .object({
    activityShopId: z.number().int(),
    name: z.string(),
    shopName: z.string().nullable(),
    city: z.string().nullable(),
    status: z.number().int().nullable(),
    battleMode: z.string().nullable(),
    playerCount: z.number().int().nullable(),
    startAt: isoDate.nullable(),
    triage: triageSchema,
    metaEventId: z.string().nullable(),
    metaEventSlug: z.string().nullable(),
    fetchedAt: isoDateTime.nullable(),
    missingSince: isoDateTime.nullable(),
    nextCheckAt: isoDateTime.nullable(),
    stagedPlayerCount: z.number().int().nonnegative(),
    stagedLegendCount: z.number().int().nonnegative(),
    stagedDeckCount: z.number().int().nonnegative(),
    sourceUrl: z.string(),
  })
  .openapi("PlayloltcgCatalogRow");

const playloltcgCatalogListQuerySchema = z.object({
  search: z.string().optional(),
  status: z.coerce
    .number()
    .int()
    .refine((value): value is PlayloltcgStatus => PLAYLOLTCG_STATUSES.some((s) => s === value))
    .optional(),
  minPlayers: z.coerce.number().int().min(0).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  triage: triageSchema.optional(),
  missing: z.coerce.boolean().optional(),
  awaitingResults: z.coerce.boolean().optional(),
  sort: z.enum(META_CATALOG_SORTS).optional(),
  direction: z.enum(META_CATALOG_SORT_DIRECTIONS).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const playloltcgCatalogListResponseSchema = z
  .object({
    rows: z.array(playloltcgCatalogRowSchema),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    counts: metaCatalogCountsSchema,
  })
  .openapi("PlayloltcgCatalogListResponse");

const playloltcgKeySchema = z.object({ activityShopId: z.number().int() });

export const topdeckCatalogRowSchema = z
  .object({
    tid: z.string(),
    name: z.string(),
    format: z.string(),
    city: z.string().nullable(),
    country: z.string().nullable(),
    playerCount: z.number().int().nullable(),
    topCut: z.number().int().nullable(),
    isTeamEvent: z.boolean(),
    startAt: isoDateTime,
    triage: triageSchema,
    metaEventId: z.string().nullable(),
    metaEventSlug: z.string().nullable(),
    fetchedAt: isoDateTime.nullable(),
    missingSince: isoDateTime.nullable(),
    stagedPlayerCount: z.number().int().nonnegative(),
    stagedLegendCount: z.number().int().nonnegative(),
    stagedDeckCount: z.number().int().nonnegative(),
    rivalProvider: z.string().nullable(),
    sourceUrl: z.string(),
  })
  .openapi("TopdeckCatalogRow");

const topdeckCatalogListQuerySchema = z.object({
  search: z.string().optional(),
  format: z.string().min(1).optional(),
  minPlayers: z.coerce.number().int().min(0).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  triage: triageSchema.optional(),
  missing: z.coerce.boolean().optional(),
  sort: z.enum(META_CATALOG_SORTS).optional(),
  direction: z.enum(META_CATALOG_SORT_DIRECTIONS).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const topdeckCatalogListResponseSchema = z
  .object({
    rows: z.array(topdeckCatalogRowSchema),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    counts: metaCatalogCountsSchema,
  })
  .openapi("TopdeckCatalogListResponse");

const topdeckKeySchema = z.object({ tid: z.string().min(1) });

const acceptCatalogEventSchema = catalogKeySchema.extend({
  format: z.string().min(1).optional(),
});

export const acceptedCatalogEventSchema = z
  .object({
    metaEventId: z.string(),
    slug: z.string(),
    created: z.boolean(),
  })
  .openapi("AcceptedCatalogEvent");

export const metaSyncSettingsSchema = z
  .object({
    autoAcceptMinPlayers: z.number().int().positive().nullable(),
    autoAcceptNotable: z.boolean(),
    autoAcceptOfficial: z.boolean(),
    competitivePlayerFloor: z.number().int().positive(),
    updatedAt: isoDateTime,
  })
  .openapi("MetaSyncSettings");

const metaSyncSettingsPatchSchema = z.object({
  autoAcceptMinPlayers: z.number().int().positive().nullable().optional(),
  autoAcceptNotable: z.boolean().optional(),
  autoAcceptOfficial: z.boolean().optional(),
  competitivePlayerFloor: z.number().int().positive().optional(),
});

export const metaSourceTemplateSchema = z
  .object({
    templateId: z.string(),
    sourceName: z.string().nullable(),
    watched: z.boolean(),
    tier: metaEventTierSchema.nullable(),
    suggestedTier: metaEventTierSchema.nullable(),
    eventCount: z.number().int().nonnegative(),
    avgPlayers: z.number().nullable(),
    ranEventCount: z.number().int().nonnegative(),
    sampleEventName: z.string().nullable(),
    lastStartAt: isoDateTime.nullable(),
  })
  .openapi("MetaSourceTemplate");

const metaSourceTemplatePatchSchema = z.object({
  templateId: z.string().min(1),
  watched: z.boolean().optional(),
  tier: metaEventTierSchema.nullable().optional(),
});

export const metaSourceFormatSchema = z
  .object({
    sourceFormat: z.string(),
    eventCount: z.number().int().nonnegative(),
    mappedFormat: z.string().nullable(),
  })
  .openapi("MetaSourceFormat");

const metaSourceFormatPatchSchema = z.object({
  sourceFormat: z.string().min(1),
  mappedFormat: z.string().min(1).nullable(),
});

const metaSyncRunSchema = z.object({
  id: z.string(),
  kind: z.string(),
  trigger: z.enum(["cron", "admin", "api"]),
  status: z.enum(["running", "succeeded", "failed"]),
  startedAt: isoDateTime,
  finishedAt: isoDateTime.nullable(),
  durationMs: z.number().nullable(),
  errorMessage: z.string().nullable(),
  result: z.record(z.string(), z.any()).nullable(),
});

/** The archive's own passes, which belong to no one source. */
export const metaArchiveJobsSchema = z
  .object({ runs: z.array(metaSyncRunSchema) })
  .openapi("MetaArchiveJobs");

export const metaSyncStatusSchema = z
  .object({
    catalog: z.object({
      total: z.number().int(),
      completed: z.number().int(),
      decklistPublished: z.number().int(),
      missing: z.number().int(),
      queued: z.number().int(),
      dueRecheck: z.number().int(),
      acceptedAwaitingResults: z.number().int(),
      acceptedMissing: z.number().int(),
      lastSeenAt: isoDateTime.nullable(),
    }),
    archive: z.object({
      events: z.number().int(),
      eventsWithStandings: z.number().int(),
      eventsWithDecklists: z.number().int(),
      decks: z.number().int(),
    }),
    counts: metaCatalogCountsSchema,
    runs: z.array(metaSyncRunSchema),
    schedules: z.record(z.string(), z.boolean()),
  })
  .openapi("MetaSyncStatus");

/** Long crawls answer with a run handle (`running`); a single-event fetch answers inline. */
export const metaSyncTriggerResultSchema = z
  .object({
    status: z.enum(["running", "succeeded", "failed", "already_running"]),
    runId: z.string().nullable(),
    message: z.string().nullable(),
    result: z.record(z.string(), z.any()).nullable(),
  })
  .openapi("MetaSyncTriggerResult");

/** One sweep run's window. Every field optional; defaults to the mirror's own id span. */
const idSweepWindowSchema = z
  .object({
    fromId: z.number().int().positive().optional(),
    toId: z.number().int().positive().optional(),
    maxProbes: z.number().int().positive().max(250_000).optional(),
  })
  .optional();

/** Not every source/job pair exists here: only uvsgames sweeps ids. */
export const META_CANCELLABLE_JOBS = ["backfill", "recheck", "id_sweep"] as const;
export const metaCancellableJobSchema = z.enum(META_CANCELLABLE_JOBS);

export const metaSyncCancelResultSchema = z
  .object({
    runId: z.string(),
    cancelRequested: z.literal(true),
  })
  .openapi("MetaSyncCancelResult");

/**
 * The catalogue mirrors the source's own listing; nothing here edits an event.
 * `accept` creates the live event and queues the deep fetch, `dismiss` writes the ignore key.
 */
export const adminMetaCatalogContract = {
  list: authedRoute
    .route({ method: "GET", path: BASE, tags: [TAG] })
    .input(metaCatalogListQuerySchema)
    .output(metaCatalogListResponseSchema),

  accept: authedRoute
    .route({ method: "POST", path: `${BASE}/accept`, tags: [TAG] })
    .input(acceptCatalogEventSchema)
    .errors({
      NOT_FOUND: { message: "Catalogue event not found" },
      BAD_REQUEST: { message: "This event's format maps to nothing — pick one" },
      CONFLICT: { message: "No free slug available for this event name" },
    })
    .output(acceptedCatalogEventSchema),

  dismiss: authedRoute
    .route({ method: "POST", path: `${BASE}/dismiss`, tags: [TAG], successStatus: 204 })
    .input(catalogKeySchema)
    .errors({ NOT_FOUND: { message: "Catalogue event not found" } }),

  undismiss: authedRoute
    .route({ method: "POST", path: `${BASE}/undismiss`, tags: [TAG], successStatus: 204 })
    .input(catalogKeySchema)
    .errors({ NOT_FOUND: { message: "Ignore entry not found" } }),

  listTemplates: authedRoute
    .route({ method: "GET", path: `${BASE}/templates`, tags: [TAG] })
    .output(z.object({ templates: z.array(metaSourceTemplateSchema) })),

  updateTemplate: authedRoute
    .route({ method: "PATCH", path: `${BASE}/templates`, tags: [TAG] })
    .input(metaSourceTemplatePatchSchema)
    .errors({ NOT_FOUND: { message: "Unknown template" } })
    .output(metaSourceTemplateSchema),

  listFormats: authedRoute
    .route({ method: "GET", path: `${BASE}/formats`, tags: [TAG] })
    .output(z.object({ formats: z.array(metaSourceFormatSchema) })),

  updateFormat: authedRoute
    .route({ method: "PATCH", path: `${BASE}/formats`, tags: [TAG] })
    .input(metaSourceFormatPatchSchema)
    .errors({
      NOT_FOUND: { message: "No catalogue event carries this format" },
      BAD_REQUEST: { message: "Unknown deck format" },
    })
    .output(metaSourceFormatSchema),

  settings: authedRoute
    .route({ method: "GET", path: `${BASE}/settings`, tags: [TAG] })
    .output(metaSyncSettingsSchema),

  updateSettings: authedRoute
    .route({ method: "PATCH", path: `${BASE}/settings`, tags: [TAG] })
    .input(metaSyncSettingsPatchSchema)
    .output(metaSyncSettingsSchema),

  syncStatus: authedRoute
    .route({ method: "GET", path: `${BASE}/sync`, tags: [TAG] })
    .input(z.object({ source: metaSourceSchema }))
    .output(metaSyncStatusSchema),

  runSync: authedRoute
    .route({ method: "POST", path: `${BASE}/sync/daily`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  runBackfill: authedRoute
    .route({ method: "POST", path: `${BASE}/sync/backfill`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  restartBackfill: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/sync/backfill/restart`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(metaSyncTriggerResultSchema),

  runIdSweep: authedRoute
    .route({ method: "POST", path: `${BASE}/sync/id-sweep`, tags: [TAG], successStatus: 202 })
    .input(idSweepWindowSchema)
    .output(metaSyncTriggerResultSchema),

  /** The playloltcg recheck is the one job that cannot answer a Stop and is refused. */
  cancelRun: authedRoute
    .route({ method: "POST", path: `${BASE}/sync/cancel`, tags: [TAG] })
    .input(z.object({ source: metaSourceSchema, job: metaCancellableJobSchema }))
    .errors({
      NOT_FOUND: { message: "That job is not running" },
      CONFLICT: { message: "Job is still initializing" },
      BAD_REQUEST: { message: "That job cannot be stopped" },
    })
    .output(metaSyncCancelResultSchema),

  runRecheck: authedRoute
    .route({ method: "POST", path: `${BASE}/sync/recheck`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  /** Runs the auto-accept rules over every row still awaiting triage, not just new ones. */
  runAutoAccept: authedRoute
    .route({ method: "POST", path: `${BASE}/sync/auto-accept`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  archiveJobs: authedRoute
    .route({ method: "GET", path: `${ARCHIVE_BASE}/jobs`, tags: [TAG] })
    .output(metaArchiveJobsSchema),

  runRetier: authedRoute
    .route({ method: "POST", path: `${ARCHIVE_BASE}/retier`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  runRepromote: authedRoute
    .route({
      method: "POST",
      path: `${ARCHIVE_BASE}/repromote`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(metaSyncTriggerResultSchema),

  runPlayloltcgSync: authedRoute
    .route({ method: "POST", path: `${BASE}/playloltcg/sync`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  runPlayloltcgRecheck: authedRoute
    .route({ method: "POST", path: `${BASE}/playloltcg/recheck`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  runPlayloltcgAutoAccept: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/playloltcg/auto-accept`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(metaSyncTriggerResultSchema),

  runPlayloltcgBackfill: authedRoute
    .route({ method: "POST", path: `${BASE}/playloltcg/backfill`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  restartPlayloltcgBackfill: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/playloltcg/backfill/restart`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(metaSyncTriggerResultSchema),

  playloltcgList: authedRoute
    .route({ method: "GET", path: `${BASE}/playloltcg/events`, tags: [TAG] })
    .input(playloltcgCatalogListQuerySchema)
    .output(playloltcgCatalogListResponseSchema),

  playloltcgAccept: authedRoute
    .route({ method: "POST", path: `${BASE}/playloltcg/events/accept`, tags: [TAG] })
    .input(playloltcgKeySchema)
    .errors({ NOT_FOUND: { message: "Catalogue event not found" } })
    .output(acceptedCatalogEventSchema),

  playloltcgDismiss: authedRoute
    .route({ method: "POST", path: `${BASE}/playloltcg/events/dismiss`, tags: [TAG] })
    .input(playloltcgKeySchema)
    .errors({ NOT_FOUND: { message: "Catalogue event not found" } }),

  playloltcgUndismiss: authedRoute
    .route({ method: "POST", path: `${BASE}/playloltcg/events/undismiss`, tags: [TAG] })
    .input(playloltcgKeySchema)
    .errors({ NOT_FOUND: { message: "Ignore entry not found" } }),

  playloltcgFetchEvent: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/playloltcg/events/fetch`,
      tags: [TAG],
      successStatus: 202,
    })
    .input(playloltcgKeySchema)
    .errors({
      NOT_FOUND: { message: "Catalogue event not found" },
      BAD_REQUEST: { message: "Accept this event before fetching its results" },
    })
    .output(metaSyncTriggerResultSchema),

  runTopdeckSync: authedRoute
    .route({ method: "POST", path: `${BASE}/topdeck/sync`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  runTopdeckAutoAccept: authedRoute
    .route({ method: "POST", path: `${BASE}/topdeck/auto-accept`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  runTopdeckBackfill: authedRoute
    .route({ method: "POST", path: `${BASE}/topdeck/backfill`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  restartTopdeckBackfill: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/topdeck/backfill/restart`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(metaSyncTriggerResultSchema),

  topdeckList: authedRoute
    .route({ method: "GET", path: `${BASE}/topdeck/events`, tags: [TAG] })
    .input(topdeckCatalogListQuerySchema)
    .output(topdeckCatalogListResponseSchema),

  topdeckAccept: authedRoute
    .route({ method: "POST", path: `${BASE}/topdeck/events/accept`, tags: [TAG] })
    .input(topdeckKeySchema)
    .errors({ NOT_FOUND: { message: "Catalogue event not found" } })
    .output(acceptedCatalogEventSchema),

  topdeckDismiss: authedRoute
    .route({ method: "POST", path: `${BASE}/topdeck/events/dismiss`, tags: [TAG] })
    .input(topdeckKeySchema)
    .errors({ NOT_FOUND: { message: "Catalogue event not found" } }),

  topdeckUndismiss: authedRoute
    .route({ method: "POST", path: `${BASE}/topdeck/events/undismiss`, tags: [TAG] })
    .input(topdeckKeySchema)
    .errors({ NOT_FOUND: { message: "Ignore entry not found" } }),

  fetchEvent: authedRoute
    .route({ method: "POST", path: `${BASE}/sync/fetch`, tags: [TAG] })
    .input(catalogKeySchema)
    .errors({
      NOT_FOUND: { message: "Catalogue event not found" },
      BAD_REQUEST: { message: "Accept this event before fetching its results" },
    })
    .output(metaSyncTriggerResultSchema),
};

export type AdminMetaCatalogContract = typeof adminMetaCatalogContract;
export type MetaCatalogRow = z.infer<typeof metaCatalogRowSchema>;
export type MetaCatalogListResponse = z.infer<typeof metaCatalogListResponseSchema>;
export type PlayloltcgCatalogRow = z.infer<typeof playloltcgCatalogRowSchema>;
export type PlayloltcgCatalogListResponse = z.infer<typeof playloltcgCatalogListResponseSchema>;
export type TopdeckCatalogRow = z.infer<typeof topdeckCatalogRowSchema>;
export type TopdeckCatalogListResponse = z.infer<typeof topdeckCatalogListResponseSchema>;
export type MetaCatalogTriage = (typeof META_CATALOG_TRIAGE)[number];
export type MetaCatalogSort = (typeof META_CATALOG_SORTS)[number];
export type MetaCatalogSortDirection = (typeof META_CATALOG_SORT_DIRECTIONS)[number];
export type MetaSyncSettings = z.infer<typeof metaSyncSettingsSchema>;
export type MetaSyncStatus = z.infer<typeof metaSyncStatusSchema>;
export type MetaArchiveJobs = z.infer<typeof metaArchiveJobsSchema>;
export type MetaSyncTriggerResult = z.infer<typeof metaSyncTriggerResultSchema>;
export type MetaSyncCancelResult = z.infer<typeof metaSyncCancelResultSchema>;
export type MetaCancellableJob = (typeof META_CANCELLABLE_JOBS)[number];
export type MetaSourceTemplate = z.infer<typeof metaSourceTemplateSchema>;
export type MetaSourceFormat = z.infer<typeof metaSourceFormatSchema>;
