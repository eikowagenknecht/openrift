import type { z } from "zod";

import type {
  adminMetaEventListResponseSchema,
  adminMetaEventSchema,
  adminMetaEventSourceSchema,
} from "../../contracts/admin/meta-events.js";
import type {
  metaCrossSourceCitationSchema,
  metaCrossSourceReviewSchema,
  metaCrossSourceRowSchema,
  metaEventMatchSuggestionSchema,
  metaPlayerMatchSuggestionSchema,
} from "../../contracts/admin/meta-matching.js";
import type {
  metaEventDriftSchema,
  metaOverlayBulkAcceptResultSchema,
  metaOverlayDetailSchema,
  metaOverlayMatchStateSchema,
  metaOverlayQueueRowSchema,
  metaOverlayReviewResultSchema,
  metaOverlayRowMatchSchema,
} from "../../contracts/admin/meta-overlays.js";
import type { adminMetaPlayerSchema } from "../../contracts/admin/meta-players.js";
import type {
  metaUploadResponseSchema,
  metaUploadRevertResultSchema,
  metaUploadSchema,
  metaUploadSummarySchema,
} from "../../contracts/admin/meta-uploads.js";
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

export type MetaEventSummary = z.infer<typeof metaEventSummarySchema>;

export type MetaEventFinish = z.infer<typeof metaEventFinishSchema>;

export type MetaEventDetail = z.infer<typeof metaEventDetailSchema>;

export type MetaEventSource = z.infer<typeof metaEventSourceSchema>;

/** Every archived event carries its whole field here; only entries with a known list have a deck behind them. */
export type MetaEventPlayer = z.infer<typeof metaEventPlayerSchema>;

export type MetaEventMatch = z.infer<typeof metaEventMatchSchema>;

export type MetaEventPhase = z.infer<typeof metaEventPhaseSchema>;

/** Legend and champion are denormalized and both nullable: nothing forces an admin-entered deck to fill either. */
export type MetaDeckSummary = z.infer<typeof metaDeckSummarySchema>;

export type MetaEventListResponse = z.infer<typeof metaEventListResponseSchema>;

export type MetaActivityItem = z.infer<typeof metaActivityItemSchema>;

export type MetaActivityResponse = z.infer<typeof metaActivityResponseSchema>;

export type MetaEventDetailResponse = z.infer<typeof metaEventDetailResponseSchema>;

export type MetaDeckListResponse = z.infer<typeof metaDeckListResponseSchema>;

export type MetaDeckCardIndexResponse = z.infer<typeof metaDeckCardIndexResponseSchema>;

export type MetaDeckDetailResponse = z.infer<typeof metaDeckDetailResponseSchema>;

export type MetaCountsResponse = z.infer<typeof metaCountsResponseSchema>;

export type MetaLegendFinish = z.infer<typeof metaLegendFinishSchema>;

export type MetaLegendSummary = z.infer<typeof metaLegendSummarySchema>;

export type { MetaLegendEventRecord } from "../../contracts/meta.js";

export type MetaLegendListResponse = z.infer<typeof metaLegendListResponseSchema>;

export type MetaLegendDetailResponse = z.infer<typeof metaLegendDetailResponseSchema>;

export type MetaPlayerFinish = z.infer<typeof metaPlayerFinishSchema>;

export type MetaPlayerDetailResponse = z.infer<typeof metaPlayerDetailResponseSchema>;

export type MetaScopeQuery = z.infer<typeof metaScopeQuerySchema>;

export type MetaCountsQuery = z.infer<typeof metaCountsQuerySchema>;

export type AdminMetaEvent = z.infer<typeof adminMetaEventSchema>;

export type AdminMetaEventList = z.infer<typeof adminMetaEventListResponseSchema>;

export type AdminMetaPlayer = z.infer<typeof adminMetaPlayerSchema>;

/** Uses `z.input`: the schema defaults every optional field before the service sees it. */
export type MetaUploadBody = z.input<typeof metaUploadSchema>;

export type MetaIngestEvent = z.infer<typeof metaUploadSchema>["events"][number];

export type MetaIngestEventPlayer = MetaIngestEvent["players"][number];

export type MetaUploadResponse = z.infer<typeof metaUploadResponseSchema>;

export type MetaOverlayQueueRow = z.infer<typeof metaOverlayQueueRowSchema>;

export type MetaOverlayMatchState = z.infer<typeof metaOverlayMatchStateSchema>;

export type MetaOverlayRowMatch = z.infer<typeof metaOverlayRowMatchSchema>;

export type MetaOverlayBulkAcceptResult = z.infer<typeof metaOverlayBulkAcceptResultSchema>;

export type MetaOverlayReviewResult = z.infer<typeof metaOverlayReviewResultSchema>;

export type MetaOverlayDetail = z.infer<typeof metaOverlayDetailSchema>;

export type AdminMetaEventSource = z.infer<typeof adminMetaEventSourceSchema>;

export type MetaEventDrift = z.infer<typeof metaEventDriftSchema>;

export type MetaEventMatchSuggestion = z.infer<typeof metaEventMatchSuggestionSchema>;

export type MetaPlayerMatchSuggestion = z.infer<typeof metaPlayerMatchSuggestionSchema>;

export type MetaCrossSourceReview = z.infer<typeof metaCrossSourceReviewSchema>;

export type MetaCrossSourceRow = z.infer<typeof metaCrossSourceRowSchema>;

export type MetaCrossSourceCitation = z.infer<typeof metaCrossSourceCitationSchema>;

export type MetaUploadSummary = z.infer<typeof metaUploadSummarySchema>;

export type MetaUploadRevertResult = z.infer<typeof metaUploadRevertResultSchema>;

/** Uses `z.input`: the schema defaults every optional field before the handler sees it. */
export type MetaSubmissionInput = z.input<typeof metaSubmissionInputSchema>;

export type MetaSubmissionResult = z.infer<typeof metaSubmissionResultSchema>;

export type MetaEventCorrectionInput = z.input<typeof metaEventCorrectionInputSchema>;

export type MetaEventFieldEdits = z.infer<typeof metaEventFieldEditsSchema>;

export type MetaSubmission = z.infer<typeof metaSubmissionSchema>;

export type MetaSubmissionListResponse = z.infer<typeof metaSubmissionListResponseSchema>;

export type MetaCreditVisibilityResponse = z.infer<typeof metaCreditVisibilityResponseSchema>;
