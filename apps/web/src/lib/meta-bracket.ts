import type { MetaEventMatch, MetaEventPhase } from "@openrift/shared";

/** One side of a bracket match. */
export interface MetaBracketSeat {
  /** Null on the empty side of a bye. */
  playerId: string | null;
  isWinner: boolean;
  gamesWon: number | null;
}

export interface MetaBracketMatch {
  key: string;
  seats: [MetaBracketSeat, MetaBracketSeat];
}

export interface MetaBracketRound {
  /** "Quarterfinals", "Semifinals", "Final", or "Top 16" and up. */
  label: string;
  matches: MetaBracketMatch[];
  /**
   * The round that decided the event, and holding the one match that decided
   * it. A last round carrying a third-place match beside the final is not
   * marked: nothing in the payload says which of the two is which, and gilding
   * the wrong one is worse than gilding neither.
   */
  isFinal: boolean;
}

export interface MetaBracket {
  /** "Top 8", from the cut's own entry rank where the source published one. */
  title: string;
  rounds: MetaBracketRound[];
}

const ROUND_LABELS = ["Final", "Semifinals", "Quarterfinals"];

/** Named by how far the round sits from the last one, not by its match count. */
function roundLabel(fromEnd: number): string {
  return ROUND_LABELS[fromEnd] ?? `Top ${2 ** (fromEnd + 1)}`;
}

/**
 * `roundType` is source vocabulary kept raw (`SWISS`,
 * `RANKED_SINGLE_ELIMINATION`), so this matches on the substring rather than a
 * fixed list a new source would fall outside of.
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

/** Matches of one phase, grouped by round and ordered as they were played. */
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
 * The cut's own phase, which is the one the source called single elimination and
 * ran the most matches in. Match count rather than phase order, because a
 * third-place playoff is often filed as a single-elimination phase of its own
 * and would otherwise win by sitting last.
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
 * The last phase's rounds, accepted only when they halve to a single match.
 *
 * This is the read for an event whose source published pairings but no phase
 * list. It is deliberately strict: Swiss rounds keep their size and fail it, so
 * a field of unrelated tables never renders as a bracket. Two rounds is the
 * least it takes — a lone final is a result, not a bracket.
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
  for (let index = 0; index < rounds.length - 1; index++) {
    if (rounds[index].length !== rounds[index + 1].length * 2) {
      return [];
    }
  }
  return rounds;
}

/**
 * The single-elimination cut an event's matches record, or nothing.
 *
 * The phase list is authoritative and is used whenever the source published one:
 * it names the cut outright and carries the standing that entered it, so a
 * bronze match beside the final, a thinning Swiss, and a cut whose early rounds
 * were never published all read correctly. Events with no phase list fall back
 * to reading the shape of the rounds — see {@link derivedRounds}.
 */
export function metaEventBracket(
  matches: readonly MetaEventMatch[],
  phases: readonly MetaEventPhase[] = [],
): MetaBracket | null {
  const phase = cutPhase(matches, phases);
  const rounds = phase === null ? derivedRounds(matches) : roundsOfPhase(matches, phase.phaseOrder);
  if (rounds.length === 0) {
    return null;
  }
  // One published round is worth showing only when the cut's own size says what
  // it was the final of; without that it is a single match under a made-up title.
  if (rounds.length < 2 && (phase === null || phase.rankRequired === null)) {
    return null;
  }

  const lastIndex = rounds.length - 1;
  return {
    title: `Top ${phase?.rankRequired ?? 2 ** rounds.length}`,
    rounds: rounds.map((round, index) => ({
      label: roundLabel(lastIndex - index),
      matches: round.map((match) => toBracketMatch(match)),
      isFinal: index === lastIndex && round.length === 1,
    })),
  };
}
