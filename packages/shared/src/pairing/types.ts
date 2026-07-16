import type { Random } from "../pack-opener/rng.js";

/**
 * A flat, database-free snapshot of one player going into a pairing. The
 * aggregates (`score`, `pods3`, `pods4`, `byes`, `opponents`) are derived by the
 * repo from the finalized rounds and handed to the engine; the engine never
 * touches a database.
 */
export interface PairingPlayer {
  id: string;
  score: number;
  /** Times this player has already been in a 3-player pod. */
  pods3: number;
  /** Times this player has already been in a 4-player pod. */
  pods4: number;
  /** Times this player has already taken a bye (sat out a round for win-equivalent points). */
  byes: number;
  /** opponentId -> number of prior pods shared with that opponent. */
  opponents: Map<string, number>;
  /** Region tag slug for region-aware events; null/absent when regions are off. */
  region?: string | null;
}

/** One game group within a round. Size 2 is a Swiss 1v1 match. */
export interface Pod {
  size: 2 | 3 | 4;
  playerIds: string[];
}

/** The number of 4-, 3-, and 2-player pods a round decomposes into. */
export interface PodSizes {
  fours: number;
  threes: number;
  /** 2-player pods (Swiss matches); absent means none. */
  twos?: number;
}

/** Which decomposition a pairing uses: FFA pods of 3/4 or Swiss 1v1 matches. */
export type PairingMode = "pod" | "swiss";

/**
 * Per-pod penalty terms plus the two display-only figures (`rematchPairs`,
 * `spread`). The named penalty terms sum to `total` under the default config
 * (the optional pairwise term is off by default).
 */
export interface PodPenaltyBreakdown {
  rematch: number;
  scoreSpread: number;
  /** The >=6 / >=9 spread surcharges. */
  imbalance: number;
  float: number;
  threePodRepeat: number;
  /**
   * Penalty for in-pod pairs sharing a region. Breakdowns stored before the
   * region feature lack this key; readers must coalesce it to 0.
   */
  sameRegion: number;
  total: number;
  /** Count of in-pod pairs that have met before, for the organizer display. */
  rematchPairs: number;
  /** Raw highest-minus-lowest score in the pod, for the organizer display. */
  spread: number;
}

/**
 * Which engine produced a pairing. Round 1 is `random`; round 2+ is
 * `local-search`; `manual` marks a pairing the organizer edited by hand.
 */
export type PairingStrategyName = "local-search" | "random" | "manual";

export interface PairingResult {
  pods: Pod[];
  totalPenalty: number;
  perPod: PodPenaltyBreakdown[];
  strategy: PairingStrategyName;
}

export interface PairingConfig {
  /** Penalty by number of prior meetings: [0, 1, 2, 3+]. */
  rematchPenalties: [number, number, number, number];
  /** Multiplier on the raw score spread (max - min). */
  scoreSpreadWeight: number;
  /** Flat surcharge added once when the spread is >= 6. */
  spreadSurcharge6: number;
  /** Further flat surcharge added once when the spread is >= 9 (stacks with the >=6 one). */
  spreadSurcharge9: number;
  /** Multiplier on each player's |score - podAverage|. */
  floatWeight: number;
  /**
   * Penalty per player in a 3-pod by their prior 3-pod count: [0, 1, 2, 3+].
   * A repeat must cost more than the spread/float noise of relocating 3-pod
   * duty to another score band (and slightly more than a first rematch), or
   * the engine parks the same bottom-band players in the 3-pod every round.
   */
  threePodRepeatPenalties: [number, number, number, number];
  /**
   * Penalty per in-pod pair that shares a region. Must lose to any rematch
   * (first rematch is 100) so avoiding a repeat opponent always beats avoiding
   * a region mirror, but beat moderate score spread (10 per point) so the
   * engine reaches across score bands before pairing two same-region players.
   */
  sameRegionWeight: number;
  /** Optional finer pairwise score term; default 0 (off). Reserved for a future weight. */
  pairwiseScoreWeight: number;
}

export const DEFAULT_PAIRING_CONFIG: PairingConfig = {
  rematchPenalties: [0, 100, 500, 2000],
  scoreSpreadWeight: 10,
  spreadSurcharge6: 50,
  spreadSurcharge9: 150,
  floatWeight: 5,
  threePodRepeatPenalties: [0, 120, 600, 2400],
  sameRegionWeight: 70,
  pairwiseScoreWeight: 0,
};

/**
 * A pairing engine. The seam stays thin (no budget here) so an exact small-field
 * solver can be added later as a sibling without touching callers.
 */
export interface PairingStrategy {
  pair: (
    players: PairingPlayer[],
    sizes: PodSizes,
    config: PairingConfig,
    rng: Random,
  ) => PairingResult;
}

export interface LocalSearchBudget {
  /** Randomized starting orders. */
  restarts: number;
  /** Local-improvement steps before stopping a restart. */
  maxSwapsPerRestart: number;
}

export const DEFAULT_LOCAL_SEARCH_BUDGET: LocalSearchBudget = {
  restarts: 30,
  maxSwapsPerRestart: 2000,
};

/** Optional knobs for `generatePairing`; everything defaults sensibly. */
export interface GeneratePairingOptions {
  /** Decomposition mode; defaults to `pod` (FFA pods of 3/4). */
  mode?: PairingMode;
  config?: PairingConfig;
  rng?: Random;
  budget?: LocalSearchBudget;
}
