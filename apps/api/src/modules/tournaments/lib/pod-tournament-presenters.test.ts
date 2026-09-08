import type { PodPenaltyBreakdown } from "@openrift/shared/pairing/types";
import { describe, expect, it } from "vitest";

import type { PodMemberRow } from "../repositories/pod-tournaments-rounds.js";
import type { Pod, PodRound, PodScoring } from "../repositories/pod-tournaments-shared.js";
import { toRoundResponse } from "./pod-tournament-presenters.js";

const SCORING: PodScoring = {
  scheme: "standard",
  byePoints: 3,
  winPoints: 3,
  drawPoints: 1,
  playMode: "1v1",
};

const ROUND: PodRound = {
  id: "round-1",
  tournamentId: "tournament-1",
  roundNumber: 2,
  status: "finalized",
  penaltyTotal: 42,
  pairingStrategy: "local-search",
  createdAt: new Date("2026-04-20T00:00:00.000Z"),
  finalizedAt: new Date("2026-04-20T01:30:00.000Z"),
};

const POD: Pod = {
  id: "pod-1",
  roundId: "round-1",
  podNumber: 1,
  size: 4,
  resultStatus: "reported",
  penaltyBreakdown: {
    total: 9,
    rematch: 4,
    rematchPairs: 1,
    spread: 2,
    scoreSpread: 3,
    imbalance: 0,
    float: 1,
    threePodRepeat: 0,
    sameRegion: 2,
    repeatedRegion: 1,
  },
};

function member(playerId: string, placement: number | null, teamId: string | null = null) {
  return {
    podId: POD.id,
    playerId,
    displayName: playerId.toUpperCase(),
    teamId,
    placement,
    gamePoints: placement === null ? null : 4 - placement,
  } satisfies PodMemberRow;
}

const MEMBERS = [member("a", 1), member("b", 2), member("c", 3), member("d", 4)];

describe("toRoundResponse", () => {
  it("renders the round timestamps as ISO 8601 and scores its reported pods", () => {
    const response = toRoundResponse(
      { round: ROUND, pods: [{ pod: POD, members: MEMBERS }], byes: [] },
      SCORING,
    );

    expect(response).toEqual({
      id: "round-1",
      roundNumber: 2,
      status: "finalized",
      pairingStrategy: "local-search",
      penaltyTotal: 42,
      createdAt: "2026-04-20T00:00:00.000Z",
      finalizedAt: "2026-04-20T01:30:00.000Z",
      byes: [],
      pods: [
        {
          id: "pod-1",
          podNumber: 1,
          size: 4,
          resultStatus: "reported",
          members: [
            {
              playerId: "a",
              displayName: "A",
              teamId: null,
              gamePoints: 3,
              placement: 1,
              points: 3,
            },
            {
              playerId: "b",
              displayName: "B",
              teamId: null,
              gamePoints: 2,
              placement: 2,
              points: 2,
            },
            {
              playerId: "c",
              displayName: "C",
              teamId: null,
              gamePoints: 1,
              placement: 3,
              points: 1,
            },
            {
              playerId: "d",
              displayName: "D",
              teamId: null,
              gamePoints: 0,
              placement: 4,
              points: 0,
            },
          ],
          penalty: {
            total: 9,
            rematchPairs: 1,
            spread: 2,
            scoreSpread: 3,
            imbalance: 0,
            float: 1,
            threePodRepeat: 0,
            sameRegion: 2,
            repeatedRegion: 1,
          },
        },
      ],
    });
  });

  it("leaves an unfinalized round's finalizedAt null", () => {
    const response = toRoundResponse(
      {
        round: { ...ROUND, status: "reporting", finalizedAt: null },
        pods: [],
        byes: [],
      },
      SCORING,
    );

    expect(response.finalizedAt).toBeNull();
  });

  it("withholds points until the pod is reported with a placement for every member", () => {
    const pending = toRoundResponse(
      {
        round: ROUND,
        pods: [
          {
            pod: { ...POD, resultStatus: "pending" },
            members: MEMBERS,
          },
        ],
        byes: [],
      },
      SCORING,
    );
    expect(pending.pods[0]!.members.map((entry) => entry.points)).toEqual([null, null, null, null]);

    const partial = toRoundResponse(
      {
        round: ROUND,
        pods: [
          {
            pod: POD,
            members: [member("a", 1), member("b", 2), member("c", 3), member("d", null)],
          },
        ],
        byes: [],
      },
      SCORING,
    );
    expect(partial.pods[0]!.members.map((entry) => entry.points)).toEqual([null, null, null, null]);
  });

  it("scores a 2v2 pod by team when the tournament plays 2v2", () => {
    const response = toRoundResponse(
      {
        round: ROUND,
        pods: [
          {
            pod: POD,
            members: [
              member("a", 1, "x"),
              member("b", 3, "y"),
              member("c", 2, "x"),
              member("d", 4, "y"),
            ],
          },
        ],
        byes: [],
      },
      { ...SCORING, playMode: "2v2" },
    );

    expect(response.pods[0]!.members.map((entry) => entry.points)).toEqual([3, 0, 3, 0]);
  });

  it("carries the byes through as player id and display name only", () => {
    const response = toRoundResponse(
      {
        round: ROUND,
        pods: [],
        byes: [{ roundId: ROUND.id, playerId: "e", displayName: "E" }],
      },
      SCORING,
    );

    expect(response.byes).toEqual([{ playerId: "e", displayName: "E" }]);
  });

  it("defaults the region penalties missing from breakdowns stored before the region features", () => {
    const {
      sameRegion: _sameRegion,
      repeatedRegion: _repeatedRegion,
      ...legacy
    } = POD.penaltyBreakdown;
    const response = toRoundResponse(
      {
        round: ROUND,
        pods: [
          { pod: { ...POD, penaltyBreakdown: legacy as PodPenaltyBreakdown }, members: MEMBERS },
        ],
        byes: [],
      },
      SCORING,
    );

    expect(response.pods[0]!.penalty).toMatchObject({ sameRegion: 0, repeatedRegion: 0 });
  });
});
