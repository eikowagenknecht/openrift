import type { MetaEventPhase } from "@openrift/shared";

import { isSingleElimination } from "@/lib/meta-bracket";

export interface MetaEventStructure {
  swissRounds: number | null;
  cutSize: number | null;
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

function sentenceFor(swissRounds: number | null, cutSize: number | null): string | null {
  const rounds = swissRounds === 1 ? "1 Swiss round" : `${swissRounds} Swiss rounds`;
  if (swissRounds !== null && cutSize !== null) {
    return `${rounds}, then a top ${cutSize} cut`;
  }
  if (swissRounds !== null) {
    return rounds;
  }
  if (cutSize !== null) {
    return `Top ${cutSize} cut`;
  }
  return null;
}

export function describeEventStructure(phases: readonly MetaEventPhase[]): MetaEventStructure {
  const swissRounds = swissRoundsOf(phases);
  const cutSize = cutSizeOf(phases);
  return { swissRounds, cutSize, sentence: sentenceFor(swissRounds, cutSize) };
}
