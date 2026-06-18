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
  /** Score points a sat-out (bye) game is worth (organizer-configurable; default 3). */
  byePoints: number;
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
  /** Sum of raw game points across finalized pods. Third tie-breaker. */
  gamePoints: number;
  roundsPlayed: number;
  pods3Count: number;
  pods4Count: number;
  /** Byes taken (each a sat-out round worth the tournament's bye points). */
  byeCount: number;
  /** Pods won outright (sole 1st place). First standings tie-breaker after score. */
  podWins: number;
  /** Mean current score of every player met so far. Second tie-breaker. */
  avgOpponentScore: number;
  /** Mean game points of every player met so far. Fourth tie-breaker. */
  avgOpponentGamePoints: number;
}

export interface PodMemberResponse {
  playerId: string;
  displayName: string;
  /** Raw game points entered for this player; `null` until the pod is reported. */
  gamePoints: number | null;
  /** 1-based; ties share a value; derived from game points; `null` until reported. */
  placement: number | null;
  /** Scheme points derived from placement at read time; `null` until reported. */
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

/** A player sitting a round out for win-equivalent points. */
export interface PodByeResponse {
  playerId: string;
  displayName: string;
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
  /** Players sitting this round out. */
  byes: PodByeResponse[];
}

/**
 * One player's pre-round aggregates, used by the organizer's open-round warnings
 * and manual pairing editor. Organizer-only — `opponents` is a plain record so it
 * serializes over the wire (the engine's `PairingPlayer` uses a Map).
 */
export interface PodSnapshotPlayer {
  playerId: string;
  score: number;
  pods3: number;
  pods4: number;
  byes: number;
  /** opponentId -> prior meetings. */
  opponents: Record<string, number>;
}

/** The owner dashboard payload for one tournament. */
export interface PodTournamentDetailResponse {
  tournament: PodTournamentResponse;
  players: PodPlayerResponse[];
  standings: PodStandingRow[];
  rounds: PodRoundResponse[];
  /**
   * Per-player aggregates entering the open round, for warnings and the manual
   * editor. `null` when no round is open. Organizer-only.
   */
  openRoundSnapshot: PodSnapshotPlayer[] | null;
}

/** The token-gated participant follow-along payload (no penalty internals). */
export interface PodReportResponse {
  tournamentName: string;
  status: PodTournamentStatus;
  currentRound: number;
  /** The active scheme, so the participant result form can preview derived points. */
  scoringScheme: PodScoringScheme;
  /** Score points a sat-out (bye) game is worth, shown on the byes card. */
  byePoints: number;
  standings: PodStandingRow[];
  rounds: PodRoundResponse[];
}

export interface PodReportTokenResponse {
  reportToken: string | null;
}
