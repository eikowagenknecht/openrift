import { DEFAULT_PAIRING_CONFIG } from "./types.js";
import type { PairingConfig, PairingPlayer, Pod, PodPenaltyBreakdown } from "./types.js";

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
  for (const [i, memberA] of members.entries()) {
    for (const memberB of members.slice(i + 1)) {
      const meetings = memberA.opponents.get(memberB.id) ?? 0;
      rematch += config.rematchPenalties[Math.min(meetings, 3)] ?? 0;
      if (meetings > 0) {
        rematchPairs++;
      }
      const regionA = memberA.region ?? null;
      const regionB = memberB.region ?? null;
      if (regionA !== null && regionA === regionB) {
        sameRegion += config.sameRegionWeight;
      }
      let repeats = 0;
      if (regionB !== null) {
        repeats += memberA.regionHistory?.get(regionB) ?? 0;
      }
      if (regionA !== null) {
        repeats += memberB.regionHistory?.get(regionA) ?? 0;
      }
      repeatedRegion += repeats * config.repeatedRegionWeight;
      if (config.pairwiseScoreWeight > 0) {
        pairwise += Math.abs(memberA.score - memberB.score) * config.pairwiseScoreWeight;
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
