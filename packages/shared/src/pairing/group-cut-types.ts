/**
 * Group stage + fixed top cut. Database-free shapes shared by the scheduling,
 * standings and bracket modules and by the API presenters.
 */

export const GROUP_CUT_TIERS = [
  "h2h",
  "mini_table",
  "mw",
  "gw",
  "legend_count",
  "meta_share",
  "meta_pending",
  "draw",
] as const;

/** The criterion that placed a row below the row directly above it. */
export type GroupCutTier = (typeof GROUP_CUT_TIERS)[number];

export const CUT_SIZES = [4, 8, 16] as const;
export type CutSize = (typeof CUT_SIZES)[number];

export const GROUP_STAGE_ROUNDS = 3;

/** Slot order is array order; the round tables pair by slot index. */
export interface GroupPlanGroup {
  label: string;
  playerIds: string[];
  /** Label of the paired 3-player group, null for a 4-player group. */
  pairedWith: string | null;
}

export interface GroupPlan {
  groups: GroupPlanGroup[];
}

export interface GroupMatch {
  playerIds: [string, string];
  /** Null while unreported. Equal placements are a draw. */
  placements: [number, number] | null;
  /** Null on a walkover: the match counts, its games do not. */
  gamePoints: [number | null, number | null];
}

export interface LegendTiebreakInput {
  legendByPlayer: ReadonlyMap<string, string | null>;
  metaShareByLegend: ReadonlyMap<string, number>;
}

export interface GroupStandingsInput {
  groups: GroupPlanGroup[];
  matches: GroupMatch[];
  winPoints: number;
  drawPoints: number;
  /** Null when the Legend tiers are off for the tournament. */
  legend: LegendTiebreakInput | null;
  /** The deterministic final key; lower sorts first. */
  tieBreakKey: (playerId: string) => number;
}

export interface GroupStandingRow {
  playerId: string;
  place: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  gamesWon: number;
  gamesPlayed: number;
  /** Null until a game has been played. */
  gameWinRate: number | null;
  decidedBy: GroupCutTier | null;
}

export interface GroupStandings {
  label: string;
  rows: GroupStandingRow[];
}

export interface QualificationRow {
  playerId: string;
  groupLabel: string;
  place: number;
  matchWinRate: number;
  gameWinRate: number | null;
  decidedBy: GroupCutTier | null;
}

export interface GroupStageRanking {
  groups: GroupStandings[];
  /** Placement-first order across the whole field. */
  ranking: QualificationRow[];
  /** Legends whose meta share a reached tie still needs. */
  pendingMetaLegendIds: string[];
}

export interface BracketSeed {
  seed: number;
  playerId: string;
  groupLabel: string;
  /** Group-stage opponents, the cross-group one included. */
  opponentIds: readonly string[];
}

export interface BracketSlot {
  podNumber: number;
  /** Higher seed (lower number) first. */
  seeds: [number, number];
  playerIds: [string, string];
}
