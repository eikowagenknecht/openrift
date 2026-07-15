import { mathRandom } from "../pack-opener/rng.js";
import type { Random } from "../pack-opener/rng.js";
import { evaluatePod } from "./evaluate.js";
import { determinePodSizes } from "./pod-sizes.js";
import { DEFAULT_LOCAL_SEARCH_BUDGET, DEFAULT_PAIRING_CONFIG } from "./types.js";
import type {
  LocalSearchBudget,
  PairingConfig,
  PairingPlayer,
  PairingResult,
  PairingStrategy,
  Pod,
  PodSizes,
} from "./types.js";

/** Thrown when an active-player count cannot be split into pods of 3 and 4 (1, 2, 5). */
export class InvalidPlayerCountError extends Error {
  readonly playerCount: number;
  constructor(playerCount: number) {
    super(
      `Cannot split ${playerCount} active player(s) into pods of 3 and 4. A round needs at least 3 active players, and 5 cannot be split; add or drop a player.`,
    );
    this.name = "InvalidPlayerCountError";
    this.playerCount = playerCount;
  }
}

/** Treat penalties within this tolerance as equal (float terms are fractional). */
const EPSILON = 1e-9;

// Fisher-Yates shuffle into a new array, driven by the injected rng.
function shuffle<T>(items: readonly T[], rng: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const atI = result[i];
    const atJ = result[j];
    result[i] = atJ;
    result[j] = atI;
  }
  return result;
}

// Order players by score (descending), shuffling within each equal-score band so
// restarts differ. Grouping similar scores adjacently is the seed for chunking.
function constructOrder(players: PairingPlayer[], rng: Random): PairingPlayer[] {
  const byScore = Map.groupBy(players, (player) => player.score);
  const scoresDescending = [...byScore.keys()].toSorted((a, b) => b - a);
  const ordered: PairingPlayer[] = [];
  for (const score of scoresDescending) {
    ordered.push(...shuffle(byScore.get(score) ?? [], rng));
  }
  return ordered;
}

// Fill the determined pod sizes top to bottom, shuffling which positions in the
// score order become the 3-pods. A fixed fours-then-threes order would anchor
// every restart's 3-pods to the bottom of the standings, and best-improvement
// search cannot relocate a whole 3-pod across a penalty barrier one swap at a
// time — so without this shuffle the same low-scoring players get 3-pod duty
// round after round.
function chunkIntoPods(ordered: PairingPlayer[], sizes: PodSizes, rng: Random): Pod[] {
  const sequence: (3 | 4)[] = shuffle(
    [
      ...Array.from<unknown, 3 | 4>({ length: sizes.fours }, () => 4),
      ...Array.from<unknown, 3 | 4>({ length: sizes.threes }, () => 3),
    ],
    rng,
  );
  const pods: Pod[] = [];
  let index = 0;
  for (const size of sequence) {
    pods.push({ size, playerIds: ordered.slice(index, index + size).map((player) => player.id) });
    index += size;
  }
  return pods;
}

function podTotal(
  playerIds: string[],
  size: 3 | 4,
  playersById: ReadonlyMap<string, PairingPlayer>,
  config: PairingConfig,
): number {
  return evaluatePod({ size, playerIds }, playersById, config).total;
}

interface Move {
  delta: number;
  apply: (pods: Pod[]) => void;
}

// Find the single best improving whole-round move: scan every cross-pod 2-swap
// first, and only if none improves, scan 3-cycles (the rarer, more expensive
// neighborhood, reached only at a 2-swap local minimum). Returns null at a true
// local minimum of both neighborhoods.
function findBestMove(
  pods: Pod[],
  totals: number[],
  playersById: ReadonlyMap<string, PairingPlayer>,
  config: PairingConfig,
): Move | null {
  let best: Move | null = null;

  // 2-swaps: exchange one player between two different pods.
  for (let a = 0; a < pods.length; a++) {
    for (let b = a + 1; b < pods.length; b++) {
      const podA = pods[a];
      const podB = pods[b];
      const baseline = totals[a] + totals[b];
      for (let posA = 0; posA < podA.playerIds.length; posA++) {
        for (let posB = 0; posB < podB.playerIds.length; posB++) {
          const newA = podA.playerIds.with(posA, podB.playerIds[posB]);
          const newB = podB.playerIds.with(posB, podA.playerIds[posA]);
          const delta =
            podTotal(newA, podA.size, playersById, config) +
            podTotal(newB, podB.size, playersById, config) -
            baseline;
          if (delta < -EPSILON && (best === null || delta < best.delta)) {
            best = {
              delta,
              apply: (target) => {
                target[a] = { size: podA.size, playerIds: newA };
                target[b] = { size: podB.size, playerIds: newB };
              },
            };
          }
        }
      }
    }
  }
  if (best !== null) {
    return best;
  }

  // 3-cycles: rotate one player across three different pods, both directions.
  for (let a = 0; a < pods.length; a++) {
    for (let b = a + 1; b < pods.length; b++) {
      for (let c = b + 1; c < pods.length; c++) {
        const podA = pods[a];
        const podB = pods[b];
        const podC = pods[c];
        const baseline = totals[a] + totals[b] + totals[c];
        for (let posA = 0; posA < podA.playerIds.length; posA++) {
          for (let posB = 0; posB < podB.playerIds.length; posB++) {
            for (let posC = 0; posC < podC.playerIds.length; posC++) {
              const x = podA.playerIds[posA];
              const y = podB.playerIds[posB];
              const z = podC.playerIds[posC];
              // Two rotation directions: forward (X->B, Y->C, Z->A) and reverse.
              for (const [intoA, intoB, intoC] of [
                [z, x, y],
                [y, z, x],
              ] as const) {
                const newA = podA.playerIds.with(posA, intoA);
                const newB = podB.playerIds.with(posB, intoB);
                const newC = podC.playerIds.with(posC, intoC);
                const delta =
                  podTotal(newA, podA.size, playersById, config) +
                  podTotal(newB, podB.size, playersById, config) +
                  podTotal(newC, podC.size, playersById, config) -
                  baseline;
                if (delta < -EPSILON && (best === null || delta < best.delta)) {
                  best = {
                    delta,
                    apply: (target) => {
                      target[a] = { size: podA.size, playerIds: newA };
                      target[b] = { size: podB.size, playerIds: newB };
                      target[c] = { size: podC.size, playerIds: newC };
                    },
                  };
                }
              }
            }
          }
        }
      }
    }
  }
  return best;
}

// One restart: construct a seed, then best-improvement until a local minimum or the step cap.
function searchOnce(
  players: PairingPlayer[],
  sizes: PodSizes,
  config: PairingConfig,
  rng: Random,
  budget: LocalSearchBudget,
  playersById: ReadonlyMap<string, PairingPlayer>,
): { pods: Pod[]; total: number } {
  const pods = chunkIntoPods(constructOrder(players, rng), sizes, rng);
  const totals = pods.map((pod) => evaluatePod(pod, playersById, config).total);
  let total = totals.reduce((sum, value) => sum + value, 0);

  for (let step = 0; step < budget.maxSwapsPerRestart; step++) {
    const move = findBestMove(pods, totals, playersById, config);
    if (move === null) {
      break;
    }
    move.apply(pods);
    for (let index = 0; index < pods.length; index++) {
      totals[index] = evaluatePod(pods[index], playersById, config).total;
    }
    total += move.delta;
  }
  return { pods, total };
}

/**
 * The v1 engine: bounded local search. Construct from a score-sorted (shuffled
 * within bands, 3-pod positions shuffled) seed, improve with whole-round 2-swaps
 * and 3-cycles, restart a few dozen times, and keep the lowest-penalty result. Among equal-penalty
 * results the injected rng breaks the tie ("pick randomly among equal pairings").
 *
 * @param budget Restart and step caps; defaults to {@link DEFAULT_LOCAL_SEARCH_BUDGET}.
 * @returns A {@link PairingStrategy} closing over the budget.
 */
export function makeLocalSearchStrategy(
  budget: LocalSearchBudget = DEFAULT_LOCAL_SEARCH_BUDGET,
): PairingStrategy {
  return {
    pair(players, sizes, config, rng) {
      const playersById = new Map(players.map((player) => [player.id, player]));
      const results: { pods: Pod[]; total: number }[] = [];
      for (let restart = 0; restart < budget.restarts; restart++) {
        const result = searchOnce(players, sizes, config, rng, budget, playersById);
        results.push(result);
        if (result.total <= EPSILON) {
          break; // Penalties are non-negative, so this is provably optimal.
        }
      }
      const minTotal = Math.min(...results.map((result) => result.total));
      const best = results.filter((result) => result.total <= minTotal + EPSILON);
      const chosen = best[Math.floor(rng.next() * best.length)] ?? results[0];
      const perPod = chosen.pods.map((pod) => evaluatePod(pod, playersById, config));
      return {
        pods: chosen.pods,
        totalPenalty: perPod.reduce((sum, breakdown) => sum + breakdown.total, 0),
        perPod,
        strategy: "local-search",
      };
    },
  };
}

// A random valid partition that respects the pod sizes (no scores/history to optimize).
function randomPairing(
  players: PairingPlayer[],
  sizes: PodSizes,
  config: PairingConfig,
  rng: Random,
): PairingResult {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const pods = chunkIntoPods(shuffle(players, rng), sizes, rng);
  const perPod = pods.map((pod) => evaluatePod(pod, playersById, config));
  return {
    pods,
    totalPenalty: perPod.reduce((sum, breakdown) => sum + breakdown.total, 0),
    perPod,
    strategy: "random",
  };
}

/**
 * Orchestrate a round's pairing: round 1 is a random valid partition (no scores
 * or history yet); round 2+ runs bounded local search. The pod sizes are derived
 * from the field; an unrepresentable count (1, 2, 5) throws
 * {@link InvalidPlayerCountError}.
 *
 * @param players The active players' flat snapshots.
 * @param roundNumber 1-based round number (round 1 is random).
 * @param config Penalty weights; defaults to {@link DEFAULT_PAIRING_CONFIG}.
 * @param rng Uniform [0,1) source; defaults to `mathRandom`. Inject a seeded rng for determinism.
 * @param budget Local-search budget; defaults to {@link DEFAULT_LOCAL_SEARCH_BUDGET}.
 * @returns The scored pairing for the round.
 */
export function generatePairing(
  players: PairingPlayer[],
  roundNumber: number,
  config: PairingConfig = DEFAULT_PAIRING_CONFIG,
  rng: Random = mathRandom,
  budget: LocalSearchBudget = DEFAULT_LOCAL_SEARCH_BUDGET,
): PairingResult {
  const sizes = determinePodSizes(players.length);
  if (sizes === null) {
    throw new InvalidPlayerCountError(players.length);
  }
  if (roundNumber <= 1) {
    return randomPairing(players, sizes, config, rng);
  }
  return makeLocalSearchStrategy(budget).pair(players, sizes, config, rng);
}
