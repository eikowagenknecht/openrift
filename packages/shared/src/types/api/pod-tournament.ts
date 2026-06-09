export type PodTournamentStatus = "setup" | "running" | "completed";
export type PodScoringScheme = "standard" | "three_pod_reduced";
export type PodRoundStatus = "reporting" | "finalized";
export type PodResultStatus = "pending" | "reported";
export type PodPlayerStatus = "active" | "dropped";

export interface PodTournamentResponse {
  id: string;
  name: string;
  status: PodTournamentStatus;
  currentRound: number;
  scoringScheme: PodScoringScheme;
  /** `null` when the participant report link is disabled. */
  reportToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PodTournamentSummaryResponse extends PodTournamentResponse {
  playerCount: number;
  activePlayerCount: number;
  roundCount: number;
}

export interface PodTournamentListResponse {
  items: PodTournamentSummaryResponse[];
}

export interface PodPlayerResponse {
  id: string;
  displayName: string;
  status: PodPlayerStatus;
  /** Round number after which the player was dropped; `null` while active. */
  droppedAfterRound: number | null;
  createdAt: string;
}

/** A standings row, fully derived from the finalized rounds. */
export interface PodStandingRow {
  playerId: string;
  displayName: string;
  status: PodPlayerStatus;
  droppedAfterRound: number | null;
  score: number;
  roundsPlayed: number;
  pods3Count: number;
  pods4Count: number;
}

export interface PodMemberResponse {
  playerId: string;
  displayName: string;
  /** 1-based; ties share a value; `null` until the pod is reported. */
  placement: number | null;
  /** Derived from placement at read time; `null` until reported. */
  points: number | null;
}

/** The engine's per-pod penalty breakdown. Organizer-only; absent on the participant surface. */
export interface PodPenaltyView {
  total: number;
  rematchPairs: number;
  spread: number;
  scoreSpread: number;
  imbalance: number;
  float: number;
  threePodRepeat: number;
}

export interface PodResponse {
  id: string;
  podNumber: number;
  size: 3 | 4;
  resultStatus: PodResultStatus;
  members: PodMemberResponse[];
  /** `null` on the participant follow-along (fairness internals are organizer-only). */
  penalty: PodPenaltyView | null;
}

export interface PodRoundResponse {
  id: string;
  roundNumber: number;
  status: PodRoundStatus;
  pairingStrategy: string | null;
  /** `null` on the participant follow-along. */
  penaltyTotal: number | null;
  createdAt: string;
  finalizedAt: string | null;
  pods: PodResponse[];
}

/** The owner dashboard payload for one tournament. */
export interface PodTournamentDetailResponse {
  tournament: PodTournamentResponse;
  players: PodPlayerResponse[];
  standings: PodStandingRow[];
  rounds: PodRoundResponse[];
}

/** The token-gated participant follow-along payload (no penalty internals). */
export interface PodReportResponse {
  tournamentName: string;
  status: PodTournamentStatus;
  currentRound: number;
  standings: PodStandingRow[];
  rounds: PodRoundResponse[];
}

export interface PodReportTokenResponse {
  reportToken: string | null;
}
