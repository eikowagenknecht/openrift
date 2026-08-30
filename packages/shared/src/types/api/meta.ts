import type { z } from "zod";

import type {
  acceptedMetaEventSchema,
  acceptedMetaEventWithPlayersSchema,
  acceptedMetaPlayerSchema,
  adminMetaEventListResponseSchema,
  adminMetaEventSchema,
  adminMetaEventSourceSchema,
  adminMetaPlayerSchema,
  metaCandidateDetailSchema,
  metaCandidatePlayerSchema,
  metaCandidateQueueRowSchema,
  metaCandidateSourceSchema,
  metaEventLinkResultSchema,
  metaEventMatchSuggestionSchema,
  metaPlayerLinkResultSchema,
  metaPlayerMatchSuggestionSchema,
  metaUploadResponseSchema,
  metaUploadSchema,
} from "../../contracts/admin/meta.js";
import type {
  metaCreditVisibilityResponseSchema,
  metaSubmissionInputSchema,
  metaSubmissionListResponseSchema,
  metaSubmissionResultSchema,
  metaSubmissionSchema,
} from "../../contracts/meta-submissions.js";
import type {
  metaDeckDetailResponseSchema,
  metaDeckListResponseSchema,
  metaDeckSummarySchema,
  metaEventDetailResponseSchema,
  metaEventDetailSchema,
  metaEventListResponseSchema,
  metaEventPlayerSchema,
  metaEventMatchSchema,
  metaEventSourceSchema,
  metaEventSummarySchema,
  metaEventWinnerSchema,
  metaCountsResponseSchema,
} from "../../contracts/meta.js";

/** One archived event as a list row: header fields plus how much of it we hold. */
export type MetaEventSummary = z.infer<typeof metaEventSummarySchema>;

/** One rank-1 standings row, as an event list names it inline. */
export type MetaEventWinner = z.infer<typeof metaEventWinnerSchema>;

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

/**
 * One archived deck as a tile or table row. Legend and champion are
 * denormalized so the browser renders without the catalog; both are nullable
 * because nothing forces an admin-entered deck to fill either zone.
 */
export type MetaDeckSummary = z.infer<typeof metaDeckSummarySchema>;

/** GET /meta/events — every archived event, newest first. */
export type MetaEventListResponse = z.infer<typeof metaEventListResponseSchema>;

/** GET /meta/events/{slug} — one event and its full standings, best finish first. */
export type MetaEventDetailResponse = z.infer<typeof metaEventDetailResponseSchema>;

/** GET /meta/decks — every archived deck, unfiltered; the client narrows it. */
export type MetaDeckListResponse = z.infer<typeof metaDeckListResponseSchema>;

/** GET /meta/decks/{token} — the public share-deck payload plus the archive panel. */
export type MetaDeckDetailResponse = z.infer<typeof metaDeckDetailResponseSchema>;

/** GET /meta/counts — how many standings rows and published decks are in scope. */
export type MetaCountsResponse = z.infer<typeof metaCountsResponseSchema>;

/** Admin event row: every stored column plus the roster and deck counts. */
export type AdminMetaEvent = z.infer<typeof adminMetaEventSchema>;

/** GET /admin/v1/meta/events — one filtered page of the live archive. */
export type AdminMetaEventList = z.infer<typeof adminMetaEventListResponseSchema>;

/** Admin standings row for one event's management table. */
export type AdminMetaPlayer = z.infer<typeof adminMetaPlayerSchema>;

// ── Candidate ingest (ADR-014) ───────────────────────────────────────────────

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

/** POST /admin/meta/upload — what the upload staged, changed, and could not match. */
export type MetaUploadResponse = z.infer<typeof metaUploadResponseSchema>;

/** One row of the candidate review queue. */
export type MetaCandidateQueueRow = z.infer<typeof metaCandidateQueueRowSchema>;

/** One candidate standings row with its resolution status and its diff against live. */
export type MetaCandidatePlayer = z.infer<typeof metaCandidatePlayerSchema>;

/** GET /admin/meta/candidates/{id} — the event, its diff, and all its standings. */
export type MetaCandidateDetail = z.infer<typeof metaCandidateDetailSchema>;

/** The result of accepting one candidate event. */
export type AcceptedMetaEventResponse = z.infer<typeof acceptedMetaEventSchema>;

/** The result of accepting one candidate standings row. */
export type AcceptedMetaPlayerResponse = z.infer<typeof acceptedMetaPlayerSchema>;

/** The result of accepting a candidate event together with its ready standings. */
export type AcceptedMetaEventWithPlayersResponse = z.infer<
  typeof acceptedMetaEventWithPlayersSchema
>;

/** One citation as the admin event editor lists it. */
export type AdminMetaEventSource = z.infer<typeof adminMetaEventSourceSchema>;

/** One source's version of a candidate event, with the standings it holds. */
export type MetaCandidateSource = z.infer<typeof metaCandidateSourceSchema>;

/** Where a link, relink, or unlink left a candidate event. */
export type MetaEventLinkResult = z.infer<typeof metaEventLinkResultSchema>;

/** Where a link, relink, or unlink left a candidate standings row. */
export type MetaPlayerLinkResult = z.infer<typeof metaPlayerLinkResultSchema>;

/** One ranked live event proposed for an unlinked candidate event. */
export type MetaEventMatchSuggestion = z.infer<typeof metaEventMatchSuggestionSchema>;

/** One ranked live standings row proposed for an unlinked candidate player. */
export type MetaPlayerMatchSuggestion = z.infer<typeof metaPlayerMatchSuggestionSchema>;

// ── User submissions (ADR-014, ADR-036) ──────────────────────────────────────

/**
 * POST /meta/submissions — one decklist against an existing or proposed event.
 * `z.input`, because the schema defaults every optional field: a client may omit
 * them, the handler always sees them filled in.
 */
export type MetaSubmissionInput = z.input<typeof metaSubmissionInputSchema>;

/** What staging one submission produced, including any names that matched nothing. */
export type MetaSubmissionResult = z.infer<typeof metaSubmissionResultSchema>;

/** One row of the contributor's own submission history. */
export type MetaSubmission = z.infer<typeof metaSubmissionSchema>;

/** GET /meta/submissions — the contributor's own history, newest first. */
export type MetaSubmissionListResponse = z.infer<typeof metaSubmissionListResponseSchema>;

/** GET/PATCH /meta/credit-visibility — whether the caller's contributions are credited. */
export type MetaCreditVisibilityResponse = z.infer<typeof metaCreditVisibilityResponseSchema>;
