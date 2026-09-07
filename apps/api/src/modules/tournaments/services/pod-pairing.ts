import { ERROR_CODES } from "@openrift/shared/error-codes";
import { pickAutoBye } from "@openrift/shared/pairing/auto-bye";
import { evaluatePairing } from "@openrift/shared/pairing/evaluate";
import { generatePairing, InvalidPlayerCountError } from "@openrift/shared/pairing/local-search";
import { placementsFromGamePoints } from "@openrift/shared/pairing/points";
import {
  buildTeamUnits,
  collapseTeamByes,
  collapseTeamPods,
  expandTeamPairing,
} from "@openrift/shared/pairing/team-units";
import type { TeamSnapshotPlayer } from "@openrift/shared/pairing/team-units";
import type { PairingMode, PairingResult, Pod } from "@openrift/shared/pairing/types";
import type { PodSnapshotPlayer } from "@openrift/shared/types/api/pod-tournament";

import type { Repos } from "../../../deps.js";
import { AppError } from "../../../errors.js";
import { assertFound } from "../../../lib/assertions.js";
import { isUniqueViolationOn } from "../../../lib/pg-errors.js";
import { scoringOf } from "../lib/pod-scoring.js";
import type { PodRound } from "../repositories/pod-tournaments.js";
import type { Tournament } from "../repositories/tournaments.js";

function roundAlreadyOpen(): AppError {
  return new AppError(
    409,
    ERROR_CODES.CONFLICT,
    "A round is already open. Finalize or re-roll it before pairing the next one.",
  );
}

/** An empty round (every active player took a bye): zero pods, zero penalty. */
const EMPTY_PAIRING: PairingResult = { pods: [], totalPenalty: 0, perPod: [], strategy: "random" };

// 'none' never reaches pairing.
function pairingModeOf(tournament: Tournament): PairingMode {
  return tournament.pairingStyle === "swiss" ? "swiss" : "pod";
}

/**
 * An all-bye round (no seated players) produces an empty pairing, never an error.
 *
 * Swiss auto-byes one player on an odd seated count (fewest byes, then lowest
 * score); the caller must persist the returned `byePlayerIds`, since a re-roll
 * re-reads them to avoid a second auto-bye.
 *
 * On a region-aware tournament every seated player (byed players exempt) needs
 * a region before pairing, or the region penalty treats the gap as no conflict.
 */
async function runPairing(
  repos: Repos,
  tournament: Tournament,
  roundNumber: number,
  byePlayerIds: string[],
): Promise<{ pairing: PairingResult; byePlayerIds: string[] }> {
  const snapshot = await repos.podTournaments.loadPairingSnapshot(
    tournament.id,
    scoringOf(tournament),
  );
  const activeIds = new Set(snapshot.map((player) => player.id));
  for (const byeId of byePlayerIds) {
    if (!activeIds.has(byeId)) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "A bye names a player who is not active.");
    }
  }
  const byeSet = new Set(byePlayerIds);
  let seated = snapshot.filter((player) => !byeSet.has(player.id));
  if (tournament.regionsEnabled) {
    const missingRegion = seated.filter(
      (player) => player.region === null || player.region === undefined,
    ).length;
    if (missingRegion > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        missingRegion === 1
          ? "1 player has no region set. Assign regions on the Participants page, or sit them out, before pairing."
          : `${missingRegion} players have no region set. Assign regions on the Participants page, or sit them out, before pairing.`,
      );
    }
  }
  if (tournament.playMode === "2v2") {
    return runTeamPairing(snapshot, seated, roundNumber, byePlayerIds);
  }
  let effectiveByes = byePlayerIds;
  if (pairingModeOf(tournament) === "swiss" && seated.length % 2 === 1) {
    const autoBye = pickAutoBye(seated);
    effectiveByes = [...byePlayerIds, autoBye];
    seated = seated.filter((player) => player.id !== autoBye);
  }
  if (seated.length === 0) {
    return { pairing: EMPTY_PAIRING, byePlayerIds: effectiveByes };
  }
  try {
    return {
      pairing: generatePairing(seated, roundNumber, { mode: pairingModeOf(tournament) }),
      byePlayerIds: effectiveByes,
    };
  } catch (error) {
    if (error instanceof InvalidPlayerCountError) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, error.message);
    }
    throw error;
  }
}

/**
 * Every seated player must be on a complete team — unteamed players and
 * half-teams (a partner dropped without the team following) block with a
 * clear 400, mirroring the missing-region block, so nobody silently misses a
 * round. Byes must cover whole teams; a byed unteamed player is legal (the
 * organizer's way to park an odd walk-in without dropping them). An odd team
 * count auto-byes one whole team (fewest byes, then lowest score).
 */
function runTeamPairing(
  snapshot: TeamSnapshotPlayer[],
  seated: TeamSnapshotPlayer[],
  roundNumber: number,
  byePlayerIds: string[],
): { pairing: PairingResult; byePlayerIds: string[] } {
  const full = buildTeamUnits(snapshot);
  const { partialByePlayerIds } = collapseTeamByes(byePlayerIds, full.teamByPlayer);
  if (partialByePlayerIds.length > 0) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "A bye must sit out a whole team — include both members.",
    );
  }
  const field = buildTeamUnits(seated);
  if (field.unteamedPlayerIds.length > 0) {
    const count = field.unteamedPlayerIds.length;
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      count === 1
        ? "1 player is not on a team. Pair them on the Participants page, sit them out, or drop them before pairing."
        : `${count} players are not on a team. Pair them on the Participants page, sit them out, or drop them before pairing.`,
    );
  }
  if (field.incompleteTeamIds.length > 0) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "A team is missing its partner. Drop the remaining member too, or sit them out, before pairing.",
    );
  }
  let units = field.units;
  let effectiveByes = byePlayerIds;
  if (units.length % 2 === 1) {
    const autoByeTeam = pickAutoBye(units);
    effectiveByes = [...byePlayerIds, ...(field.membersByTeam.get(autoByeTeam) ?? [])];
    units = units.filter((unit) => unit.id !== autoByeTeam);
  }
  if (units.length === 0) {
    return { pairing: EMPTY_PAIRING, byePlayerIds: effectiveByes };
  }
  try {
    const teamPairing = generatePairing(units, roundNumber, { mode: "swiss" });
    return {
      pairing: expandTeamPairing(teamPairing, field.membersByTeam),
      byePlayerIds: effectiveByes,
    };
  } catch (error) {
    if (error instanceof InvalidPlayerCountError) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, error.message);
    }
    throw error;
  }
}

export async function pairNextRound(
  repos: Repos,
  tournament: Tournament,
  byePlayerIds: string[] = [],
): Promise<PodRound> {
  const open = await repos.podTournaments.findOpenRound(tournament.id);
  if (open) {
    throw roundAlreadyOpen();
  }
  const roundNumber = tournament.currentRound + 1;
  const run = await runPairing(repos, tournament, roundNumber, byePlayerIds);
  let round: PodRound;
  try {
    round = await repos.podTournaments.createRound(
      tournament.id,
      roundNumber,
      run.pairing,
      run.byePlayerIds,
    );
  } catch (error) {
    // findOpenRound is check-then-act; a concurrent insert races it and
    // uq_pod_rounds_number rejects the loser. Catch only that constraint.
    if (isUniqueViolationOn(error, "uq_pod_rounds_number")) {
      throw roundAlreadyOpen();
    }
    throw error;
  }
  if (tournament.status === "setup") {
    await repos.tournaments.updateSettings(tournament.id, { status: "running" });
  }
  return round;
}

export async function rerollRound(
  repos: Repos,
  tournament: Tournament,
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
  const run = await runPairing(repos, tournament, roundNumber, byePlayerIds);
  return repos.podTournaments.createRound(
    tournament.id,
    roundNumber,
    run.pairing,
    run.byePlayerIds,
  );
}

export async function replaceRoundPairing(
  repos: Repos,
  tournament: Tournament,
  roundNumber: number,
  pods: { size: 2 | 3 | 4; playerIds: string[] }[],
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

  const swiss = pairingModeOf(tournament) === "swiss";
  const team = tournament.playMode === "2v2";
  for (const pod of pods) {
    if (pod.size !== pod.playerIds.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `A pod declares size ${pod.size} but has ${pod.playerIds.length} players.`,
      );
    }
    if (team && pod.size !== 4) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "2v2 matches must have exactly 4 players (two teams).",
      );
    }
    if (!team && swiss && pod.size !== 2) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "Swiss matches must have exactly 2 players.",
      );
    }
    if (!team && !swiss && pod.size === 2) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Pods must have 3 or 4 players.");
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
  // stays truthful after a hand edit. In 2v2 the truthful unit is the team:
  // pods collapse to team pods (rejecting any that are not two full teams) and
  // the penalty is scored over team units, exactly as at generation.
  const snapshot = await repos.podTournaments.loadOpenRoundSnapshot(
    tournament.id,
    scoringOf(tournament),
  );
  const players = snapshot.map((entry) => toPairingPlayer(entry));
  const enginePods: Pod[] = pods.map((pod) => ({ size: pod.size, playerIds: pod.playerIds }));
  let evaluated: { perPod: PairingResult["perPod"]; totalPenalty: number };
  if (team) {
    const teams = buildTeamUnits(players);
    const { teamPods, invalidPodIndexes } = collapseTeamPods(enginePods, teams.teamByPlayer);
    if (invalidPodIndexes.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "Each 2v2 match must hold two complete teams.",
      );
    }
    const { partialByePlayerIds } = collapseTeamByes(byePlayerIds, teams.teamByPlayer);
    if (partialByePlayerIds.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "A bye must sit out a whole team — include both members.",
      );
    }
    evaluated = evaluatePairing(teamPods, teams.units);
  } else {
    evaluated = evaluatePairing(enginePods, players);
  }
  const pairing: PairingResult = {
    pods: enginePods,
    perPod: evaluated.perPod,
    totalPenalty: evaluated.totalPenalty,
    strategy: "manual",
  };
  await repos.podTournaments.replacePairing(round.id, pairing, byePlayerIds);
}

function toPairingPlayer(snapshot: PodSnapshotPlayer): TeamSnapshotPlayer {
  return {
    id: snapshot.playerId,
    teamId: snapshot.teamId,
    score: snapshot.score,
    pods3: snapshot.pods3,
    pods4: snapshot.pods4,
    byes: snapshot.byes,
    opponents: new Map(Object.entries(snapshot.opponents)),
    region: snapshot.region,
    regionHistory: new Map(Object.entries(snapshot.regionHistory)),
    fixedTable: snapshot.fixedTable,
  };
}

/** Finalizing is just a status flip — standings re-derive from the rows. */
export async function finalizeRound(
  repos: Repos,
  tournament: Tournament,
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
 * The server derives each player's placement from the points (higher finishes
 * first; equal points share a place) before storing both. `allowFinalized`
 * lets the owner edit a finalized round; the participant link cannot.
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
      "This round is finalized. Results can no longer be submitted here.",
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
  if (found.tournament.playMode === "2v2") {
    // A 2v2 result is a team result: both members of a side carry the same
    // game score, so the derived placements collapse to two team placements.
    for (const [teamId, teamResults] of Map.groupBy(results, (result) =>
      found.teamByPlayer.get(result.playerId),
    )) {
      if (teamId === undefined) {
        throw new AppError(
          400,
          ERROR_CODES.BAD_REQUEST,
          "A result names a player who is not on a team.",
        );
      }
      if (new Set(teamResults.map((result) => result.gamePoints)).size > 1) {
        throw new AppError(
          400,
          ERROR_CODES.BAD_REQUEST,
          "Teammates share one team result — their game points must match.",
        );
      }
    }
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

/**
 * The repo write completes the pod (derives placements, flips it to
 * `reported`) once every member has points; until then the pod stays `pending`.
 */
export async function submitPodPlayerResult(
  repos: Repos,
  tournamentId: string,
  podId: string,
  playerId: string,
  gamePoints: number,
): Promise<void> {
  const found = await repos.podTournaments.findPodForResult(podId);
  if (!found || found.tournament.id !== tournamentId) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Pod not found");
  }
  if (found.round.status === "finalized") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "This round is finalized. Results can no longer be submitted here.",
    );
  }
  if (!found.memberPlayerIds.includes(playerId)) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "This player is not in this pod.");
  }
  if (gamePoints < 0) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Game points cannot be negative.");
  }
  // A 2v2 self-report is the team's result: mirror it onto the teammate, so
  // the pod completes once each side has reported (any member of either team).
  const teamId = found.teamByPlayer.get(playerId);
  const targets =
    found.tournament.playMode === "2v2" && teamId !== undefined
      ? found.memberPlayerIds.filter((memberId) => found.teamByPlayer.get(memberId) === teamId)
      : [playerId];
  await repos.podTournaments.setMemberGamePoints(podId, targets, gamePoints);
}
