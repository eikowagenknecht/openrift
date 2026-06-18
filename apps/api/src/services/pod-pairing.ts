import {
  ERROR_CODES,
  evaluatePairing,
  generatePairing,
  InvalidPlayerCountError,
  placementsFromGamePoints,
} from "@openrift/shared";
import type { PairingPlayer, PairingResult, Pod, PodSnapshotPlayer } from "@openrift/shared";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type { PodRound, PodTournament } from "../repositories/pod-tournaments.js";
import { assertFound } from "../utils/assertions.js";

/** An empty round (every active player took a bye): zero pods, zero penalty. */
const EMPTY_PAIRING: PairingResult = { pods: [], totalPenalty: 0, perPod: [], strategy: "random" };

/**
 * Run the engine over the active snapshot minus the byed players, translating the
 * bad-count error to a 400. An all-bye round (no seated players) yields an empty
 * pairing rather than erroring, so the runner can always produce a valid round.
 *
 * @param repos The request repos.
 * @param tournament The owning tournament row.
 * @param roundNumber The 1-based round number.
 * @param byePlayerIds Active players the organizer is sitting out this round.
 * @returns The scored pairing for the seated players.
 */
async function runPairing(
  repos: Repos,
  tournament: PodTournament,
  roundNumber: number,
  byePlayerIds: string[],
): Promise<PairingResult> {
  const snapshot = await repos.podTournaments.loadPairingSnapshot(
    tournament.id,
    tournament.scoringScheme,
    tournament.byePoints,
  );
  const activeIds = new Set(snapshot.map((player) => player.id));
  for (const byeId of byePlayerIds) {
    if (!activeIds.has(byeId)) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "A bye names a player who is not active.");
    }
  }
  const byeSet = new Set(byePlayerIds);
  const seated = snapshot.filter((player) => !byeSet.has(player.id));
  if (seated.length === 0) {
    return EMPTY_PAIRING;
  }
  try {
    return generatePairing(seated, roundNumber);
  } catch (error) {
    if (error instanceof InvalidPlayerCountError) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, error.message);
    }
    throw error;
  }
}

/**
 * Pair the next round: reject if a round is already open, run the engine over the
 * derived snapshot (minus any organizer byes), persist the round, and flip the
 * tournament to `running` on the first pairing.
 *
 * @param repos The request repos.
 * @param tournament The owning tournament row.
 * @param byePlayerIds Active players sitting this round out (default none).
 * @returns The created round.
 */
export async function pairNextRound(
  repos: Repos,
  tournament: PodTournament,
  byePlayerIds: string[] = [],
): Promise<PodRound> {
  const open = await repos.podTournaments.findOpenRound(tournament.id);
  if (open) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "A round is already open. Finalize or re-roll it before pairing the next one.",
    );
  }
  const roundNumber = tournament.currentRound + 1;
  const pairing = await runPairing(repos, tournament, roundNumber, byePlayerIds);
  const round = await repos.podTournaments.createRound(
    tournament.id,
    roundNumber,
    pairing,
    byePlayerIds,
  );
  if (tournament.status === "setup") {
    await repos.podTournaments.update(tournament.id, { status: "running" });
  }
  return round;
}

/**
 * Re-roll the open round: delete it and regenerate with the SAME round number,
 * preserving the byes the organizer set. Allowed only before any pod result has
 * been entered.
 *
 * @param repos The request repos.
 * @param tournament The owning tournament row.
 * @param roundNumber The open round's number.
 * @returns The freshly generated round.
 */
export async function rerollRound(
  repos: Repos,
  tournament: PodTournament,
  roundNumber: number,
): Promise<PodRound> {
  const round = await repos.podTournaments.findRoundByNumber(tournament.id, roundNumber);
  assertFound(round, "Round not found");
  if (round.status === "finalized") {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "A finalized round cannot be re-rolled.");
  }
  if (await repos.podTournaments.anyResultEntered(round.id)) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "A round cannot be re-rolled once a pod result has been entered.",
    );
  }
  const byePlayerIds = await repos.podTournaments.listRoundByePlayerIds(round.id);
  await repos.podTournaments.deleteRound(round.id);
  const pairing = await runPairing(repos, tournament, roundNumber, byePlayerIds);
  return repos.podTournaments.createRound(tournament.id, roundNumber, pairing, byePlayerIds);
}

/**
 * Apply a manual whole-round pairing edit on the open round: validate that the
 * new partition keeps every pod at size 3 or 4 and covers exactly the round's
 * current participants (no one added or dropped), then recompute the penalty and
 * persist. Only allowed while the round is open and no result has been entered.
 *
 * @param repos The request repos.
 * @param tournament The owning tournament row.
 * @param roundNumber The open round's number.
 * @param pods The new pods (size + member ids).
 * @param byePlayerIds Players moved to the bye zone.
 * @returns Nothing.
 */
export async function replaceRoundPairing(
  repos: Repos,
  tournament: PodTournament,
  roundNumber: number,
  pods: { size: 3 | 4; playerIds: string[] }[],
  byePlayerIds: string[],
): Promise<void> {
  const round = await repos.podTournaments.findRoundByNumber(tournament.id, roundNumber);
  assertFound(round, "Round not found");
  if (round.status === "finalized") {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "A finalized round cannot be edited.");
  }
  if (await repos.podTournaments.anyResultEntered(round.id)) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "A round cannot be edited once a pod result has been entered.",
    );
  }

  // Every pod must be a valid FFA size and match its member count.
  for (const pod of pods) {
    if (pod.size !== pod.playerIds.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `A pod declares size ${pod.size} but has ${pod.playerIds.length} players.`,
      );
    }
  }

  // The new partition must cover exactly the players already in this round, each
  // once (free moves rearrange the field; they never add or remove a player).
  const incoming = [...pods.flatMap((pod) => pod.playerIds), ...byePlayerIds];
  const incomingSet = new Set(incoming);
  if (incomingSet.size !== incoming.length) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "A player appears in more than one pod or bye.",
    );
  }
  const [memberIds, existingByes] = await Promise.all([
    repos.podTournaments.listRoundMemberPlayerIds(round.id),
    repos.podTournaments.listRoundByePlayerIds(round.id),
  ]);
  const current = new Set([...memberIds, ...existingByes]);
  if (current.size !== incomingSet.size || [...current].some((id) => !incomingSet.has(id))) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "The edited pairing must include exactly the players already in this round.",
    );
  }

  // Recompute the penalty from the pre-round snapshot so the stored breakdown
  // stays truthful after a hand edit.
  const snapshot = await repos.podTournaments.loadOpenRoundSnapshot(
    tournament.id,
    tournament.scoringScheme,
    tournament.byePoints,
  );
  const players = snapshot.map((entry) => toPairingPlayer(entry));
  const enginePods: Pod[] = pods.map((pod) => ({ size: pod.size, playerIds: pod.playerIds }));
  const { perPod, totalPenalty } = evaluatePairing(enginePods, players);
  const pairing: PairingResult = { pods: enginePods, perPod, totalPenalty, strategy: "manual" };
  await repos.podTournaments.replacePairing(round.id, pairing, byePlayerIds);
}

function toPairingPlayer(snapshot: PodSnapshotPlayer): PairingPlayer {
  return {
    id: snapshot.playerId,
    score: snapshot.score,
    pods3: snapshot.pods3,
    pods4: snapshot.pods4,
    byes: snapshot.byes,
    opponents: new Map(Object.entries(snapshot.opponents)),
  };
}

/**
 * Finalize a round: require every pod reported, then commit (the round flips to
 * `finalized` and the tournament's finalized-round counter advances). In the
 * lean model this is just a status flip — standings re-derive from the rows.
 *
 * @param repos The request repos.
 * @param tournament The owning tournament row.
 * @param roundNumber The round to finalize.
 * @returns Nothing.
 */
export async function finalizeRound(
  repos: Repos,
  tournament: PodTournament,
  roundNumber: number,
): Promise<void> {
  const round = await repos.podTournaments.findRoundByNumber(tournament.id, roundNumber);
  assertFound(round, "Round not found");
  if (round.status === "finalized") {
    throw new AppError(409, ERROR_CODES.CONFLICT, "Round already finalized.");
  }
  if (!(await repos.podTournaments.allPodsReported(round.id))) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "Every pod must have a result before the round can be finalized.",
    );
  }
  await repos.podTournaments.finalizeRound(round.id, tournament.id, roundNumber);
}

/**
 * Submit (or, for the owner, edit) one pod's result: each member's raw game
 * points. Validates the pod belongs to the tournament, the round is writable, and
 * the result covers exactly the pod's members. The server derives each player's
 * placement from the points (higher finishes first; equal points share a place)
 * before storing both.
 *
 * @param repos The request repos.
 * @param tournamentId The tournament the caller is authorized for.
 * @param podId The pod being scored.
 * @param results One `{ playerId, gamePoints }` per pod member.
 * @param options `allowFinalized` lets the owner edit a finalized round; the
 *   participant link cannot.
 * @returns Nothing.
 */
export async function submitPodResult(
  repos: Repos,
  tournamentId: string,
  podId: string,
  results: { playerId: string; gamePoints: number }[],
  options: { allowFinalized: boolean },
): Promise<void> {
  const found = await repos.podTournaments.findPodForResult(podId);
  if (!found || found.tournament.id !== tournamentId) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Pod not found");
  }
  if (found.round.status === "finalized" && !options.allowFinalized) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "This round is finalized; results can no longer be submitted here.",
    );
  }

  const size = found.pod.size;
  if (results.length !== size) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      `A ${size}-player pod needs exactly ${size} results.`,
    );
  }
  const memberIds = new Set(found.memberPlayerIds);
  const seen = new Set<string>();
  for (const { playerId, gamePoints } of results) {
    if (!memberIds.has(playerId)) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "A result names a player not in this pod.");
    }
    if (seen.has(playerId)) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "A player appears twice in the results.");
    }
    seen.add(playerId);
    if (gamePoints < 0) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Game points cannot be negative.");
    }
  }
  if (seen.size !== memberIds.size) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Every player in the pod needs a result.");
  }

  const placements = placementsFromGamePoints(results.map((result) => result.gamePoints));
  await repos.podTournaments.setPodResult(
    podId,
    results.map((result, index) => ({
      playerId: result.playerId,
      placement: placements[index] ?? 1,
      gamePoints: result.gamePoints,
    })),
  );
}
