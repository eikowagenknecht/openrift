import { ERROR_CODES, generatePairing, InvalidPlayerCountError } from "@openrift/shared";
import type { PairingResult } from "@openrift/shared";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type { PodRound, PodTournament } from "../repositories/pod-tournaments.js";
import { assertFound } from "../utils/assertions.js";

/**
 * Run the engine over the derived snapshot, translating the bad-count error to a 400.
 * @returns The scored pairing for the round.
 */
async function runPairing(
  repos: Repos,
  tournament: PodTournament,
  roundNumber: number,
): Promise<PairingResult> {
  const snapshot = await repos.podTournaments.loadPairingSnapshot(
    tournament.id,
    tournament.scoringScheme,
  );
  try {
    return generatePairing(snapshot, roundNumber);
  } catch (error) {
    if (error instanceof InvalidPlayerCountError) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, error.message);
    }
    throw error;
  }
}

/**
 * Pair the next round: reject if a round is already open, run the engine over the
 * derived snapshot, persist the round, and flip the tournament to `running` on
 * the first pairing.
 *
 * @param repos The request repos.
 * @param tournament The owning tournament row.
 * @returns The created round.
 */
export async function pairNextRound(repos: Repos, tournament: PodTournament): Promise<PodRound> {
  const open = await repos.podTournaments.findOpenRound(tournament.id);
  if (open) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "A round is already open. Finalize or re-roll it before pairing the next one.",
    );
  }
  const roundNumber = tournament.currentRound + 1;
  const pairing = await runPairing(repos, tournament, roundNumber);
  const round = await repos.podTournaments.createRound(tournament.id, roundNumber, pairing);
  if (tournament.status === "setup") {
    await repos.podTournaments.update(tournament.id, { status: "running" });
  }
  return round;
}

/**
 * Re-roll the open round: delete it and regenerate with the SAME round number.
 * Allowed only before any pod result has been entered.
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
  await repos.podTournaments.deleteRound(round.id);
  const pairing = await runPairing(repos, tournament, roundNumber);
  return repos.podTournaments.createRound(tournament.id, roundNumber, pairing);
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
 * Submit (or, for the owner, edit) one pod's placements. Validates the pod
 * belongs to the tournament, the round is writable, and the placement set covers
 * exactly the pod's members within `1..size`.
 *
 * @param repos The request repos.
 * @param tournamentId The tournament the caller is authorized for.
 * @param podId The pod being scored.
 * @param placements One `{ playerId, placement }` per pod member.
 * @param options `allowFinalized` lets the owner edit a finalized round; the
 *   participant link cannot.
 * @returns Nothing.
 */
export async function submitPodResult(
  repos: Repos,
  tournamentId: string,
  podId: string,
  placements: { playerId: string; placement: number }[],
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
  if (placements.length !== size) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      `A ${size}-player pod needs exactly ${size} placements.`,
    );
  }
  const memberIds = new Set(found.memberPlayerIds);
  const seen = new Set<string>();
  for (const { playerId, placement } of placements) {
    if (!memberIds.has(playerId)) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "A placement names a player not in this pod.",
      );
    }
    if (seen.has(playerId)) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "A player appears twice in the placements.");
    }
    seen.add(playerId);
    if (placement < 1 || placement > size) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Placement must be between 1 and ${size}.`);
    }
  }
  if (seen.size !== memberIds.size) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Every player in the pod needs a placement.");
  }

  await repos.podTournaments.setPodResult(podId, placements);
}
