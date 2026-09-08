import { pointsForPlacements, swissPointsForPlacements } from "@openrift/shared/pairing/points";

import type { PodScoring } from "./pod-tournaments-shared.js";

/**
 * Points are never stored: both the round responses and `foldFinalized`
 * recompute them from the raw placements, so the two must agree on these helpers.
 */

export function podSizeOf(value: number): 2 | 3 | 4 {
  return value === 2 ? 2 : value === 3 ? 3 : 4;
}

export function pointsForPod(placements: number[], size: 2 | 3 | 4, scoring: PodScoring): number[] {
  if (size === 2) {
    return swissPointsForPlacements(placements, scoring.winPoints, scoring.drawPoints);
  }
  return pointsForPlacements(placements, size, scoring.scheme);
}

/** Null when the members don't form exactly two full teams (falls back to per-player scoring). */
export function teamsOf(members: { teamId: string | null }[]): [string, string] | null {
  if (members.length !== 4 || members.some((member) => member.teamId === null)) {
    return null;
  }
  const [teamA, teamB, ...rest] = [...new Set(members.map((member) => member.teamId as string))];
  return teamA !== undefined && teamB !== undefined && rest.length === 0 ? [teamA, teamB] : null;
}

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
