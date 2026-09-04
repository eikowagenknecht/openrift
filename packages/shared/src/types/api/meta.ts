import type { z } from "zod";

import type {
  adminMetaEventListResponseSchema,
  adminMetaEventSchema,
  adminMetaEventSourceSchema,
  adminMetaPlayerSchema,
  metaEventDriftSchema,
  metaOverlayDetailSchema,
  metaOverlayBulkAcceptResultSchema,
  metaOverlayMatchStateSchema,
  metaOverlayQueueRowSchema,
  metaOverlayReviewResultSchema,
  metaOverlayRowMatchSchema,
  metaEventMatchSuggestionSchema,
  metaPlayerMatchSuggestionSchema,
  metaUploadResponseSchema,
  metaUploadRevertResultSchema,
  metaUploadSummarySchema,
  metaUploadSchema,
} from "../../contracts/admin/meta.js";
import type {
  metaCreditVisibilityResponseSchema,
  metaEventCorrectionInputSchema,
  metaEventFieldEditsSchema,
  metaSubmissionInputSchema,
  metaSubmissionListResponseSchema,
  metaSubmissionResultSchema,
  metaSubmissionSchema,
} from "../../contracts/meta-submissions.js";
import type {
  metaDeckCardIndexResponseSchema,
  metaDeckDetailResponseSchema,
  metaDeckListResponseSchema,
  metaDeckSummarySchema,
  metaEventDetailResponseSchema,
  metaEventDetailSchema,
  metaEventListResponseSchema,
  metaEventPlayerSchema,
  metaEventMatchSchema,
  metaEventPhaseSchema,
  metaEventSourceSchema,
  metaEventSummarySchema,
  metaEventFinishSchema,
  metaActivityItemSchema,
  metaActivityResponseSchema,
  metaCountsQuerySchema,
  metaCountsResponseSchema,
  metaScopeQuerySchema,
  metaLegendDetailResponseSchema,
  metaPlayerDetailResponseSchema,
  metaPlayerFinishSchema,
  metaLegendFinishSchema,
  metaLegendListResponseSchema,
  metaLegendSummarySchema,
} from "../../contracts/meta.js";

/** One archived event as a list row: header fields plus how much of it we hold. */
export type MetaEventSummary = z.infer<typeof metaEventSummarySchema>;

/** One podium (rank ≤ 3) standings row, as an event list names it inline. */
export type MetaEventFinish = z.infer<typeof metaEventFinishSchema>;

/** The summary plus the long-form fields only the event's own page shows. */
export type MetaEventDetail = z.infer<typeof metaEventDetailSchema>;

/** One citation on an event: where a slice of its data came from. */
export type MetaEventSource = z.infer<typeof metaEventSourceSchema>;

/**
 * One player's entry in an event's standings. Every archived event carries its
 * whole field here; only the entries with a known list have a deck behind them.
 */
export type MetaEventPlayer = z.infer<typeof metaEventPlayerSchema>;

/** One archived match in one round, referencing the event's players by id. */
export type MetaEventMatch = z.infer<typeof metaEventMatchSchema>;

/** One stage of an event, which is what tells a cut apart from the Swiss rounds. */
export type MetaEventPhase = z.infer<typeof metaEventPhaseSchema>;

/**
 * One archived deck as a tile or table row. Legend and champion are
 * denormalized so the browser renders without the catalog; both are nullable
 * because nothing forces an admin-entered deck to fill either zone.
 */
export type MetaDeckSummary = z.infer<typeof metaDeckSummarySchema>;

/** GET /meta/events — every archived event, newest first. */
export type MetaEventListResponse = z.infer<typeof metaEventListResponseSchema>;

/** One recent addition to the archive, reported as a per-event, per-day burst. */
export type MetaActivityItem = z.infer<typeof metaActivityItemSchema>;

export type MetaActivityResponse = z.infer<typeof metaActivityResponseSchema>;

/** GET /meta/events/{slug} — one event and its full standings, best finish first. */
export type MetaEventDetailResponse = z.infer<typeof metaEventDetailResponseSchema>;

/** GET /meta/decks — every archived deck, unfiltered; the client narrows it. */
export type MetaDeckListResponse = z.infer<typeof metaDeckListResponseSchema>;

/** GET /meta/deck-cards — what every archived list holds, pooled by card id. */
export type MetaDeckCardIndexResponse = z.infer<typeof metaDeckCardIndexResponseSchema>;

/** GET /meta/decks/{token} — the public share-deck payload plus the archive panel. */
export type MetaDeckDetailResponse = z.infer<typeof metaDeckDetailResponseSchema>;

/** GET /meta/counts — how many standings rows and published decks are in scope. */
export type MetaCountsResponse = z.infer<typeof metaCountsResponseSchema>;

/** One archived standings row seen from the legend's side rather than the event's. */
export type MetaLegendFinish = z.infer<typeof metaLegendFinishSchema>;

/** One legend as the alphabetical index lists it. */
export type MetaLegendSummary = z.infer<typeof metaLegendSummarySchema>;

/** One legend's folded results at one event, for the index's scoped facts. */
export type { MetaLegendEventRecord } from "../../contracts/meta.js";

/** GET /meta/legends — every legend the archive holds a result for, by name. */
export type MetaLegendListResponse = z.infer<typeof metaLegendListResponseSchema>;

/** GET /meta/legends/{slug} — one legend and every finish on its record. */
export type MetaLegendDetailResponse = z.infer<typeof metaLegendDetailResponseSchema>;

/** One archived standings row seen from the player's side. */
export type MetaPlayerFinish = z.infer<typeof metaPlayerFinishSchema>;

/** GET /meta/players/{key} — one player and every finish on their record. */
export type MetaPlayerDetailResponse = z.infer<typeof metaPlayerDetailResponseSchema>;

/** The scope bar's selection on the wire: a window plus the three facet pairs. */
export type MetaScopeQuery = z.infer<typeof metaScopeQuerySchema>;

/** Which slice of the archive `GET /meta/counts` should count. */
export type MetaCountsQuery = z.infer<typeof metaCountsQuerySchema>;

/** Admin event row: every stored column plus the roster and deck counts. */
export type AdminMetaEvent = z.infer<typeof adminMetaEventSchema>;

/** GET /admin/v1/meta/events — one filtered page of the live archive. */
export type AdminMetaEventList = z.infer<typeof adminMetaEventListResponseSchema>;

/** Admin standings row for one event's management table. */
export type AdminMetaPlayer = z.infer<typeof adminMetaPlayerSchema>;

// ── Overlay ingest (ADR-014) ─────────────────────────────────────────────────

/**
 * The upload body external tooling posts. `z.input` rather than `z.infer`
 * because the schema defaults every optional field — a producer may omit them,
 * the service always sees them filled in.
 */
export type MetaUploadBody = z.input<typeof metaUploadSchema>;

/** One event of a validated upload payload, as the ingest service consumes it. */
export type MetaIngestEvent = z.infer<typeof metaUploadSchema>["events"][number];

/** One player of {@link MetaIngestEvent}. */
export type MetaIngestEventPlayer = MetaIngestEvent["players"][number];

/** POST /admin/meta/upload — what the upload wrote, updated, and could not match. */
export type MetaUploadResponse = z.infer<typeof metaUploadResponseSchema>;

/** One row of the overlay review queue. */
export type MetaOverlayQueueRow = z.infer<typeof metaOverlayQueueRowSchema>;

export type MetaOverlayMatchState = z.infer<typeof metaOverlayMatchStateSchema>;

/** Which live standings row a queued player overlay lands on. */
export type MetaOverlayRowMatch = z.infer<typeof metaOverlayRowMatchSchema>;

/** What a bulk accept settled: the rows taken and the events promoted for them. */
export type MetaOverlayBulkAcceptResult = z.infer<typeof metaOverlayBulkAcceptResultSchema>;

/** The outcome of settling one overlay: the live event it landed on, if any. */
export type MetaOverlayReviewResult = z.infer<typeof metaOverlayReviewResultSchema>;

/** GET /admin/meta/overlays/{id} — one overlay, event or player kind. */
export type MetaOverlayDetail = z.infer<typeof metaOverlayDetailSchema>;

/** One citation as the admin event editor lists it. */
export type AdminMetaEventSource = z.infer<typeof adminMetaEventSourceSchema>;

/** The per-field live-vs-sources comparison for one event. */
export type MetaEventDrift = z.infer<typeof metaEventDriftSchema>;

/** One ranked live event a proposed overlay might duplicate. */
export type MetaEventMatchSuggestion = z.infer<typeof metaEventMatchSuggestionSchema>;

/** One ranked live standings row an unanchored player overlay might describe. */
export type MetaPlayerMatchSuggestion = z.infer<typeof metaPlayerMatchSuggestionSchema>;

/** One upload feeding a live event, as the event's uploads panel lists it. */
export type MetaUploadSummary = z.infer<typeof metaUploadSummarySchema>;

/** What reverting one upload settled. */
export type MetaUploadRevertResult = z.infer<typeof metaUploadRevertResultSchema>;

// ── User submissions (ADR-014, ADR-036) ──────────────────────────────────────

/**
 * POST /meta/submissions — one decklist against an existing or proposed event.
 * `z.input`, because the schema defaults every optional field: a client may omit
 * them, the handler always sees them filled in.
 */
export type MetaSubmissionInput = z.input<typeof metaSubmissionInputSchema>;

/** What staging one submission produced, including any names that matched nothing. */
export type MetaSubmissionResult = z.infer<typeof metaSubmissionResultSchema>;

/** POST /meta/submissions/event-corrections — proposed new values for an event's own facts. */
export type MetaEventCorrectionInput = z.input<typeof metaEventCorrectionInputSchema>;

/** The event facts a reader can propose a new value for. */
export type MetaEventFieldEdits = z.infer<typeof metaEventFieldEditsSchema>;

/** One row of the contributor's own submission history. */
export type MetaSubmission = z.infer<typeof metaSubmissionSchema>;

/** GET /meta/submissions — the contributor's own history, newest first. */
export type MetaSubmissionListResponse = z.infer<typeof metaSubmissionListResponseSchema>;

/** GET/PATCH /meta/credit-visibility — whether the caller's contributions are credited. */
export type MetaCreditVisibilityResponse = z.infer<typeof metaCreditVisibilityResponseSchema>;
