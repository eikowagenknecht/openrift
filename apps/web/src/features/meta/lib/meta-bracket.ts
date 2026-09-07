import type { MetaEventMatch, MetaEventPhase } from "@openrift/shared/types/api/meta";

export interface MetaBracketSeat {
  playerId: string | null;
  isWinner: boolean;
  gamesWon: number | null;
}

export interface MetaBracketMatch {
  key: string;
  seats: [MetaBracketSeat, MetaBracketSeat];
}

export interface MetaBracketRound {
  label: string;
  matches: MetaBracketMatch[];
  isFinal: boolean;
}

export interface MetaBracket {
  title: string;
  rounds: MetaBracketRound[];
}

const ROUND_LABELS = ["Final", "Semifinals", "Quarterfinals"];

function roundLabel(fromEnd: number): string {
  return ROUND_LABELS[fromEnd] ?? `Top ${2 ** (fromEnd + 1)}`;
}

/**
 * `roundType` is source vocabulary kept raw (`SWISS`,
 * `RANKED_SINGLE_ELIMINATION`); matched by substring, not a fixed list.
 */
export function isSingleElimination(roundType: string): boolean {
  return roundType.toUpperCase().includes("SINGLE_ELIMINATION");
}

function toBracketMatch(match: MetaEventMatch): MetaBracketMatch {
  return {
    key: `${match.phaseOrder}:${match.roundNumber}:${match.tableNumber ?? "x"}:${match.player1Id}`,
    seats: [
      {
        playerId: match.player1Id,
        isWinner: match.winnerId === match.player1Id,
        gamesWon: match.gamesWonP1,
      },
      {
        playerId: match.player2Id,
        isWinner: match.player2Id !== null && match.winnerId === match.player2Id,
        gamesWon: match.gamesWonP2,
      },
    ],
  };
}

function roundsOfPhase(matches: readonly MetaEventMatch[], phaseOrder: number): MetaEventMatch[][] {
  const byRound = new Map<number, MetaEventMatch[]>();
  for (const match of matches) {
    if (match.phaseOrder !== phaseOrder) {
      continue;
    }
    const round = byRound.get(match.roundNumber);
    if (round) {
      round.push(match);
    } else {
      byRound.set(match.roundNumber, [match]);
    }
  }
  return [...byRound.keys()].toSorted((a, b) => a - b).map((number) => byRound.get(number) ?? []);
}

/**
 * Ranked by match count, not phase order: a third-place playoff is often
 * filed as its own single-elimination phase and would otherwise win by sitting last.
 */
function cutPhase(
  matches: readonly MetaEventMatch[],
  phases: readonly MetaEventPhase[],
): MetaEventPhase | null {
  let best: { phase: MetaEventPhase; matches: number } | null = null;
  for (const phase of phases) {
    if (!isSingleElimination(phase.roundType)) {
      continue;
    }
    const count = matches.filter((match) => match.phaseOrder === phase.phaseOrder).length;
    if (count > 0 && (best === null || count > best.matches)) {
      best = { phase, matches: count };
    }
  }
  return best?.phase ?? null;
}

/**
 * Fallback for a source with no phase list: accepted only when the last
 * phase's rounds halve down to a single match, so Swiss rounds never render as a bracket.
 */
function derivedRounds(matches: readonly MetaEventMatch[]): MetaEventMatch[][] {
  if (matches.length === 0) {
    return [];
  }
  const lastPhase = Math.max(...matches.map((match) => match.phaseOrder));
  const rounds = roundsOfPhase(matches, lastPhase);
  if (rounds.length < 2 || rounds.at(-1)?.length !== 1) {
    return [];
  }
  for (const [index, round] of rounds.entries()) {
    const nextRound = rounds[index + 1];
    if (nextRound !== undefined && round.length !== nextRound.length * 2) {
      return [];
    }
  }
  return rounds;
}

export function metaEventBracket(
  matches: readonly MetaEventMatch[],
  phases: readonly MetaEventPhase[] = [],
): MetaBracket | null {
  const phase = cutPhase(matches, phases);
  const rounds = phase === null ? derivedRounds(matches) : roundsOfPhase(matches, phase.phaseOrder);
  if (rounds.length === 0) {
    return null;
  }
  if (rounds.length < 2 && (phase === null || phase.rankRequired === null)) {
    return null;
  }

  const lastIndex = rounds.length - 1;
  return {
    title: `Top ${phase?.rankRequired ?? 2 ** rounds.length}`,
    rounds: rounds.map((round, index) => ({
      label: roundLabel(lastIndex - index),
      matches: round.map((match) => toBracketMatch(match)),
      // A last round with a third-place match beside the final isn't marked:
      // nothing in the payload says which of the two is which.
      isFinal: index === lastIndex && round.length === 1,
    })),
  };
}
