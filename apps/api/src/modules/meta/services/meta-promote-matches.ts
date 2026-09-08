import type { Repos } from "../../../deps.js";
import { UVSGAMES_PROVIDER } from "../../../lib/meta-providers.js";
import type {
  MetaEventMatchRow,
  MetaEventPhaseRow,
  NewMetaEventMatch,
  NewMetaEventPhase,
} from "../repositories/meta-events.js";
import type { MetaPromoteResult } from "./meta-promote-shared.js";

/**
 * A mirror match promotes only once both participants resolve to a live row;
 * one that doesn't is left for the next promote to pick up naturally.
 */
export async function promotePhasesAndMatches(
  repos: Repos,
  metaEventId: string,
  sources: readonly { provider: string | null; externalId: string | null }[],
  result: MetaPromoteResult,
): Promise<void> {
  const uvs = sources.find((source) => source.provider === UVSGAMES_PROVIDER);
  if (uvs === undefined || uvs.externalId === null) {
    return;
  }

  const phases = await repos.uvsgamesResults.phases(uvs.externalId);
  if (phases.length > 0) {
    const rows = phases.map((phase) => ({
      metaEventId,
      phaseOrder: phase.phaseOrder,
      name: phase.name,
      roundType: phase.roundType,
      roundCount: phase.roundCount,
      rankRequired: phase.rankRequired,
      maxGameWins: phase.maxGameWins,
    }));
    if (!samePhases(await repos.meta.phasesForEvent(metaEventId), rows)) {
      await repos.meta.replaceEventPhases(metaEventId, rows);
    }
    result.phases = phases.length;
  }

  const matches = await repos.uvsgamesResults.matches(uvs.externalId);
  if (matches.length === 0) {
    return;
  }
  const players = await repos.meta.rawStandingsForEvent(metaEventId);
  const liveByUvsId = new Map(
    players
      .filter((player) => player.uvsgamesPlayerId !== null)
      .map((player) => [player.uvsgamesPlayerId as number, player.id]),
  );

  const rows = [];
  for (const match of matches) {
    const player1Id = liveByUvsId.get(match.player1UvsgamesId);
    const player2Id =
      match.player2UvsgamesId === null ? null : liveByUvsId.get(match.player2UvsgamesId);
    if (player1Id === undefined || (match.player2UvsgamesId !== null && player2Id === undefined)) {
      continue;
    }
    rows.push({
      metaEventId,
      phaseOrder: match.phaseOrder,
      roundNumber: match.roundNumber,
      tableNumber: match.tableNumber,
      isBye: match.isBye,
      isDraw: match.isDraw,
      player1Id,
      player2Id: player2Id ?? null,
      winnerId:
        match.winnerUvsgamesId === null ? null : (liveByUvsId.get(match.winnerUvsgamesId) ?? null),
      gamesWonP1: match.gamesWonP1,
      gamesWonP2: match.gamesWonP2,
      sourceRoundId: match.roundId,
      sourceMatchId: match.sourceMatchId,
    });
  }
  result.matches = rows.length;
  if (rows.length === 0) {
    return;
  }
  const changed = changedMatches(await repos.meta.matchesForEvent(metaEventId), rows);
  if (changed.length > 0) {
    await repos.meta.upsertEventMatches(changed);
  }
}

function samePhases(
  stored: readonly MetaEventPhaseRow[],
  next: readonly NewMetaEventPhase[],
): boolean {
  if (stored.length !== next.length) {
    return false;
  }
  return next.every((row, index) => {
    const was = stored[index];
    return (
      was !== undefined &&
      was.phaseOrder === row.phaseOrder &&
      was.name === row.name &&
      was.roundType === row.roundType &&
      was.roundCount === row.roundCount &&
      was.rankRequired === row.rankRequired &&
      was.maxGameWins === row.maxGameWins
    );
  });
}

/** The pairings whose stored row would actually move. */
function changedMatches(
  stored: readonly MetaEventMatchRow[],
  next: readonly NewMetaEventMatch[],
): NewMetaEventMatch[] {
  const byKey = new Map(
    stored.flatMap((row) =>
      row.sourceMatchId === null ? [] : [[row.sourceMatchId, row] as const],
    ),
  );
  return next.filter((row) => {
    // A row the source gave no id to cannot be matched up, so it is always
    // written and left to the seat index to converge.
    if (row.sourceMatchId === null || row.sourceMatchId === undefined) {
      return true;
    }
    const was = byKey.get(row.sourceMatchId);
    return (
      was === undefined ||
      was.phaseOrder !== row.phaseOrder ||
      was.roundNumber !== row.roundNumber ||
      was.sourceRoundId !== row.sourceRoundId ||
      was.tableNumber !== row.tableNumber ||
      was.isBye !== row.isBye ||
      was.isDraw !== row.isDraw ||
      was.player1Id !== row.player1Id ||
      was.player2Id !== row.player2Id ||
      was.winnerId !== row.winnerId ||
      was.gamesWonP1 !== row.gamesWonP1 ||
      was.gamesWonP2 !== row.gamesWonP2
    );
  });
}
