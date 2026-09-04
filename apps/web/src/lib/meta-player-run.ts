import type { MetaEventMatch, MetaEventPhase, MetaEventPlayer } from "@openrift/shared";
import { formatRecord } from "@openrift/shared";

import { isSingleElimination } from "@/lib/meta-bracket";

export type MetaRoundOutcome = "win" | "loss" | "draw" | "bye" | "unknown";

export interface MetaPlayerRound {
  phaseOrder: number;
  roundNumber: number;
  isCut: boolean;
  tableNumber: number | null;
  outcome: MetaRoundOutcome;
  gamesWon: number | null;
  gamesLost: number | null;
  opponentId: string | null;
}

export interface MetaPlayerRun {
  swiss: MetaPlayerRound[];
  cut: MetaPlayerRound[];
}

export interface MetaRunRecord {
  wins: number;
  losses: number;
  draws: number;
}

function cutPhaseOrders(phases: readonly MetaEventPhase[]): Set<number> {
  return new Set(
    phases.filter((phase) => isSingleElimination(phase.roundType)).map((phase) => phase.phaseOrder),
  );
}

function outcomeOf(match: MetaEventMatch, playerId: string): MetaRoundOutcome {
  if (match.isBye) {
    return "bye";
  }
  if (match.isDraw) {
    return "draw";
  }
  if (match.winnerId === null) {
    return "unknown";
  }
  return match.winnerId === playerId ? "win" : "loss";
}

function roundOf(match: MetaEventMatch, playerId: string, isCut: boolean): MetaPlayerRound {
  const isPlayer1 = match.player1Id === playerId;
  return {
    phaseOrder: match.phaseOrder,
    roundNumber: match.roundNumber,
    isCut,
    tableNumber: match.tableNumber,
    outcome: outcomeOf(match, playerId),
    gamesWon: isPlayer1 ? match.gamesWonP1 : match.gamesWonP2,
    gamesLost: isPlayer1 ? match.gamesWonP2 : match.gamesWonP1,
    opponentId: isPlayer1 ? match.player2Id : match.player1Id,
  };
}

function byPlayOrder(a: MetaPlayerRound, b: MetaPlayerRound): number {
  return a.phaseOrder - b.phaseOrder || a.roundNumber - b.roundNumber;
}

export function metaPlayerRounds(
  matches: readonly MetaEventMatch[],
  phases: readonly MetaEventPhase[],
): Map<string, MetaPlayerRound[]> {
  const cut = cutPhaseOrders(phases);
  const rounds = new Map<string, MetaPlayerRound[]>();
  const push = (playerId: string, round: MetaPlayerRound) => {
    const own = rounds.get(playerId);
    if (own) {
      own.push(round);
    } else {
      rounds.set(playerId, [round]);
    }
  };
  for (const match of matches) {
    const isCut = cut.has(match.phaseOrder);
    push(match.player1Id, roundOf(match, match.player1Id, isCut));
    if (match.player2Id !== null) {
      push(match.player2Id, roundOf(match, match.player2Id, isCut));
    }
  }
  for (const own of rounds.values()) {
    own.sort(byPlayOrder);
  }
  return rounds;
}

export function metaPlayerRun(
  matches: readonly MetaEventMatch[],
  phases: readonly MetaEventPhase[],
  playerId: string,
): MetaPlayerRun {
  const rounds = matches
    .filter((match) => match.player1Id === playerId || match.player2Id === playerId)
    .map((match) => roundOf(match, playerId, cutPhaseOrders(phases).has(match.phaseOrder)))
    .toSorted(byPlayOrder);
  return {
    swiss: rounds.filter((round) => !round.isCut),
    cut: rounds.filter((round) => round.isCut),
  };
}

/** A bye counts as the win the standings credit it as. */
export function metaRunRecord(rounds: readonly MetaPlayerRound[]): MetaRunRecord {
  const record = { wins: 0, losses: 0, draws: 0 };
  for (const round of rounds) {
    if (round.outcome === "win" || round.outcome === "bye") {
      record.wins++;
    } else if (round.outcome === "loss") {
      record.losses++;
    } else if (round.outcome === "draw") {
      record.draws++;
    }
  }
  return record;
}

const CUT_ROUND_LABELS = ["Final", "Semifinal", "Quarterfinal"];

export function metaCutRoundLabel(roundNumber: number, lastRoundNumber: number): string {
  const fromEnd = lastRoundNumber - roundNumber;
  return CUT_ROUND_LABELS[fromEnd] ?? `Top ${2 ** (fromEnd + 1)}`;
}

// Two rows of one event can share a key when the source told same-named entrants
// apart only by a suffix the key folds away; the better finish is the one shown.
export function metaEventPlayerByKey(
  players: readonly MetaEventPlayer[],
  key: string,
): MetaEventPlayer | null {
  return (
    players
      .filter((player) => player.playerKey === key)
      .toSorted((a, b) => a.rank - b.rank)
      .at(0) ?? null
  );
}

export interface MetaLegendBestFinish {
  legend: NonNullable<MetaEventPlayer["legend"]>;
  player: MetaEventPlayer;
}

// Never a count of who brought a legend: that would be a play rate.
export function metaBestFinishPerLegend(
  players: readonly MetaEventPlayer[],
): MetaLegendBestFinish[] {
  const best = new Map<string, MetaLegendBestFinish>();
  for (const player of players) {
    if (player.legend === null) {
      continue;
    }
    const current = best.get(player.legend.cardId);
    if (current === undefined || player.rank < current.player.rank) {
      best.set(player.legend.cardId, { legend: player.legend, player });
    }
  }
  return [...best.values()].toSorted(
    (a, b) => a.player.rank - b.player.rank || a.legend.name.localeCompare(b.legend.name),
  );
}

export function metaCutLineRecord(
  players: readonly MetaEventPlayer[],
  cutSize: number | null,
): string | null {
  if (cutSize === null) {
    return null;
  }
  const last = players.find((player) => player.rank === cutSize && !player.rankIsTier);
  if (last === undefined) {
    return null;
  }
  return formatRecord(last.wins, last.losses, last.draws);
}
