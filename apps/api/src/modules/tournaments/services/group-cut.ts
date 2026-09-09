import { ERROR_CODES } from "@openrift/shared/error-codes";
import { mathRandom } from "@openrift/shared/pack-opener/rng";
import { nextCutRoundPairs, seedBracket } from "@openrift/shared/pairing/cut-bracket";
import type {
  BracketSeed,
  BracketSlot,
  GroupPlanGroup,
} from "@openrift/shared/pairing/group-cut-types";
import { GROUP_STAGE_ROUNDS } from "@openrift/shared/pairing/group-cut-types";
import {
  groupUnits,
  InvalidGroupCountError,
  planGroups,
  unitRoundPairs,
  validateGroupCount,
} from "@openrift/shared/pairing/group-stage";

import type { Repos } from "../../../deps.js";
import { AppError } from "../../../errors.js";
import { assertFound } from "../../../lib/assertions.js";
import { loadGroupCutContext } from "../lib/group-cut-builders.js";
import type { GroupCutPlayer, GroupStageRoundNumber, UnitProgress } from "../lib/group-cut.js";
import {
  cutRounds,
  groupStageRounds,
  highestRoundNumber,
  isGroupCut,
  isGroupStageRound,
  opponentsByPlayer,
  planFromRows,
  podInsertsForPairs,
  podWinnerId,
  unitPlayerIds,
  unitPodOffsets,
  unitProgress,
} from "../lib/group-cut.js";
import type { PodRoundRows } from "../repositories/pod-tournaments-rounds.js";
import type { GroupPodInsert } from "../repositories/tournament-groups.js";
import type { Tournament } from "../repositories/tournaments-shared.js";

function badRequest(message: string): AppError {
  return new AppError(400, ERROR_CODES.BAD_REQUEST, message);
}

function conflict(message: string): AppError {
  return new AppError(409, ERROR_CODES.CONFLICT, message);
}

function plural(count: number, singular: string, pluralWord: string): string {
  return count === 1 ? singular : pluralWord;
}

async function loadState(
  repos: Repos,
  tournament: Tournament,
): Promise<{ players: GroupCutPlayer[]; roundRows: PodRoundRows[] }> {
  const [players, roundRows] = await Promise.all([
    repos.podTournaments.listPlayers(tournament.id),
    repos.podTournaments.loadRounds(tournament.id),
  ]);
  return { players, roundRows };
}

function droppedIdsOf(players: readonly GroupCutPlayer[]): Set<string> {
  return new Set(players.filter((player) => player.status !== "active").map((player) => player.id));
}

async function generateGroups(
  repos: Repos,
  tournament: Tournament,
  players: readonly GroupCutPlayer[],
): Promise<void> {
  const active = players.filter((player) => player.status === "active");
  try {
    validateGroupCount(active.length);
  } catch (error) {
    if (error instanceof InvalidGroupCountError) {
      throw badRequest(error.message);
    }
    throw error;
  }
  if (tournament.cutSize > active.length) {
    throw badRequest(
      `A top ${tournament.cutSize} needs at least ${tournament.cutSize} active players.`,
    );
  }
  if (tournament.legendTiebreak) {
    await assertLegendsOnFile(repos, tournament, active);
  }
  const plan = planGroups(
    active.map((player) => player.id),
    mathRandom,
  );
  const units = groupUnits(plan);
  const offsets = unitPodOffsets(units);
  const dropped = droppedIdsOf(players);
  const firstRoundPods = units.flatMap((unit, index) =>
    podInsertsForPairs(unitRoundPairs(unit, 1), offsets[index] ?? 0, dropped),
  );
  await repos.tournamentGroups.createGroupStage({
    tournamentId: tournament.id,
    groups: plan.groups.map((group) => ({
      label: group.label,
      pairedWith: group.pairedWith,
      playerIds: group.playerIds,
    })),
    firstRoundPods,
  });
}

async function assertLegendsOnFile(
  repos: Repos,
  tournament: Tournament,
  active: readonly GroupCutPlayer[],
): Promise<void> {
  const missing = active.filter((player) => player.legendCardId === null);
  if (missing.length === 0) {
    return;
  }
  const fromDeckCheck = await repos.tournamentGroups.legendCardIdsFromDeckCheck(tournament.id);
  const fills = missing.flatMap((player) => {
    const legendCardId = fromDeckCheck.get(player.id);
    return legendCardId === undefined ? [] : [{ participantId: player.id, legendCardId }];
  });
  if (fills.length > 0) {
    await repos.tournamentGroups.setParticipantLegends(fills);
  }
  const filled = new Set(fills.map((fill) => fill.participantId));
  const still = missing.filter((player) => !filled.has(player.id));
  if (still.length === 0) {
    return;
  }
  const names = still.map((player) => player.displayName).join(", ");
  throw badRequest(
    `${still.length} ${plural(still.length, "player has", "players have")} no Legend on file: ${names}`,
  );
}

async function generateCut(
  repos: Repos,
  tournament: Tournament,
  players: readonly GroupCutPlayer[],
  roundRows: readonly PodRoundRows[],
): Promise<void> {
  const groups = await repos.tournamentGroups.listGroups(tournament.id);
  const plan = planFromRows(groups, players);
  const stillPlaying = groupUnits(plan)
    .filter((unit) => {
      const progress = unitProgress(unitPlayerIds(unit), roundRows);
      return progress.roundsStarted < GROUP_STAGE_ROUNDS || !progress.currentRoundReported;
    })
    .flatMap((unit) => unit.map((group) => group.label));
  if (stillPlaying.length > 0) {
    throw conflict(
      `The cut needs every group reported. Still playing: ${stillPlaying.join(", ")}.`,
    );
  }
  const context = await loadGroupCutContext(repos, tournament, players, roundRows);
  if (context.ranking.pendingMetaLegendIds.length > 0) {
    const names = context.ranking.pendingMetaLegendIds
      .map((legendCardId) => context.legendNames.get(legendCardId) ?? legendCardId)
      .join(", ");
    throw conflict(`Enter the meta shares for ${names} first.`);
  }
  const qualifiers = context.ranking.ranking.slice(0, tournament.cutSize);
  if (qualifiers.length < tournament.cutSize) {
    throw badRequest(
      `A top ${tournament.cutSize} needs ${tournament.cutSize} qualifiers, the field has ${qualifiers.length}.`,
    );
  }
  const opponents = opponentsByPlayer(context.matches);
  const seeds: BracketSeed[] = qualifiers.map((row, index) => ({
    seed: index + 1,
    playerId: row.playerId,
    groupLabel: row.groupLabel,
    opponentIds: opponents.get(row.playerId) ?? [],
  }));
  const slots = seedBracket(seeds, { avoidRematches: tournament.cutRematchAvoidance });
  await repos.tournamentGroups.createCut({
    tournamentId: tournament.id,
    roundNumber: GROUP_STAGE_ROUNDS + 1,
    seeds: qualifiers.map((row, index) => ({ participantId: row.playerId, seed: index + 1 })),
    pods: bracketPods(slots),
  });
}

function bracketPods(slots: readonly BracketSlot[]): GroupPodInsert[] {
  return slots.map((slot) => ({
    podNumber: slot.podNumber,
    playerIds: slot.playerIds,
    placements: null,
  }));
}

async function generateNextCutRound(
  repos: Repos,
  tournament: Tournament,
  players: readonly GroupCutPlayer[],
  roundRows: readonly PodRoundRows[],
): Promise<void> {
  const rounds = cutRounds(roundRows);
  const previous = rounds.at(-1);
  assertFound(previous, "Round not found");
  if (previous.round.status !== "finalized") {
    throw conflict("A round is already open. Finalize or re-roll it before pairing the next one.");
  }
  if (previous.pods.length <= 1) {
    throw conflict("The final has been played.");
  }
  const seedByPlayer = new Map(
    players.flatMap((player) => (player.seed === null ? [] : [[player.id, player.seed] as const])),
  );
  const winners = previous.pods.map((entry) => {
    const winnerId = podWinnerId(entry.members);
    if (winnerId === undefined) {
      throw conflict("Every match of the previous round needs a result first.");
    }
    return { podNumber: entry.pod.podNumber, winnerId };
  });
  await repos.tournamentGroups.createCutRound(
    tournament.id,
    previous.round.roundNumber + 1,
    bracketPods(nextCutRoundPairs(winners, seedByPlayer)),
  );
}

/** The `generateRound` action of a `group_cut` tournament: groups, then the cut, then the bracket. */
export async function generateGroupCutRound(repos: Repos, tournament: Tournament): Promise<void> {
  const { players, roundRows } = await loadState(repos, tournament);
  const highest = highestRoundNumber(roundRows);
  if (highest === 0) {
    await generateGroups(repos, tournament, players);
    return;
  }
  if (highest <= GROUP_STAGE_ROUNDS) {
    await generateCut(repos, tournament, players, roundRows);
    return;
  }
  await generateNextCutRound(repos, tournament, players, roundRows);
}

interface UnitStart {
  unitIndex: number;
  unit: GroupPlanGroup[];
  progress: UnitProgress;
}

async function loadUnits(
  repos: Repos,
  tournament: Tournament,
  players: readonly GroupCutPlayer[],
  roundRows: readonly PodRoundRows[],
): Promise<{ units: UnitStart[]; offsets: number[]; groupIdByLabel: Map<string, string> }> {
  const groups = await repos.tournamentGroups.listGroups(tournament.id);
  const plan = planFromRows(groups, players);
  const built = groupUnits(plan);
  return {
    units: built.map((unit, unitIndex) => ({
      unitIndex,
      unit,
      progress: unitProgress(unitPlayerIds(unit), roundRows),
    })),
    offsets: unitPodOffsets(built),
    groupIdByLabel: new Map(groups.map((group) => [group.label, group.id])),
  };
}

function roundIdFor(roundRows: readonly PodRoundRows[], roundNumber: number): string {
  const round = groupStageRounds(roundRows).find((rows) => rows.round.roundNumber === roundNumber);
  assertFound(round, "Round not found");
  return round.round.id;
}

async function startUnit(
  repos: Repos,
  entry: UnitStart,
  offset: number,
  roundRows: readonly PodRoundRows[],
  dropped: ReadonlySet<string>,
): Promise<void> {
  const next = (entry.progress.roundsStarted + 1) as GroupStageRoundNumber;
  const pods = podInsertsForPairs(unitRoundPairs(entry.unit, next), offset, dropped);
  await repos.tournamentGroups.insertGroupPods(roundIdFor(roundRows, next), pods);
}

/** Self-paced mode: one group (with its paired group) advances on its own. */
export async function startGroupRound(
  repos: Repos,
  tournament: Tournament,
  groupId: string,
): Promise<void> {
  const { players, roundRows } = await loadState(repos, tournament);
  const { units, offsets, groupIdByLabel } = await loadUnits(repos, tournament, players, roundRows);
  const entry = units.find((unit) =>
    unit.unit.some((group) => groupIdByLabel.get(group.label) === groupId),
  );
  assertFound(entry, "Group not found");
  if (entry.progress.roundsStarted >= GROUP_STAGE_ROUNDS) {
    throw conflict("This group has played all three group rounds.");
  }
  if (!entry.progress.currentRoundReported) {
    throw conflict("Every match in this group's current round needs a result first.");
  }
  await startUnit(repos, entry, offsets[entry.unitIndex] ?? 0, roundRows, droppedIdsOf(players));
}

/** Lockstep mode: the organizer starts the next round for every group at once. */
export async function startGroupStageRound(repos: Repos, tournament: Tournament): Promise<void> {
  const { players, roundRows } = await loadState(repos, tournament);
  const { units, offsets } = await loadUnits(repos, tournament, players, roundRows);
  if (units.length === 0) {
    throw conflict("The groups have not been generated yet.");
  }
  const behind = units.filter((entry) => !entry.progress.currentRoundReported);
  if (behind.length > 0) {
    throw conflict("Every group's current round needs a result first.");
  }
  const rounds = new Set(units.map((entry) => entry.progress.roundsStarted));
  if (rounds.size > 1) {
    throw conflict("The groups are on different rounds. Start them one by one.");
  }
  if (units.every((entry) => entry.progress.roundsStarted >= GROUP_STAGE_ROUNDS)) {
    throw conflict("Every group has played all three group rounds.");
  }
  const dropped = droppedIdsOf(players);
  for (const entry of units) {
    await startUnit(repos, entry, offsets[entry.unitIndex] ?? 0, roundRows, dropped);
  }
}

export async function reportGroupStageWalkovers(
  repos: Repos,
  tournament: Tournament,
  playerId: string,
): Promise<void> {
  if (!isGroupCut(tournament)) {
    return;
  }
  const pods = await repos.tournamentGroups.listPendingGroupStagePods(tournament.id, playerId);
  for (const pod of pods) {
    const results = pod.members.map((member) => ({
      playerId: member.playerId,
      placement: member.status === "active" ? 1 : 2,
    }));
    // Two dropped players draw the walkover.
    if (results.every((result) => result.placement === 2)) {
      await repos.tournamentGroups.setWalkoverResult(
        pod.podId,
        results.map((result) => ({ ...result, placement: 1 })),
      );
      continue;
    }
    await repos.tournamentGroups.setWalkoverResult(pod.podId, results);
  }
}

export async function setLegendMetaShares(
  repos: Repos,
  tournament: Tournament,
  shares: readonly { legendCardId: string; share: number }[],
): Promise<void> {
  if (!isGroupCut(tournament)) {
    throw badRequest("Meta shares belong to a group stage tournament.");
  }
  const players = await repos.podTournaments.listPlayers(tournament.id);
  const known = new Set(
    players.flatMap((player) => (player.legendCardId === null ? [] : [player.legendCardId])),
  );
  const unknown = shares.filter((entry) => !known.has(entry.legendCardId));
  if (unknown.length > 0) {
    throw badRequest("A meta share names a Legend nobody in this tournament plays.");
  }
  await repos.tournamentGroups.upsertMetaShares(tournament.id, [...shares]);
}

/** Group rounds are a fixed schedule, so only round 1 (the shuffle) re-rolls. */
export async function rerollGroupCutRound(
  repos: Repos,
  tournament: Tournament,
  roundNumber: number,
): Promise<void> {
  const { players, roundRows } = await loadState(repos, tournament);
  const rows = roundRows.find((entry) => entry.round.roundNumber === roundNumber);
  assertFound(rows, "Round not found");
  if (isGroupStageRound(roundNumber)) {
    if (roundNumber !== 1) {
      throw badRequest("Group rounds follow the fixed schedule.");
    }
    const laterPods = groupStageRounds(roundRows).some(
      (entry) => entry.round.roundNumber > 1 && entry.pods.length > 0,
    );
    const played = rows.pods.some((entry) => entry.pod.resultStatus === "reported");
    if (laterPods || played) {
      throw badRequest("The groups can only be re-rolled before a group match has a result.");
    }
    await repos.tournamentGroups.deleteGroupStage(tournament.id);
    await generateGroups(repos, tournament, players);
    return;
  }
  if (rows.round.status === "finalized") {
    throw badRequest("A finalized round cannot be re-rolled.");
  }
  if (rows.pods.some((entry) => entry.pod.resultStatus === "reported")) {
    throw badRequest("A round cannot be re-rolled once a pod result has been entered.");
  }
  await repos.tournamentGroups.deleteRound(rows.round.id, tournament.id, roundNumber - 1);
  if (roundNumber === GROUP_STAGE_ROUNDS + 1) {
    await repos.tournamentGroups.clearSeeds(tournament.id);
    return;
  }
  const remaining = await repos.podTournaments.loadRounds(tournament.id);
  await generateNextCutRound(repos, tournament, players, remaining);
}

export function assertGroupCutRun(tournament: Tournament): void {
  if (!isGroupCut(tournament)) {
    throw badRequest("This tournament does not run a group stage.");
  }
}

/** Rounds 1 to 3 are finalized together when the cut is generated, never on their own. */
export function assertCutRoundEditable(tournament: Tournament, roundNumber: number): void {
  if (isGroupCut(tournament) && isGroupStageRound(roundNumber)) {
    throw badRequest("Group rounds are finalized when the cut is generated.");
  }
}

/** The final is one pod; finalizing it ends the tournament. */
export async function completeAfterFinal(
  repos: Repos,
  tournament: Tournament,
  roundNumber: number,
): Promise<void> {
  if (!isGroupCut(tournament) || isGroupStageRound(roundNumber)) {
    return;
  }
  const pods = await repos.tournamentGroups.podCountForRound(tournament.id, roundNumber);
  if (pods === 1 && tournament.status !== "completed") {
    await repos.tournaments.updateSettings(tournament.id, { status: "completed" });
  }
}
