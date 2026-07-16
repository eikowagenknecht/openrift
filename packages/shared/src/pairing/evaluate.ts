import { DEFAULT_PAIRING_CONFIG } from "./types.js";
import type { PairingConfig, PairingPlayer, Pod, PodPenaltyBreakdown } from "./types.js";

/**
 * Score one pod against the penalty function. Pure; reads only the snapshot.
 *
 * - Rematch: every unordered in-pod pair adds `rematchPenalties[min(meetings, 3)]`.
 * - Score spread: `(max - min) * scoreSpreadWeight`, plus `spreadSurcharge6` once
 *   at spread >= 6 and a further `spreadSurcharge9` once at spread >= 9.
 * - Float: per player, `abs(score - podAverage) * floatWeight`.
 * - Three-pod repeat: per player in a 3-pod, `threePodRepeatPenalties[min(pods3, 3)]`.
 * - Same region: every unordered in-pod pair whose members share a region adds
 *   `sameRegionWeight`; players without a region never match.
 * - Repeated region: every unordered in-pod pair adds `repeatedRegionWeight`
 *   per time either member has already faced the other's region (both
 *   directions summed), so players see region variety across rounds.
 * - Optional pairwise score term, off by default (`pairwiseScoreWeight = 0`).
 *
 * @param pod The pod to score.
 * @param playersById Lookup from player id to its snapshot.
 * @param config The penalty weights.
 * @returns The per-term penalty breakdown for the pod.
 */
export function evaluatePod(
  pod: Pod,
  playersById: ReadonlyMap<string, PairingPlayer>,
  config: PairingConfig = DEFAULT_PAIRING_CONFIG,
): PodPenaltyBreakdown {
  const members = pod.playerIds.map((id) => {
    const player = playersById.get(id);
    if (player === undefined) {
      throw new Error(`evaluatePod: unknown player id ${id}`);
    }
    return player;
  });

  let rematch = 0;
  let rematchPairs = 0;
  let sameRegion = 0;
  let repeatedRegion = 0;
  let pairwise = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const meetings = members[i].opponents.get(members[j].id) ?? 0;
      rematch += config.rematchPenalties[Math.min(meetings, 3)] ?? 0;
      if (meetings > 0) {
        rematchPairs++;
      }
      const regionA = members[i].region ?? null;
      const regionB = members[j].region ?? null;
      if (regionA !== null && regionA === regionB) {
        sameRegion += config.sameRegionWeight;
      }
      let repeats = 0;
      if (regionB !== null) {
        repeats += members[i].regionHistory?.get(regionB) ?? 0;
      }
      if (regionA !== null) {
        repeats += members[j].regionHistory?.get(regionA) ?? 0;
      }
      repeatedRegion += repeats * config.repeatedRegionWeight;
      if (config.pairwiseScoreWeight > 0) {
        pairwise += Math.abs(members[i].score - members[j].score) * config.pairwiseScoreWeight;
      }
    }
  }

  const scores = members.map((member) => member.score);
  const spread = Math.max(...scores) - Math.min(...scores);
  const scoreSpread = spread * config.scoreSpreadWeight;
  let imbalance = 0;
  if (spread >= 6) {
    imbalance += config.spreadSurcharge6;
  }
  if (spread >= 9) {
    imbalance += config.spreadSurcharge9;
  }

  const podAverage = scores.reduce((sum, score) => sum + score, 0) / members.length;
  let float = 0;
  for (const score of scores) {
    float += Math.abs(score - podAverage) * config.floatWeight;
  }

  let threePodRepeat = 0;
  if (pod.size === 3) {
    for (const member of members) {
      threePodRepeat += config.threePodRepeatPenalties[Math.min(member.pods3, 3)] ?? 0;
    }
  }

  const total =
    rematch +
    scoreSpread +
    imbalance +
    float +
    threePodRepeat +
    sameRegion +
    repeatedRegion +
    pairwise;
  return {
    rematch,
    scoreSpread,
    imbalance,
    float,
    threePodRepeat,
    sameRegion,
    repeatedRegion,
    total,
    rematchPairs,
    spread,
  };
}

/**
 * Score a whole-round pairing: the per-pod breakdowns plus the round total. The
 * engine minimizes `totalPenalty` across every candidate pairing.
 *
 * @param pods The pods making up the round.
 * @param players The player snapshots referenced by the pods.
 * @param config The penalty weights; defaults to {@link DEFAULT_PAIRING_CONFIG}.
 * @returns The per-pod breakdowns and the summed round penalty.
 */
export function evaluatePairing(
  pods: Pod[],
  players: PairingPlayer[],
  config: PairingConfig = DEFAULT_PAIRING_CONFIG,
): { perPod: PodPenaltyBreakdown[]; totalPenalty: number } {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const perPod = pods.map((pod) => evaluatePod(pod, playersById, config));
  const totalPenalty = perPod.reduce((sum, breakdown) => sum + breakdown.total, 0);
  return { perPod, totalPenalty };
}
