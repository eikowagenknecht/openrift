import type { z } from "zod";

import type {
  acceptedMetaDeckSchema,
  acceptedMetaEventSchema,
  acceptedMetaEventWithDecksSchema,
  adminMetaDeckSchema,
  adminMetaEventSchema,
  metaCandidateDeckSchema,
  metaCandidateDetailSchema,
  metaCandidateQueueRowSchema,
  metaUploadResponseSchema,
  metaUploadSchema,
} from "../../contracts/admin/meta.js";
import type {
  metaDeckDetailResponseSchema,
  metaDeckListResponseSchema,
  metaDeckSummarySchema,
  metaEventDetailResponseSchema,
  metaEventDetailSchema,
  metaEventListResponseSchema,
  metaEventSummarySchema,
  metaStatsResponseSchema,
} from "../../contracts/meta.js";

/** One archived event as a list row: header fields plus how many decks it holds. */
export type MetaEventSummary = z.infer<typeof metaEventSummarySchema>;

/** The summary plus the long-form fields only the event's own page shows. */
export type MetaEventDetail = z.infer<typeof metaEventDetailSchema>;

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
