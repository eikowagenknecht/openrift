import type { MetaEventPhase } from "@openrift/shared/types/api/meta";

import { isSingleElimination } from "@/lib/meta-bracket";

export interface MetaEventStructure {
  swissRounds: number | null;
  cutSize: number | null;
  bestOf: number | null;
  sentence: string | null;
}

/** The largest elimination phase wins, so a third-place playoff filed as its own phase never shrinks the cut. */
function cutSizeOf(phases: readonly MetaEventPhase[]): number | null {
  let largest: number | null = null;
  for (const phase of phases) {
    if (!isSingleElimination(phase.roundType)) {
      continue;
    }
    const size = phase.rankRequired ?? (phase.roundCount === null ? null : 2 ** phase.roundCount);
    if (size !== null && (largest === null || size > largest)) {
      largest = size;
    }
  }
  return largest;
}

function swissRoundsOf(phases: readonly MetaEventPhase[]): number | null {
  let total = 0;
  for (const phase of phases) {
    if (!isSingleElimination(phase.roundType) && phase.roundCount !== null) {
      total += phase.roundCount;
    }
  }
  return total === 0 ? null : total;
}

function bestOfOf(phases: readonly MetaEventPhase[]): number | null {
  const wins = new Set<number>();
  for (const phase of phases) {
    if (phase.maxGameWins !== null && phase.maxGameWins > 0) {
      wins.add(phase.maxGameWins);
    }
  }
  const [maxGameWins] = wins;
  return wins.size === 1 && maxGameWins !== undefined ? maxGameWins * 2 - 1 : null;
}

function sentenceFor(
  swissRounds: number | null,
  cutSize: number | null,
  bestOf: number | null,
): string | null {
  const rounds = swissRounds === 1 ? "1 Swiss round" : `${swissRounds} Swiss rounds`;
  const games = bestOf === null ? "" : `, best of ${bestOf}`;
  if (swissRounds !== null && cutSize !== null) {
    return `${rounds}${games}, then a top ${cutSize} cut`;
  }
  if (swissRounds !== null) {
    return `${rounds}${games}`;
  }
  if (cutSize !== null) {
    return `Top ${cutSize} cut${games}`;
  }
  return null;
}

export function describeEventStructure(phases: readonly MetaEventPhase[]): MetaEventStructure {
  const swissRounds = swissRoundsOf(phases);
  const cutSize = cutSizeOf(phases);
  const bestOf = bestOfOf(phases);
  return { swissRounds, cutSize, bestOf, sentence: sentenceFor(swissRounds, cutSize, bestOf) };
}
