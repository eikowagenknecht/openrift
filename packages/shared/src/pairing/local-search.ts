import { mathRandom } from "../pack-opener/rng.js";
import type { Random } from "../pack-opener/rng.js";
import { evaluatePod } from "./evaluate.js";
import { determinePodSizes, determineSwissPodSizes } from "./pod-sizes.js";
import { DEFAULT_LOCAL_SEARCH_BUDGET, DEFAULT_PAIRING_CONFIG } from "./types.js";
import type {
  GeneratePairingOptions,
  LocalSearchBudget,
  PairingConfig,
  PairingMode,
  PairingPlayer,
  PairingResult,
  PairingStrategy,
  Pod,
  PodSizes,
} from "./types.js";

/**
 * Thrown when a player count can't be decomposed: pods of 3/4 can't seat 1,
 * 2, or 5; Swiss can't seat an odd count.
 */
export class InvalidPlayerCountError extends Error {
  readonly playerCount: number;
  constructor(playerCount: number, mode: PairingMode = "pod") {
    super(
      mode === "swiss"
        ? `Cannot pair ${playerCount} active player(s) into 1v1 matches. Swiss needs an even number of seated players; give one player a bye.`
        : `Cannot split ${playerCount} active player(s) into pods of 3 and 4. A round needs at least 3 active players, and 5 cannot be split; add or drop a player.`,
    );
    this.name = "InvalidPlayerCountError";
    this.playerCount = playerCount;
  }
}

const EPSILON = 1e-9;

// Fisher-Yates shuffle.
function shuffle<T>(items: readonly T[], rng: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const atI = result[i];
    const atJ = result[j];
    if (atI === undefined || atJ === undefined) {
      throw new Error(`shuffle: index out of range (${i}, ${j})`);
    }
    result[i] = atJ;
    result[j] = atI;
  }
  return result;
}

// Shuffles within each equal-score band so restarts differ.
function constructOrder(players: PairingPlayer[], rng: Random): PairingPlayer[] {
  const byScore = Map.groupBy(players, (player) => player.score);
  const scoresDescending = [...byScore.keys()].toSorted((a, b) => b - a);
  const ordered: PairingPlayer[] = [];
  for (const score of scoresDescending) {
    ordered.push(...shuffle(byScore.get(score) ?? [], rng));
  }
  return ordered;
}

// Shuffles which positions become 3-pods; a fixed order would anchor every
// restart's 3-pods to the bottom of the standings.
function chunkIntoPods(ordered: PairingPlayer[], sizes: PodSizes, rng: Random): Pod[] {
  const sequence: (2 | 3 | 4)[] = shuffle(
    [
      ...Array.from<unknown, 2 | 3 | 4>({ length: sizes.fours }, () => 4),
      ...Array.from<unknown, 2 | 3 | 4>({ length: sizes.threes }, () => 3),
      ...Array.from<unknown, 2 | 3 | 4>({ length: sizes.twos ?? 0 }, () => 2),
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
  size: 2 | 3 | 4,
  playersById: ReadonlyMap<string, PairingPlayer>,
  config: PairingConfig,
): number {
  return evaluatePod({ size, playerIds }, playersById, config).total;
}

interface Move {
  delta: number;
  apply: (pods: Pod[]) => void;
}

// Scans 2-swaps first; only scans the pricier 3-cycles if no 2-swap improves.
function findBestMove(
  pods: Pod[],
  totals: number[],
  playersById: ReadonlyMap<string, PairingPlayer>,
  config: PairingConfig,
): Move | null {
  let best: Move | null = null;

  for (let a = 0; a < pods.length; a++) {
    for (let b = a + 1; b < pods.length; b++) {
      const podA = pods[a];
      const podB = pods[b];
      const totalA = totals[a];
      const totalB = totals[b];
      if (
        podA === undefined ||
        podB === undefined ||
        totalA === undefined ||
        totalB === undefined
      ) {
        continue;
      }
      const baseline = totalA + totalB;
      for (const [posA, idA] of podA.playerIds.entries()) {
        for (const [posB, idB] of podB.playerIds.entries()) {
          const newA = podA.playerIds.with(posA, idB);
          const newB = podB.playerIds.with(posB, idA);
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

  for (let a = 0; a < pods.length; a++) {
    for (let b = a + 1; b < pods.length; b++) {
      for (let c = b + 1; c < pods.length; c++) {
        const podA = pods[a];
        const podB = pods[b];
        const podC = pods[c];
        const totalA = totals[a];
        const totalB = totals[b];
        const totalC = totals[c];
        if (
          podA === undefined ||
          podB === undefined ||
          podC === undefined ||
          totalA === undefined ||
          totalB === undefined ||
          totalC === undefined
        ) {
          continue;
        }
        const baseline = totalA + totalB + totalC;
        for (const [posA, x] of podA.playerIds.entries()) {
          for (const [posB, y] of podB.playerIds.entries()) {
            for (const [posC, z] of podC.playerIds.entries()) {
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
    for (const [index, pod] of pods.entries()) {
      totals[index] = evaluatePod(pod, playersById, config).total;
    }
    total += move.delta;
  }
  return { pods, total };
}

/**
 * Bounded local search: restart a few dozen times and keep the lowest-penalty
 * result, breaking ties among equal-penalty results with the injected rng.
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
      if (chosen === undefined) {
        throw new Error("makeLocalSearchStrategy: no pairing produced");
      }
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
 * Pod mode round 1 uses a random partition unless a player carries a region;
 * every other case runs bounded local search.
 */
export function generatePairing(
  players: PairingPlayer[],
  roundNumber: number,
  options: GeneratePairingOptions = {},
): PairingResult {
  const mode = options.mode ?? "pod";
  const config = options.config ?? DEFAULT_PAIRING_CONFIG;
  const rng = options.rng ?? mathRandom;
  const budget = options.budget ?? DEFAULT_LOCAL_SEARCH_BUDGET;
  const sizes =
    mode === "swiss" ? determineSwissPodSizes(players.length) : determinePodSizes(players.length);
  if (sizes === null) {
    throw new InvalidPlayerCountError(players.length, mode);
  }
  const anyRegion = players.some((player) => (player.region ?? null) !== null);
  if (mode === "pod" && roundNumber <= 1 && !anyRegion) {
    return randomPairing(players, sizes, config, rng);
  }
  return makeLocalSearchStrategy(budget).pair(players, sizes, config, rng);
}
