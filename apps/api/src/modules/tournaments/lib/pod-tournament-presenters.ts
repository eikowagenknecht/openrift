import type { PodResponse, PodRoundResponse } from "@openrift/shared/types/api/pod-tournament";

import { podSizeOf, pointsForPod, pointsForTeamPod, teamsOf } from "../repositories/pod-points.js";
import type { PodMemberRow, PodRoundRows } from "../repositories/pod-tournaments-rounds.js";
import type { Pod, PodScoring } from "../repositories/pod-tournaments-shared.js";

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
