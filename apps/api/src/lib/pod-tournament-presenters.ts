import { pointsForPlacements, swissPointsForPlacements } from "@openrift/shared";
import type { PodResponse, PodRoundResponse } from "@openrift/shared";

import type { Pod, PodRound, PodScoring } from "../repositories/pod-tournaments.js";

/**
 * Pure row → response mappers for the pod engine (ADR-033), plus the scoring
 * helpers they share with the repository's derive-on-read folding. Points are
 * never stored: both the round responses here and `foldFinalized` recompute
 * them from the raw placements, so the two must agree on these helpers.
 */

/** Narrows a stored pod size to the literal union (the CHECK guarantees 2/3/4). */
export function podSizeOf(value: number): 2 | 3 | 4 {
  return value === 2 ? 2 : value === 3 ? 3 : 4;
}

/** @returns Per-member points for a pod, by placement. */
export function pointsForPod(placements: number[], size: 2 | 3 | 4, scoring: PodScoring): number[] {
  if (size === 2) {
    return swissPointsForPlacements(placements, scoring.winPoints, scoring.drawPoints);
  }
  return pointsForPlacements(placements, size, scoring.scheme);
}

/**
 * The two team ids of a 2v2 team match, or null when the members don't form
 * exactly two full teams (a 1v1 pod, or pre-teams data — those fall back to
 * the per-player scoring paths).
 */
export function teamsOf(members: { teamId: string | null }[]): [string, string] | null {
  if (members.length !== 4 || members.some((member) => member.teamId === null)) {
    return null;
  }
  const distinct = [...new Set(members.map((member) => member.teamId as string))];
  return distinct.length === 2 ? [distinct[0], distinct[1]] : null;
}

/** @returns Per-member points for a 2v2 team match, scored like a Swiss match. */
export function pointsForTeamPod(
  members: { teamId: string | null; placement: number | null }[],
  teams: [string, string],
  scoring: PodScoring,
): number[] {
  const placementOf = (teamId: string): number =>
    Math.min(
      ...members
        .filter((member) => member.teamId === teamId)
        .map((member) => member.placement ?? 0),
    );
  const teamPoints = swissPointsForPlacements(
    [placementOf(teams[0]), placementOf(teams[1])],
    scoring.winPoints,
    scoring.drawPoints,
  );
  return members.map((member) => teamPoints[member.teamId === teams[0] ? 0 : 1] ?? 0);
}

export interface PodMemberRow {
  podId: string;
  playerId: string;
  displayName: string;
  teamId: string | null;
  placement: number | null;
  gamePoints: number | null;
}

export interface PodByeRow {
  roundId: string;
  playerId: string;
  displayName: string;
}

export interface PodWithMembers {
  pod: Pod;
  members: PodMemberRow[];
}

/** One round's raw rows, as `loadRounds` reads them. */
export interface PodRoundRows {
  round: PodRound;
  pods: PodWithMembers[];
  byes: PodByeRow[];
}

function toPodResponse(pod: Pod, memberRows: PodMemberRow[], scoring: PodScoring): PodResponse {
  const size = podSizeOf(pod.size);
  const reported =
    pod.resultStatus === "reported" && memberRows.every((member) => member.placement !== null);
  const teams = scoring.playMode === "2v2" ? teamsOf(memberRows) : null;
  const points = reported
    ? teams
      ? pointsForTeamPod(memberRows, teams, scoring)
      : pointsForPod(
          memberRows.map((member) => member.placement ?? 0),
          size,
          scoring,
        )
    : null;
  const breakdown = pod.penaltyBreakdown;
  return {
    id: pod.id,
    podNumber: pod.podNumber,
    size,
    resultStatus: pod.resultStatus,
    members: memberRows.map((member, index) => ({
      playerId: member.playerId,
      displayName: member.displayName,
      teamId: member.teamId,
      gamePoints: member.gamePoints,
      placement: member.placement,
      points: points ? (points[index] ?? null) : null,
    })),
    penalty: {
      total: breakdown.total,
      rematchPairs: breakdown.rematchPairs,
      spread: breakdown.spread,
      scoreSpread: breakdown.scoreSpread,
      imbalance: breakdown.imbalance,
      float: breakdown.float,
      threePodRepeat: breakdown.threePodRepeat,
      // Breakdowns stored before the region features lack these keys.
      sameRegion: breakdown.sameRegion ?? 0,
      repeatedRegion: breakdown.repeatedRegion ?? 0,
    },
  };
}

/** @returns The round's rows mapped to the API response, points included. */
export function toRoundResponse(rows: PodRoundRows, scoring: PodScoring): PodRoundResponse {
  const { round } = rows;
  return {
    id: round.id,
    roundNumber: round.roundNumber,
    status: round.status,
    pairingStrategy: round.pairingStrategy,
    penaltyTotal: round.penaltyTotal,
    createdAt: round.createdAt.toISOString(),
    finalizedAt: round.finalizedAt ? round.finalizedAt.toISOString() : null,
    pods: rows.pods.map((entry) => toPodResponse(entry.pod, entry.members, scoring)),
    byes: rows.byes.map((bye) => ({ playerId: bye.playerId, displayName: bye.displayName })),
  };
}
