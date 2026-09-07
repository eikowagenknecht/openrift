import type { PairingPlayer, PairingResult, Pod } from "./types.js";

export type TeamSnapshotPlayer = PairingPlayer & { teamId?: string | null };

export interface TeamUnitsResult {
  units: PairingPlayer[];
  membersByTeam: Map<string, string[]>;
  teamByPlayer: Map<string, string>;
  unteamedPlayerIds: string[];
  incompleteTeamIds: string[];
}

/**
 * Aggregates come from one representative member (team members share every
 * per-round stat); folded opponent counts are halved to team-level meetings.
 */
export function buildTeamUnits(players: TeamSnapshotPlayer[]): TeamUnitsResult {
  const unteamedPlayerIds = players
    .filter((player) => player.teamId === null || player.teamId === undefined)
    .map((player) => player.id);
  const teamed = players.filter(
    (player): player is TeamSnapshotPlayer & { teamId: string } =>
      player.teamId !== null && player.teamId !== undefined,
  );
  const teamByPlayer = new Map(teamed.map((player) => [player.id, player.teamId]));
  const membersByTeam = new Map<string, string[]>();
  const units: PairingPlayer[] = [];
  const incompleteTeamIds: string[] = [];
  for (const [teamId, members] of Map.groupBy(teamed, (player) => player.teamId)) {
    membersByTeam.set(
      teamId,
      members.map((member) => member.id),
    );
    const [representative] = members;
    if (members.length !== 2 || representative === undefined) {
      incompleteTeamIds.push(teamId);
      continue;
    }
    const opponents = new Map<string, number>();
    for (const [opponentId, meetings] of representative.opponents) {
      const opponentTeam = teamByPlayer.get(opponentId);
      if (opponentTeam !== undefined) {
        opponents.set(opponentTeam, (opponents.get(opponentTeam) ?? 0) + meetings);
      }
    }
    for (const [key, folded] of opponents) {
      opponents.set(key, folded / 2);
    }
    units.push({
      id: teamId,
      score: representative.score,
      pods3: 0,
      pods4: 0,
      byes: representative.byes,
      opponents,
    });
  }
  return { units, membersByTeam, teamByPlayer, unteamedPlayerIds, incompleteTeamIds };
}

/** Penalties and strategy carry over unchanged: they were scored at the team level. */
export function expandTeamPairing(
  result: PairingResult,
  membersByTeam: ReadonlyMap<string, string[]>,
): PairingResult {
  return {
    ...result,
    pods: result.pods.map((pod) => ({
      size: 4,
      playerIds: pod.playerIds.flatMap((teamId) => membersByTeam.get(teamId) ?? []),
    })),
  };
}

/**
 * A pod collapses only when it holds exactly two complete teams; others land
 * in `invalidPodIndexes` and are omitted from `teamPods` (not parallel arrays).
 */
export function collapseTeamPods(
  pods: Pod[],
  teamByPlayer: ReadonlyMap<string, string>,
): { teamPods: Pod[]; invalidPodIndexes: number[] } {
  const teamPods: Pod[] = [];
  const invalidPodIndexes: number[] = [];
  pods.forEach((pod, index) => {
    const counts = new Map<string, number>();
    for (const playerId of pod.playerIds) {
      const teamId = teamByPlayer.get(playerId);
      if (teamId === undefined) {
        invalidPodIndexes.push(index);
        return;
      }
      counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
    }
    const complete =
      pod.size === 4 && counts.size === 2 && [...counts.values()].every((count) => count === 2);
    if (!complete) {
      invalidPodIndexes.push(index);
      return;
    }
    teamPods.push({ size: 2, playerIds: [...counts.keys()] });
  });
  return { teamPods, invalidPodIndexes };
}

/**
 * A 2v2 bye must cover both team members; a lone member is a partial bye.
 * Unteamed byed players are valid and returned separately.
 */
export function collapseTeamByes(
  byePlayerIds: readonly string[],
  teamByPlayer: ReadonlyMap<string, string>,
): { byeTeamIds: string[]; unteamedByePlayerIds: string[]; partialByePlayerIds: string[] } {
  const byeSet = new Set(byePlayerIds);
  const byTeam = new Map<string, string[]>();
  const unteamedByePlayerIds: string[] = [];
  const partialByePlayerIds: string[] = [];
  for (const playerId of byePlayerIds) {
    const teamId = teamByPlayer.get(playerId);
    if (teamId === undefined) {
      unteamedByePlayerIds.push(playerId);
      continue;
    }
    const members = byTeam.get(teamId) ?? [];
    members.push(playerId);
    byTeam.set(teamId, members);
  }
  const byeTeamIds: string[] = [];
  for (const [teamId, members] of byTeam) {
    const teammates = [...teamByPlayer.entries()]
      .filter(([, team]) => team === teamId)
      .map(([playerId]) => playerId);
    if (teammates.length === 2 && teammates.every((playerId) => byeSet.has(playerId))) {
      byeTeamIds.push(teamId);
    } else {
      partialByePlayerIds.push(...members);
    }
  }
  return { byeTeamIds, unteamedByePlayerIds, partialByePlayerIds };
}
