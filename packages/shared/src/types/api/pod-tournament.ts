import type { podReportResponseSchema } from "@openrift/shared/contracts/public-pod-tournaments";
import type {
  groupCutTierSchema,
  groupQualificationRowSchema,
  groupStageGroupSchema,
  groupStageViewSchema,
  groupStandingRowSchema,
  legendMetaShareSchema,
  podByeResponseSchema,
  podMemberResponseSchema,
  podPenaltyViewSchema,
  podPlayerResponseSchema,
  podPlayerStatusSchema,
  podReportTokenResponseSchema,
  podResponseSchema,
  podResultStatusSchema,
  podRoundResponseSchema,
  podRoundStatusSchema,
  podScoringSchemeSchema,
  podSnapshotPlayerSchema,
  podStandingRowSchema,
  podTournamentDetailResponseSchema,
  podTournamentResponseSchema,
} from "@openrift/shared/response-schemas";
import type { z } from "zod";

import type { TournamentStatus } from "./tournament.js";

/**
 * The pod engine reads the umbrella's own `tournaments.status`; a cancelled
 * tournament still resolves through `runState` and the public report token.
 */
export type PodTournamentStatus = TournamentStatus;
export type PodScoringScheme = z.infer<typeof podScoringSchemeSchema>;
export type PodRoundStatus = z.infer<typeof podRoundStatusSchema>;
export type PodResultStatus = z.infer<typeof podResultStatusSchema>;
export type PodPlayerStatus = z.infer<typeof podPlayerStatusSchema>;

export type PodTournamentResponse = z.infer<typeof podTournamentResponseSchema>;

export interface PodTournamentSummaryResponse extends PodTournamentResponse {
  playerCount: number;
  activePlayerCount: number;
  roundCount: number;
}

export interface PodTournamentListResponse {
  items: PodTournamentSummaryResponse[];
}

export type PodPlayerResponse = z.infer<typeof podPlayerResponseSchema>;

export type PodStandingRow = z.infer<typeof podStandingRowSchema>;

export type PodMemberResponse = z.infer<typeof podMemberResponseSchema>;

/** Organizer-only; absent on the participant surface. */
export type PodPenaltyView = z.infer<typeof podPenaltyViewSchema>;

export type PodResponse = z.infer<typeof podResponseSchema>;

export type PodByeResponse = z.infer<typeof podByeResponseSchema>;

export type PodRoundResponse = z.infer<typeof podRoundResponseSchema>;

/** `opponents` is a plain record, not a Map, so it serializes over the wire. */
export type PodSnapshotPlayer = z.infer<typeof podSnapshotPlayerSchema>;

export type PodTournamentDetailResponse = z.infer<typeof podTournamentDetailResponseSchema>;

/** The token-gated participant payload; no penalty internals. */
export type PodReportResponse = z.infer<typeof podReportResponseSchema>;

export type PodReportTokenResponse = z.infer<typeof podReportTokenResponseSchema>;

export type GroupCutTierView = z.infer<typeof groupCutTierSchema>;
export type GroupStandingRowView = z.infer<typeof groupStandingRowSchema>;
export type GroupStageGroupView = z.infer<typeof groupStageGroupSchema>;
export type GroupQualificationRowView = z.infer<typeof groupQualificationRowSchema>;
export type GroupStageView = z.infer<typeof groupStageViewSchema>;
export type LegendMetaShareView = z.infer<typeof legendMetaShareSchema>;
