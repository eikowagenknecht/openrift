import type { Random } from "../pack-opener/rng.js";

/**
 * A flat, database-free snapshot of one player going into a pairing; the
 * engine itself never touches a database.
 */
export interface PairingPlayer {
  id: string;
  score: number;
  pods3: number;
  pods4: number;
  byes: number;
  opponents: Map<string, number>;
  region?: string | null;
  regionHistory?: ReadonlyMap<string, number>;
  fixedTable?: number | null;
}

export interface Pod {
  size: 2 | 3 | 4;
  playerIds: string[];
}

export interface PodSizes {
  fours: number;
  threes: number;
  twos?: number;
}

export type PairingMode = "pod" | "swiss";

export interface PodPenaltyBreakdown {
  rematch: number;
  scoreSpread: number;
  imbalance: number;
  float: number;
  threePodRepeat: number;
  sameRegion: number;
  repeatedRegion: number;
  total: number;
  rematchPairs: number;
  spread: number;
}

export type PairingStrategyName = "local-search" | "random" | "manual";

export interface PairingResult {
  pods: Pod[];
  totalPenalty: number;
  perPod: PodPenaltyBreakdown[];
  strategy: PairingStrategyName;
}

export interface PairingConfig {
  rematchPenalties: [number, number, number, number];
  scoreSpreadWeight: number;
  spreadSurcharge6: number;
  spreadSurcharge9: number;
  floatWeight: number;
  threePodRepeatPenalties: [number, number, number, number];
  sameRegionWeight: number;
  repeatedRegionWeight: number;
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
  repeatedRegionWeight: 25,
  pairwiseScoreWeight: 0,
};

export interface PairingStrategy {
  pair: (
    players: PairingPlayer[],
    sizes: PodSizes,
    config: PairingConfig,
    rng: Random,
  ) => PairingResult;
}

export interface LocalSearchBudget {
  restarts: number;
  maxSwapsPerRestart: number;
}

export const DEFAULT_LOCAL_SEARCH_BUDGET: LocalSearchBudget = {
  restarts: 30,
  maxSwapsPerRestart: 2000,
};

export interface GeneratePairingOptions {
  mode?: PairingMode;
  config?: PairingConfig;
  rng?: Random;
  budget?: LocalSearchBudget;
}
