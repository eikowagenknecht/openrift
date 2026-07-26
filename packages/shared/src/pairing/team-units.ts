import type { PairingPlayer, PairingResult, Pod } from "./types.js";

/** A player snapshot that may carry a fixed 2v2 team. */
export type TeamSnapshotPlayer = PairingPlayer & { teamId?: string | null };

/** The collapse of a 2v2 field into engine units (one per complete team). */
export interface TeamUnitsResult {
  /**
   * One engine unit per complete team: `id` is the TEAM id, score/byes are the
   * members' shared values, and `opponents` counts prior meetings by opposing
   * team id. Feeding these through the Swiss engine pairs teams exactly like
   * players, including rematch avoidance and the auto-bye pick.
   */
  units: PairingPlayer[];
  /** Team id -> member player ids, in input order. */
  membersByTeam: Map<string, string[]>;
  /** Player id -> team id, for every teamed player in the input. */
  teamByPlayer: Map<string, string>;
  /** Players in the input with no team. */
  unteamedPlayerIds: string[];
  /** Teams with fewer than two members present in the input (half-teams). */
  incompleteTeamIds: string[];
}

/**
 * Collapse player snapshots into 2v2 team units for the Swiss engine.
 *
 * Aggregates are read off one representative member — fixed teams share every
 * per-round fact (score, byes, opponents), so the members' values are equal by
 * construction. Player-level opponent counts fold to opposing teams via the
 * teammate map; each team match contributes one meeting with each of the two
 * opposing members, so halving the folded count recovers the team-level
 * meeting count. Opponents outside the input (e.g. dropped and unteamable)
 * are skipped — they cannot be paired against anyway.
 *
 * @param players The player snapshots, each optionally carrying a team.
 * @returns The team units plus the membership maps and the leftovers
 *   (unteamed players, half-teams) the caller must reject or sit out.
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
    if (members.length !== 2) {
      incompleteTeamIds.push(teamId);
      continue;
    }
    const representative = members[0];
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

/**
 * Expand an engine pairing over team units (size-2 pods of team ids) into the
 * persistable player-level pairing (size-4 pods of player ids, each side's
 * members adjacent). Penalties and strategy carry over unchanged — they were
 * scored at the team level, which is the truthful unit for 2v2.
 *
 * @param result The engine pairing over team units.
 * @param membersByTeam Team id -> member player ids.
 * @returns The same pairing with every team pod expanded to its four players.
 */
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
 * Collapse player-level pods back to team pods (for penalty evaluation and
 * warnings on a 2v2 pairing). A pod collapses only when it holds exactly two
 * complete teams; anything else lands in `invalidPodIndexes` and is omitted
 * from `teamPods`, so callers must check invalids before trusting indexes to
 * be parallel.
 *
 * @param pods The player-level pods (a stored or hand-edited round).
 * @param teamByPlayer Player id -> team id.
 * @returns The collapsed team pods plus the indexes of pods that are not two
 *   full teams.
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
 * Group a bye list into whole teams. A 2v2 bye covers a whole team (both
 * members sit out together); a bye naming only one member of a team is
 * invalid. Unteamed byed players are legal — sitting out an unteamed player
 * is the organizer's alternative to dropping an odd walk-in — and land in
 * their own bucket.
 *
 * @param byePlayerIds The byed player ids.
 * @param teamByPlayer Player id -> team id.
 * @returns The byed team ids, the byed players with no team, and any players
 *   whose teammate is not also byed.
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
    // Both members must sit out together; a lone member is a partial bye.
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
