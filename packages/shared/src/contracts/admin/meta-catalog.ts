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

/** What a crawl checkpoint carries, as both the API and the admin UI read it. */
export interface CatalogCheckpoint {
  complete: boolean;
  cancelRequested: boolean;
  rows: number;
  /** Every event starting at or before this was attempted. The resume point. */
  coveredThrough: string | null;
}

/**
 * Whether a stored `job_runs.result` is a crawl's and carries a usable resume
 * point. A run from before this shape existed reads as false, so it is started
 * fresh rather than resumed from a field it never wrote.
 */
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

/** A checkpoint worth continuing: it stopped early and said where. */
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
    /** `PUBLISHED` is what makes the event's individual decklists readable. */
    decklistStatus: z.string().nullable(),
    playerCount: z.number().int().nullable(),
    eventType: z.string().nullable(),
    /** The source's format string. Null `mappedFormat` means it maps to nothing of ours. */
    eventFormat: z.string().nullable(),
    /** The `deck_formats` slug the source's format maps to, when it maps at all. */
    mappedFormat: z.string().nullable(),
    /**
     * The label of a recognized official event template ("Regional Qualifier").
     * Null covers two cases the reader cannot tell apart: the event runs no
     * watched template, and it runs one whose name the source has stopped
     * publishing. So a recognized template can show no badge.
     */
    officialLabel: z.string().nullable(),
    storeName: z.string().nullable(),
    location: z.string().nullable(),
    timezone: z.string().nullable(),
    firstSeenAt: isoDateTime,
    lastSeenAt: isoDateTime,
    /** Set when a covering crawl stopped returning the row; it is never deleted. */
    missingSince: isoDateTime.nullable(),
    /** Null once the recheck ladder is exhausted, or while the event is not accepted. */
    nextCheckAt: isoDateTime.nullable(),
    checkStage: z.number().int(),
    triage: triageSchema,
    metaEventId: z.string().nullable(),
    metaEventSlug: z.string().nullable(),
    /** When the last deep fetch landed; null before the first fetch. */
    fetchedAt: isoDateTime.nullable(),
    /** Standings rows this source's mirror holds; null before the first fetch. */
    stagedPlayerCount: z.number().int().nonnegative(),
    /** The mirrored rows whose legend is known. */
    stagedLegendCount: z.number().int().nonnegative(),
    /** The staged rows carrying a card list. */
    stagedDeckCount: z.number().int().nonnegative(),
    /** The source's own page for the event, which becomes its citation URL. */
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
  /** True keeps only events whose organizer published decklists. */
  decklistPublished: z.coerce.boolean().optional(),
  minPlayers: z.coerce.number().int().min(0).optional(),
  dateFrom: isoDateTime.optional(),
  dateTo: isoDateTime.optional(),
  triage: triageSchema.optional(),
  /** True keeps only rows a covering crawl stopped returning. */
  missing: z.coerce.boolean().optional(),
  /** True keeps only accepted rows whose results were never fetched. */
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
    /** Unfiltered bucket sizes, for the tab labels. */
    counts: metaCatalogCountsSchema,
  })
  .openapi("MetaCatalogListResponse");

/** One catalogue row, addressed by the source's own key. */
const catalogKeySchema = z.object({ externalId: z.string().min(1) });

// ── playloltcg catalogue ────────────────────────────────────────────────────
// A leaner row than uvsgames: no format mapping, no templates. The venue and the
// sortWeight lifecycle stand in for the store name and display status.
export const playloltcgCatalogRowSchema = z
  .object({
    activityShopId: z.number().int(),
    name: z.string(),
    shopName: z.string().nullable(),
    city: z.string().nullable(),
    /** The sortWeight lifecycle, 1 registration-open … 5 finished; null if unknown. */
    status: z.number().int().nullable(),
    battleMode: z.string().nullable(),
    playerCount: z.number().int().nullable(),
    startAt: isoDate.nullable(),
    triage: triageSchema,
    metaEventId: z.string().nullable(),
    metaEventSlug: z.string().nullable(),
    /** When the last deep fetch landed; null before the first fetch. */
    fetchedAt: isoDateTime.nullable(),
    /** Set when a covering crawl stopped returning the row; it is never deleted. */
    missingSince: isoDateTime.nullable(),
    /** Null once the recheck ladder is exhausted, or while the event is not accepted. */
    nextCheckAt: isoDateTime.nullable(),
    /** Standings rows this source's mirror holds; zero before the first fetch. */
    stagedPlayerCount: z.number().int().nonnegative(),
    /** The mirrored rows whose legend is known. */
    stagedLegendCount: z.number().int().nonnegative(),
    /** The staged decks the fetch actually got back. */
    stagedDeckCount: z.number().int().nonnegative(),
    /** The source's own page for the event, its citation URL. */
    sourceUrl: z.string(),
  })
  .openapi("PlayloltcgCatalogRow");

const playloltcgCatalogListQuerySchema = z.object({
  search: z.string().optional(),
  /** One step of the sortWeight lifecycle, {@link PLAYLOLTCG_STATUSES}. */
  status: z.coerce
    .number()
    .int()
    .refine((value): value is PlayloltcgStatus => PLAYLOLTCG_STATUSES.some((s) => s === value))
    .optional(),
  minPlayers: z.coerce.number().int().min(0).optional(),
  /** Inclusive calendar-day bounds; `start_at` is a date column, not an instant. */
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  triage: triageSchema.optional(),
  /** True keeps only rows a covering crawl stopped returning. */
  missing: z.coerce.boolean().optional(),
  /** True keeps only accepted rows whose results were never fetched. */
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

const acceptCatalogEventSchema = catalogKeySchema.extend({
  /**
   * Overrides the format mapping, for an event whose source format maps to
   * nothing. Without it such an event cannot be accepted, which is deliberate:
   * the live column FKs to `deck_formats`.
   */
  format: z.string().min(1).optional(),
});

export const acceptedCatalogEventSchema = z
  .object({
    metaEventId: z.string(),
    slug: z.string(),
    /** False when the key already fed a live event and this was a re-promote. */
    created: z.boolean(),
  })
  .openapi("AcceptedCatalogEvent");

export const metaSyncSettingsSchema = z
  .object({
    /** Null turns the rule off, rather than a threshold nothing meets. */
    autoAcceptMinPlayers: z.number().int().positive().nullable(),
    autoAcceptNotable: z.boolean(),
    /** Accept every event running a recognized official template (Regional Qualifier, ...). */
    autoAcceptOfficial: z.boolean(),
    updatedAt: isoDateTime,
  })
  .openapi("MetaSyncSettings");

const metaSyncSettingsPatchSchema = z.object({
  autoAcceptMinPlayers: z.number().int().positive().nullable().optional(),
  autoAcceptNotable: z.boolean().optional(),
  autoAcceptOfficial: z.boolean().optional(),
});

export const metaSourceTemplateSchema = z
  .object({
    templateId: z.string(),
    /** The source's own name for the template; null once it stops publishing one. */
    sourceName: z.string().nullable(),
    /** Watched templates get the badge, the daily poll query, and the official auto-accept rule. */
    watched: z.boolean(),
    /** The admin-mapped tier this template's events file under; null until mapped. */
    tier: metaEventTierSchema.nullable(),
    /** What the name rules would guess, shown as a prefill for an unmapped template. Never stored. */
    suggestedTier: metaEventTierSchema.nullable(),
    /** Catalogue events running this template. */
    eventCount: z.number().int().nonnegative(),
    /** Mean players over {@link ranEventCount}; null until one of its events has run. */
    avgPlayers: z.number().nullable(),
    /** Events that started before today and published a player count. */
    ranEventCount: z.number().int().nonnegative(),
    /** The most recent event's name, which is all an unnamed template has. */
    sampleEventName: z.string().nullable(),
    lastStartAt: isoDateTime.nullable(),
  })
  .openapi("MetaSourceTemplate");

const metaSourceTemplatePatchSchema = z.object({
  templateId: z.string().min(1),
  watched: z.boolean().optional(),
  /** Mapping a tier immediately reclassifies the template's events; null un-maps. */
  tier: metaEventTierSchema.nullable().optional(),
});

export const metaSourceFormatSchema = z
  .object({
    /** The source's format string, verbatim. */
    sourceFormat: z.string(),
    /** Catalogue events carrying it. */
    eventCount: z.number().int().nonnegative(),
    /** The `deck_formats` slug it maps to; null = unmapped, never auto-accepted. */
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

export const metaSyncStatusSchema = z
  .object({
    catalog: z.object({
      total: z.number().int(),
      /** Those the source marks finished, so standings could exist. */
      completed: z.number().int(),
      /** Those whose organizer published decklists. */
      decklistPublished: z.number().int(),
      /** Rows a covering crawl stopped returning. */
      missing: z.number().int(),
      /** Accepted events waiting in the recheck queue. */
      queued: z.number().int(),
      /** Those whose next visit is already overdue. */
      dueRecheck: z.number().int(),
      /** Accepted events whose first results fetch has not landed yet. */
      acceptedAwaitingResults: z.number().int(),
      /** Accepted events the source's listing no longer returns. */
      acceptedMissing: z.number().int(),
      /** The newest `last_seen_at` in the catalogue: how fresh the mirror is. */
      lastSeenAt: isoDateTime.nullable(),
    }),
    /** The same funnel on the archive's side, for the delta against `catalog`. */
    archive: z.object({
      events: z.number().int(),
      eventsWithStandings: z.number().int(),
      eventsWithDecklists: z.number().int(),
      /** Archived decks across all events. */
      decks: z.number().int(),
    }),
    counts: metaCatalogCountsSchema,
    /** Recent `meta.*` job runs, newest first. */
    runs: z.array(metaSyncRunSchema),
    /** Whether each sync cron is registered in this deployment. */
    schedules: z.record(z.string(), z.boolean()),
  })
  .openapi("MetaSyncStatus");

/**
 * What a manual trigger did. The long crawls answer immediately with a run
 * handle (`running`) because a full backfill outlives any gateway timeout;
 * the single-event fetch runs inline and answers with its result. Either way an
 * in-flight run of the same kind reports `already_running` rather than starting
 * a second one.
 */
export const metaSyncTriggerResultSchema = z
  .object({
    status: z.enum(["running", "succeeded", "failed", "already_running"]),
    runId: z.string().nullable(),
    /** The failure's message, when there is one. */
    message: z.string().nullable(),
    /** The finished run's summary, for the triggers that wait. */
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

/**
 * The jobs a Stop can be aimed at. Not every source/job pair exists: only
 * uvsgames sweeps ids, and the playloltcg recheck answers no Stop at all.
 */
export const META_CANCELLABLE_JOBS = ["backfill", "recheck", "id_sweep"] as const;
export const metaCancellableJobSchema = z.enum(META_CANCELLABLE_JOBS);

/** What a cancel request did to the run it was aimed at. */
export const metaSyncCancelResultSchema = z
  .object({
    runId: z.string(),
    cancelRequested: z.literal(true),
  })
  .openapi("MetaSyncCancelResult");

/**
 * oRPC contract for the meta archive's catalogue triage and sync controls
 * (ADR-014, second revision), on the admin-gated `/api/admin/v1/meta` prefix.
 *
 * The catalogue is a mirror of the source's own listing, so nothing here edits
 * an event's data: the two actions are `accept` (create the live event and its
 * citation, then queue the deep fetch) and `dismiss` (write the ignore key).
 * Everything downstream of an accept is promotion.
 *
 * Domain codes: `accept` → NOT_FOUND for an unknown key, BAD_REQUEST when the
 * source's format maps to nothing and none was supplied, CONFLICT when no free
 * slug could be minted. `dismiss` / `undismiss` / `fetchEvent` → NOT_FOUND.
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

  // ── Manual triggers ──────────────────────────────────────────────────────
  // The same jobs the crons run, for a deployment with no schedules set (local
  // dev) and for the maintainer truing up the long tail.

  runSync: authedRoute
    .route({ method: "POST", path: `${BASE}/sync/daily`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  /** Continues the last backfill that stopped early, or starts one if none did. */
  runBackfill: authedRoute
    .route({ method: "POST", path: `${BASE}/sync/backfill`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  /** The same crawl from the archive's first day, ignoring any resume point. */
  restartBackfill: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/sync/backfill/restart`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(metaSyncTriggerResultSchema),

  /** One slice of the id sweep — the only way to reach an event the listing won't serve. */
  runIdSweep: authedRoute
    .route({ method: "POST", path: `${BASE}/sync/id-sweep`, tags: [TAG], successStatus: 202 })
    .input(idSweepWindowSchema)
    .output(metaSyncTriggerResultSchema),

  /**
   * Asks one of a source's running jobs to stop at its next checkpoint. The
   * playloltcg recheck is the one pair that cannot answer a Stop, and is
   * refused rather than silently flagged.
   */
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

  /**
   * Runs the auto-accept rules over every row still awaiting triage, rather
   * than over the keys one crawl happened to write. This is what applies a rule
   * turned on today to the events already in the list.
   */
  runAutoAccept: authedRoute
    .route({ method: "POST", path: `${BASE}/sync/auto-accept`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  // ── playloltcg (the Chinese source) ──────────────────────────────────────
  runPlayloltcgSync: authedRoute
    .route({ method: "POST", path: `${BASE}/playloltcg/sync`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  runPlayloltcgRecheck: authedRoute
    .route({ method: "POST", path: `${BASE}/playloltcg/recheck`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  /** The same backlog sweep for playloltcg, where the rule is the threshold. */
  runPlayloltcgAutoAccept: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/playloltcg/auto-accept`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(metaSyncTriggerResultSchema),

  /** Continues the last playloltcg backfill that stopped early, or starts one. */
  runPlayloltcgBackfill: authedRoute
    .route({ method: "POST", path: `${BASE}/playloltcg/backfill`, tags: [TAG], successStatus: 202 })
    .output(metaSyncTriggerResultSchema),

  /** The playloltcg backfill from the archive's first day, ignoring the resume point. */
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

  /** Pulls one accepted playloltcg event's results now, out of the ladder's turn. */
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

  /** Pulls one accepted event's results now, without waiting for its ladder step. */
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
export type MetaCatalogTriage = (typeof META_CATALOG_TRIAGE)[number];
export type MetaCatalogSort = (typeof META_CATALOG_SORTS)[number];
export type MetaCatalogSortDirection = (typeof META_CATALOG_SORT_DIRECTIONS)[number];
export type MetaSyncSettings = z.infer<typeof metaSyncSettingsSchema>;
export type MetaSyncStatus = z.infer<typeof metaSyncStatusSchema>;
export type MetaSyncTriggerResult = z.infer<typeof metaSyncTriggerResultSchema>;
export type MetaSyncCancelResult = z.infer<typeof metaSyncCancelResultSchema>;
export type MetaCancellableJob = (typeof META_CANCELLABLE_JOBS)[number];
export type MetaSourceTemplate = z.infer<typeof metaSourceTemplateSchema>;
export type MetaSourceFormat = z.infer<typeof metaSourceFormatSchema>;
