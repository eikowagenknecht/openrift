import type { podReportResponseSchema } from "@openrift/shared/contracts/public-pod-tournaments";
import type {
  podByeResponseSchema,
  podMemberResponseSchema,
  podPenaltyViewSchema,
  podPlayerResponseSchema,
  podReportTokenResponseSchema,
  podResponseSchema,
  podRoundResponseSchema,
  podSnapshotPlayerSchema,
  podStandingRowSchema,
  podTournamentDetailResponseSchema,
  podTournamentResponseSchema,
} from "@openrift/shared/response-schemas";
import type { z } from "zod";

import type { TournamentStatus } from "./tournament.js";

/**
 * The pod engine reads the umbrella's own `tournaments.status`, so the pod
 * surface sees the same four values — a cancelled tournament still resolves
 * through `runState` and the public report token (ADR-033).
 */
export type PodTournamentStatus = TournamentStatus;
export type PodScoringScheme = "standard" | "three_pod_reduced";
export type PodRoundStatus = "reporting" | "finalized";
export type PodResultStatus = "pending" | "reported";
export type PodPlayerStatus = "active" | "dropped";

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

/** A standings row, fully derived from the finalized rounds. */
export type PodStandingRow = z.infer<typeof podStandingRowSchema>;

export type PodMemberResponse = z.infer<typeof podMemberResponseSchema>;

/** The engine's per-pod penalty breakdown. Organizer-only; absent on the participant surface. */
export type PodPenaltyView = z.infer<typeof podPenaltyViewSchema>;

export type PodResponse = z.infer<typeof podResponseSchema>;

/** A player sitting a round out for win-equivalent points. */
export type PodByeResponse = z.infer<typeof podByeResponseSchema>;

export type PodRoundResponse = z.infer<typeof podRoundResponseSchema>;

/**
 * One player's pre-round aggregates, used by the organizer's open-round warnings
 * and manual pairing editor. Organizer-only — `opponents` is a plain record so it
 * serializes over the wire (the engine's `PairingPlayer` uses a Map).
 */
export type PodSnapshotPlayer = z.infer<typeof podSnapshotPlayerSchema>;

/** The owner dashboard payload for one tournament. */
export type PodTournamentDetailResponse = z.infer<typeof podTournamentDetailResponseSchema>;

/** The token-gated participant follow-along payload (no penalty internals). */
export type PodReportResponse = z.infer<typeof podReportResponseSchema>;

export type PodReportTokenResponse = z.infer<typeof podReportTokenResponseSchema>;
