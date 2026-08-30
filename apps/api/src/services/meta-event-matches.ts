import type { Repos } from "../deps.js";
import { projectPhases } from "../lib/uvsgames-transform.js";
import type { NewMetaEventMatch } from "../repositories/meta.js";

/**
 * Copies staged matches onto the live event (ADR-014, "Pairings").
 *
 * A staged match references its participants by uvs user id; the live row
 * references `meta_event_players`. The bridge is the candidate's own player
 * rows, which carry both the uvs id (stamped by the deep fetch) and the live
 * id (stamped by the accept). A match whose participants are not all live yet
 * stays unstamped — those rows are the retry queue, picked up by the next
 * call, so this runs after every accept that can complete a pairing.
 *
 * Both tiers key on the source's match id, so the copy is a straight upsert:
 * no seat bookkeeping, and a round the source re-paired converges instead of
 * landing twice.
 */

export interface MetaMatchMaterializeSummary {
  materialized: number;
  /** Staged matches whose participants are not all accepted yet. */
  waiting: number;
}

export async function materializeCandidateMatches(
  repos: Pick<Repos, "meta" | "metaCandidates">,
  candidateEventId: string,
  metaEventId: string,
): Promise<MetaMatchMaterializeSummary> {
  const pending = await repos.metaCandidates.unmaterializedMatches(candidateEventId);
  if (pending.length === 0) {
    return { materialized: 0, waiting: 0 };
  }

  const players = await repos.metaCandidates.playersByCandidateEventIds([candidateEventId]);
  const liveByUvsId = new Map<number, string>();
  for (const player of players) {
    if (player.uvsgamesPlayerId !== null && player.metaEventPlayerId !== null) {
      liveByUvsId.set(player.uvsgamesPlayerId, player.metaEventPlayerId);
    }
  }

  const ready: { stagedId: string; sourceMatchId: string; row: NewMetaEventMatch }[] = [];
  for (const match of pending) {
    const player1Id = liveByUvsId.get(match.player1UvsgamesId);
    const player2Id =
      match.player2UvsgamesId === null ? null : liveByUvsId.get(match.player2UvsgamesId);
    if (player1Id === undefined || (match.player2UvsgamesId !== null && player2Id === undefined)) {
      continue;
    }
    ready.push({
      stagedId: match.id,
      sourceMatchId: match.sourceMatchId,
      row: {
        metaEventId,
        sourceMatchId: match.sourceMatchId,
        sourceRoundId: match.roundId,
        phaseOrder: match.phaseOrder,
        roundNumber: match.roundNumber,
        tableNumber: match.tableNumber,
        isBye: match.isBye,
        isDraw: match.isDraw,
        player1Id,
        player2Id: player2Id ?? null,
        // The staged CHECK pins the winner to a participant.
        winnerId:
          match.winnerUvsgamesId === null
            ? null
            : match.winnerUvsgamesId === match.player1UvsgamesId
              ? player1Id
              : player2Id,
        gamesWonP1: match.gamesWonP1,
        gamesWonP2: match.gamesWonP2,
      },
    });
  }

  const written = await repos.meta.upsertEventMatches(ready.map((entry) => entry.row));
  const liveIdsBySource = new Map(
    written.flatMap((row) => (row.sourceMatchId === null ? [] : [[row.sourceMatchId, row.id]])),
  );
  const stamps = new Map<string, string>();
  for (const entry of ready) {
    const liveId = liveIdsBySource.get(entry.sourceMatchId);
    if (liveId !== undefined) {
      stamps.set(entry.stagedId, liveId);
    }
  }
  await repos.metaCandidates.setMatchLiveIds(stamps);

  return { materialized: stamps.size, waiting: pending.length - stamps.size };
}

/**
 * Copies the event's phase structure onto the live event.
 *
 * Phases ride in the candidate's payload rather than a staging tier of their
 * own: there are one to three per event, nothing references them, and an admin
 * has nothing to accept or reject about "the cut was Top 8". Replacing them
 * wholesale on every pass keeps them in step with a source that republishes the
 * list each time.
 *
 * The caller hands over the detail it already holds. Re-reading the candidate
 * here would race the write that stored it.
 *
 * @returns How many phase rows the event now has.
 */
export async function syncEventPhases(
  repos: Pick<Repos, "meta">,
  metaEventId: string,
  detail: unknown,
): Promise<number> {
  const phases = projectPhases(detail);
  if (phases.length === 0) {
    return 0;
  }
  await repos.meta.replaceEventPhases(
    metaEventId,
    phases.map((phase) => ({ metaEventId, ...phase })),
  );
  return phases.length;
}
