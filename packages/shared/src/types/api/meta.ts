import type { z } from "zod";

import type {
  acceptedMetaDeckSchema,
  acceptedMetaEventSchema,
  acceptedMetaEventWithDecksSchema,
  adminMetaDeckSchema,
  adminMetaEventSchema,
  adminMetaEventSourceSchema,
  metaCandidateDeckSchema,
  metaCandidateDetailSchema,
  metaCandidateQueueRowSchema,
  metaCandidateSourceSchema,
  metaDeckLinkResultSchema,
  metaDeckMatchSuggestionSchema,
  metaEventLinkResultSchema,
  metaEventMatchSuggestionSchema,
  metaUploadResponseSchema,
  metaUploadSchema,
} from "../../contracts/admin/meta.js";
import type {
  metaCreditVisibilityResponseSchema,
  metaDeckSubmissionInputSchema,
  metaDeckSubmissionListResponseSchema,
  metaDeckSubmissionResultSchema,
  metaDeckSubmissionSchema,
} from "../../contracts/meta-submissions.js";
import type {
  metaDeckDetailResponseSchema,
  metaDeckListResponseSchema,
  metaDeckSummarySchema,
  metaEventDetailResponseSchema,
  metaEventDetailSchema,
  metaEventListResponseSchema,
  metaEventSourceSchema,
  metaEventSummarySchema,
  metaStatsResponseSchema,
} from "../../contracts/meta.js";

/** One archived event as a list row: header fields plus how many decks it holds. */
export type MetaEventSummary = z.infer<typeof metaEventSummarySchema>;

/** The summary plus the long-form fields only the event's own page shows. */
export type MetaEventDetail = z.infer<typeof metaEventDetailSchema>;

/** One citation on an event: where a slice of its data came from. */
export type MetaEventSource = z.infer<typeof metaEventSourceSchema>;

/**
 * One archived deck as a tile or table row. Legend and champion are
 * denormalized so the browser renders without the catalog; both are nullable
 * because nothing forces an admin-entered deck to fill either zone.
 */
export type MetaDeckSummary = z.infer<typeof metaDeckSummarySchema>;

/** GET /meta/events — every archived event, newest first. */
export type MetaEventListResponse = z.infer<typeof metaEventListResponseSchema>;

/** GET /meta/events/{slug} — one event and its decks, best finish first. */
export type MetaEventDetailResponse = z.infer<typeof metaEventDetailResponseSchema>;

/** GET /meta/decks — the whole archive, unfiltered; the client narrows it. */
export type MetaDeckListResponse = z.infer<typeof metaDeckListResponseSchema>;

/** GET /meta/decks/{token} — the public share-deck payload plus the archive panel. */
export type MetaDeckDetailResponse = z.infer<typeof metaDeckDetailResponseSchema>;

/**
 * GET /meta/stats — card inclusion and legend play-rate over the decks in
 * scope, each with its own denominator: `totalDecks` for the legends,
 * `decksWithMainDeck` for the cards, which archetype entries are left out of.
 */
export type MetaStatsResponse = z.infer<typeof metaStatsResponseSchema>;

/** Admin event row: every stored column plus the deck count. */
export type AdminMetaEvent = z.infer<typeof adminMetaEventSchema>;

/** Admin deck row for one event's management table. */
export type AdminMetaDeck = z.infer<typeof adminMetaDeckSchema>;

// ── Candidate ingest (ADR-014) ───────────────────────────────────────────────

/**
 * The upload body external tooling posts. `z.input` rather than `z.infer`
 * because the schema defaults every optional field — a producer may omit them,
 * the service always sees them filled in.
 */
export type MetaUploadBody = z.input<typeof metaUploadSchema>;

/** One event of a validated upload payload, as the ingest service consumes it. */
export type MetaIngestEvent = z.infer<typeof metaUploadSchema>["events"][number];

/** One deck of {@link MetaIngestEvent}. */
export type MetaIngestEventDeck = MetaIngestEvent["decks"][number];

/** POST /admin/meta/upload — what the upload staged, changed, and could not match. */
export type MetaUploadResponse = z.infer<typeof metaUploadResponseSchema>;

/** One row of the candidate review queue. */
export type MetaCandidateQueueRow = z.infer<typeof metaCandidateQueueRowSchema>;

/** One candidate deck with its resolution status and its diff against live. */
export type MetaCandidateDeck = z.infer<typeof metaCandidateDeckSchema>;

/** GET /admin/meta/candidates/{id} — the event, its diff, and all its decks. */
export type MetaCandidateDetail = z.infer<typeof metaCandidateDetailSchema>;

/** The result of accepting one candidate event. */
export type AcceptedMetaEventResponse = z.infer<typeof acceptedMetaEventSchema>;

/** The result of accepting one candidate deck. */
export type AcceptedMetaDeckResponse = z.infer<typeof acceptedMetaDeckSchema>;

/** The result of accepting a candidate event together with its ready decks. */
export type AcceptedMetaEventWithDecksResponse = z.infer<typeof acceptedMetaEventWithDecksSchema>;

/** One citation as the admin event editor lists it. */
export type AdminMetaEventSource = z.infer<typeof adminMetaEventSourceSchema>;

/** One source's version of a candidate event, with the decks it holds. */
export type MetaCandidateSource = z.infer<typeof metaCandidateSourceSchema>;

/** Where a link, relink, or unlink left a candidate event. */
export type MetaEventLinkResult = z.infer<typeof metaEventLinkResultSchema>;

/** Where a link, relink, or unlink left a candidate deck. */
export type MetaDeckLinkResult = z.infer<typeof metaDeckLinkResultSchema>;

/** One ranked live event proposed for an unlinked candidate event. */
export type MetaEventMatchSuggestion = z.infer<typeof metaEventMatchSuggestionSchema>;

/** One ranked archived deck proposed for an unlinked candidate deck. */
export type MetaDeckMatchSuggestion = z.infer<typeof metaDeckMatchSuggestionSchema>;

// ── User submissions (ADR-014, ADR-036) ──────────────────────────────────────

/**
 * POST /meta/submissions — one decklist against an existing or proposed event.
 * `z.input`, because the schema defaults every optional field: a client may omit
 * them, the handler always sees them filled in.
 */
export type MetaDeckSubmissionInput = z.input<typeof metaDeckSubmissionInputSchema>;

/** What staging one submission produced, including any names that matched nothing. */
export type MetaDeckSubmissionResult = z.infer<typeof metaDeckSubmissionResultSchema>;

/** One row of the contributor's own submission history. */
export type MetaDeckSubmission = z.infer<typeof metaDeckSubmissionSchema>;

/** GET /meta/submissions — the contributor's own history, newest first. */
export type MetaDeckSubmissionListResponse = z.infer<typeof metaDeckSubmissionListResponseSchema>;

/** GET/PATCH /meta/credit-visibility — whether the caller's contributions are credited. */
export type MetaCreditVisibilityResponse = z.infer<typeof metaCreditVisibilityResponseSchema>;
