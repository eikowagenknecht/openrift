import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../../../deps.js";
import { AppError } from "../../../errors.js";
import type { Outcome, UnitPlan } from "../../../test/group-cut-fixtures.js";
import {
  fourGroupPairs,
  groupCutTournament,
  groupPlayers,
  groupRow,
  groupStageRoundRows,
  pairedGroupPairs,
  playerRow,
  roundRows,
} from "../../../test/group-cut-fixtures.js";
import type { GroupCutPlayer } from "../lib/group-cut.js";
import type { PodRoundRows } from "../repositories/pod-tournaments-rounds.js";
import type {
  GroupInsert,
  GroupPodInsert,
  PendingGroupPod,
} from "../repositories/tournament-groups.js";
import {
  generateGroupCutRound,
  reportGroupStageWalkovers,
  rerollGroupCutRound,
  startGroupRound,
  startGroupStageRound,
} from "./group-cut.js";

interface MockInput {
  players: GroupCutPlayer[];
  groups?: ReturnType<typeof groupRow>[];
  roundRows?: PodRoundRows[];
  pendingPods?: PendingGroupPod[];
}

function mockRepos(input: MockInput) {
  const mocks = {
    loadRounds: vi.fn(async () => input.roundRows ?? []),
    createGroupStage: vi.fn(
      async (_input: {
        tournamentId: string;
        groups: GroupInsert[];
        firstRoundPods: GroupPodInsert[];
      }) => undefined,
    ),
    insertGroupPods: vi.fn(
      async (_tournamentId: string, _roundId: string, _pods: GroupPodInsert[]) => undefined,
    ),
    createCut: vi.fn(
      async (_input: {
        tournamentId: string;
        roundNumber: number;
        seeds: { participantId: string; seed: number }[];
        pods: GroupPodInsert[];
      }) => undefined,
    ),
    createCutRound: vi.fn(
      async (_tournamentId: string, _roundNumber: number, _pods: GroupPodInsert[]) => undefined,
    ),
    deleteRound: vi.fn(
      async (_roundId: string, _tournamentId: string, _currentRound: number) => undefined,
    ),
    deleteGroupStage: vi.fn(async (_tournamentId: string) => undefined),
    clearSeeds: vi.fn(async (_tournamentId: string) => undefined),
    setWalkoverResult: vi.fn(
      async (_podId: string, _results: { playerId: string; placement: number }[]) => undefined,
    ),
  };
  const repos = {
    podTournaments: {
      listPlayers: vi.fn(async () => input.players),
      loadRounds: mocks.loadRounds,
    },
    tournamentGroups: {
      listGroups: vi.fn(async () => input.groups ?? []),
      listMetaShares: vi.fn(async () => []),
      legendCardNames: vi.fn(async () => new Map<string, string>()),
      legendCardIdsFromDeckCheck: vi.fn(async () => new Map<string, string>()),
      setParticipantLegends: vi.fn(async () => undefined),
      listPendingGroupStagePods: vi.fn(async () => input.pendingPods ?? []),
      podCountForRound: vi.fn(async () => 1),
      createGroupStage: mocks.createGroupStage,
      insertGroupPods: mocks.insertGroupPods,
      createCut: mocks.createCut,
      createCutRound: mocks.createCutRound,
      deleteRound: mocks.deleteRound,
      deleteGroupStage: mocks.deleteGroupStage,
      clearSeeds: mocks.clearSeeds,
      setWalkoverResult: mocks.setWalkoverResult,
    },
    tournaments: { updateSettings: vi.fn(async () => undefined) },
  } as unknown as Repos;
  return { repos, ...mocks };
}

async function failureOf(action: Promise<unknown>): Promise<AppError> {
  const caught: unknown = await action.then(
    () => null,
    (error: unknown) => error,
  );
  expect(caught).toBeInstanceOf(AppError);
  return caught as AppError;
}

async function statusOf(action: Promise<unknown>): Promise<number> {
  const failure = await failureOf(action);
  return failure.status;
}

async function messageOf(action: Promise<unknown>): Promise<string> {
  const failure = await failureOf(action);
  return failure.message;
}

const FOUR_LABELS = ["A", "B", "C", "D"];

function fourGroups() {
  return {
    groups: FOUR_LABELS.map((label) => groupRow(label)),
    players: FOUR_LABELS.flatMap((label) => groupPlayers(label, 4)),
  };
}

function fourGroupStage(rounds: Record<string, Outcome[]>): PodRoundRows[] {
  return groupStageRoundRows(
    FOUR_LABELS.map((label) => ({ labels: [label], rounds: rounds[label] ?? [] }) as UnitPlan),
  );
}

/** One 4-player group A and the paired 3-player groups B and C: 10 players. */
function pairedField() {
  return {
    groups: [groupRow("A"), groupRow("B", "C"), groupRow("C", "B")],
    players: [...groupPlayers("A", 4), ...groupPlayers("B", 3), ...groupPlayers("C", 3)],
  };
}

const DONE: Outcome[] = ["first", "first", "first"];

describe("startGroupRound", () => {
  it("starts only the asked group's next round and leaves the others alone", async () => {
    const field = fourGroups();
    const { repos, insertGroupPods } = mockRepos({
      ...field,
      roundRows: fourGroupStage({ A: ["first"], B: ["open"], C: ["first", "first"], D: DONE }),
    });
    await startGroupRound(repos, groupCutTournament(), "g-C");
    expect(insertGroupPods).toHaveBeenCalledTimes(1);
    const [tournamentId, roundId, pods] = insertGroupPods.mock.calls[0] ?? [];
    expect(tournamentId).toBe("t-1");
    expect(roundId).toBe("r-3");
    expect(pods).toEqual([
      { podNumber: 5, playerIds: fourGroupPairs("C", 3)[0], placements: null },
      { podNumber: 6, playerIds: fourGroupPairs("C", 3)[1], placements: null },
    ]);
  });

  it("lets group A reach round 2 while group B is still on round 1", async () => {
    const field = fourGroups();
    const { repos, insertGroupPods } = mockRepos({
      ...field,
      roundRows: fourGroupStage({ A: ["first"], B: ["open"], C: ["open"], D: ["open"] }),
    });
    await startGroupRound(repos, groupCutTournament(), "g-A");
    const pods = insertGroupPods.mock.calls[0]?.[2] ?? [];
    expect(pods.flatMap((pod) => pod.playerIds).every((id) => id.startsWith("a"))).toBe(true);
  });

  it("holds a unit back while one of its matches is open", async () => {
    const field = fourGroups();
    const { repos, insertGroupPods } = mockRepos({
      ...field,
      roundRows: fourGroupStage({ A: ["open"], B: ["open"], C: ["open"], D: ["open"] }),
    });
    const status = await statusOf(startGroupRound(repos, groupCutTournament(), "g-A"));
    expect(status).toBe(409);
    expect(insertGroupPods).not.toHaveBeenCalled();
  });

  it("refuses a fourth round for a finished group", async () => {
    const field = fourGroups();
    const { repos } = mockRepos({
      ...field,
      roundRows: fourGroupStage({ A: DONE, B: DONE, C: DONE, D: DONE }),
    });
    const message = await messageOf(startGroupRound(repos, groupCutTournament(), "g-A"));
    expect(message).toContain("all three group rounds");
  });

  it("rejects a group id from another tournament", async () => {
    const field = fourGroups();
    const { repos } = mockRepos({ ...field, roundRows: fourGroupStage({ A: ["first"] }) });
    await expect(startGroupRound(repos, groupCutTournament(), "g-Z")).rejects.toThrow();
  });
});

describe("startGroupRound with paired 3-player groups", () => {
  it("advances both groups of the pair on one start", async () => {
    const field = pairedField();
    const { repos, insertGroupPods } = mockRepos({
      ...field,
      roundRows: groupStageRoundRows([
        { labels: ["A"], rounds: ["open"] },
        { labels: ["B", "C"], rounds: ["first"] },
      ]),
    });
    await startGroupRound(repos, groupCutTournament(), "g-B");
    const pods = insertGroupPods.mock.calls[0]?.[2] ?? [];
    expect(pods).toEqual(
      pairedGroupPairs("B", "C", 2).map((playerIds, index) => ({
        podNumber: 3 + index,
        playerIds,
        placements: null,
      })),
    );
  });

  it("starts the same pods whichever of the two groups asks", async () => {
    const field = pairedField();
    const rows = groupStageRoundRows([
      { labels: ["A"], rounds: ["open"] },
      { labels: ["B", "C"], rounds: ["first"] },
    ]);
    const viaB = mockRepos({ ...field, roundRows: rows });
    const viaC = mockRepos({ ...field, roundRows: rows });
    await startGroupRound(viaB.repos, groupCutTournament(), "g-B");
    await startGroupRound(viaC.repos, groupCutTournament(), "g-C");
    expect(viaC.insertGroupPods.mock.calls[0]).toEqual(viaB.insertGroupPods.mock.calls[0]);
  });

  it("never advances one of the pair alone", async () => {
    const field = pairedField();
    const rows = groupStageRoundRows([
      { labels: ["A"], rounds: ["first"] },
      { labels: ["B", "C"], rounds: ["first"] },
    ]);
    const openPod = rows[0]?.pods.at(-1);
    if (openPod) {
      openPod.pod.resultStatus = "pending";
    }
    const { repos, insertGroupPods } = mockRepos({ ...field, roundRows: rows });
    const status = await statusOf(startGroupRound(repos, groupCutTournament(), "g-B"));
    expect(status).toBe(409);
    expect(insertGroupPods).not.toHaveBeenCalled();
  });

  it("does not make an unrelated 4-player group wait for the pair", async () => {
    const field = pairedField();
    const { repos, insertGroupPods } = mockRepos({
      ...field,
      roundRows: groupStageRoundRows([
        { labels: ["A"], rounds: ["first"] },
        { labels: ["B", "C"], rounds: ["open"] },
      ]),
    });
    await startGroupRound(repos, groupCutTournament(), "g-A");
    expect(insertGroupPods).toHaveBeenCalledTimes(1);
  });
});

describe("startGroupStageRound", () => {
  it("starts every unit at once when they all reported", async () => {
    const field = fourGroups();
    const { repos, insertGroupPods } = mockRepos({
      ...field,
      roundRows: fourGroupStage({ A: ["first"], B: ["first"], C: ["first"], D: ["first"] }),
    });
    await startGroupStageRound(repos, groupCutTournament({ groupsSelfPaced: false }));
    expect(insertGroupPods).toHaveBeenCalledTimes(4);
    expect(insertGroupPods.mock.calls.map((call) => call[2][0]?.podNumber)).toEqual([1, 3, 5, 7]);
  });

  it("refuses while any group still owes a result", async () => {
    const field = fourGroups();
    const { repos, insertGroupPods } = mockRepos({
      ...field,
      roundRows: fourGroupStage({ A: ["first"], B: ["open"], C: ["first"], D: ["first"] }),
    });
    const status = await statusOf(
      startGroupStageRound(repos, groupCutTournament({ groupsSelfPaced: false })),
    );
    expect(status).toBe(409);
    expect(insertGroupPods).not.toHaveBeenCalled();
  });

  it("refuses once the groups sit on different rounds", async () => {
    const field = fourGroups();
    const { repos } = mockRepos({
      ...field,
      roundRows: fourGroupStage({
        A: ["first", "first"],
        B: ["first"],
        C: ["first"],
        D: ["first"],
      }),
    });
    const message = await messageOf(
      startGroupStageRound(repos, groupCutTournament({ groupsSelfPaced: false })),
    );
    expect(message).toContain("different rounds");
  });

  it("refuses before the groups exist", async () => {
    const { repos } = mockRepos({ players: [], groups: [], roundRows: [] });
    const message = await messageOf(
      startGroupStageRound(repos, groupCutTournament({ groupsSelfPaced: false })),
    );
    expect(message).toContain("not been generated");
  });
});

describe("generateGroupCutRound: the cut gate", () => {
  it("names every unit still playing and writes nothing", async () => {
    const field = fourGroups();
    const { repos, createCut } = mockRepos({
      ...field,
      roundRows: fourGroupStage({
        A: ["first", "first", "open"],
        B: ["open"],
        C: ["first", "open"],
        D: DONE,
      }),
    });
    const message = await messageOf(generateGroupCutRound(repos, groupCutTournament()));
    expect(message).toContain("Still playing: A, B, C.");
    expect(message).not.toContain("D");
    expect(createCut).not.toHaveBeenCalled();
  });

  it("takes the cut once the last unit finishes", async () => {
    const field = fourGroups();
    const { repos, createCut } = mockRepos({
      ...field,
      roundRows: fourGroupStage({ A: DONE, B: DONE, C: DONE, D: DONE }),
    });
    await generateGroupCutRound(repos, groupCutTournament({ cutSize: 8 }));
    expect(createCut).toHaveBeenCalledTimes(1);
  });
});

describe("generateGroupCutRound: seeds and the first cut round", () => {
  function twoGroupField() {
    return {
      groups: [groupRow("A"), groupRow("B")],
      players: [...groupPlayers("A", 4), ...groupPlayers("B", 4)],
      roundRows: groupStageRoundRows([
        { labels: ["A"], rounds: DONE },
        { labels: ["B"], rounds: DONE },
      ]),
    };
  }

  it("writes unique seeds 1..N to the group winners first", async () => {
    const { repos, createCut } = mockRepos(twoGroupField());
    await generateGroupCutRound(repos, groupCutTournament({ cutSize: 4 }));
    const call = createCut.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) {
      return;
    }
    expect(call.roundNumber).toBe(4);
    expect(call.seeds.map((entry) => entry.seed)).toEqual([1, 2, 3, 4]);
    const seedOf = new Map(call.seeds.map((entry) => [entry.participantId, entry.seed]));
    expect(
      call.seeds
        .filter((entry) => entry.seed <= 2)
        .map((entry) => entry.participantId)
        .toSorted(),
    ).toEqual(["a1", "b1"]);
    expect(
      call.seeds
        .filter((entry) => entry.seed > 2)
        .map((entry) => entry.participantId)
        .toSorted(),
    ).toEqual(["a2", "b2"]);
    expect(call.pods.map((pod) => pod.playerIds.map((id) => seedOf.get(id)))).toEqual([
      [1, 4],
      [2, 3],
    ]);
    expect(call.pods.every((pod) => pod.placements === null)).toBe(true);
  });

  it("keeps a dropped group winner out of the qualifiers", async () => {
    const field = twoGroupField();
    const players = field.players.map((player) =>
      player.id === "a1" ? { ...player, status: "dropped" } : player,
    );
    const { repos, createCut } = mockRepos({ ...field, players });
    await generateGroupCutRound(repos, groupCutTournament({ cutSize: 4 }));
    const call = createCut.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) {
      return;
    }
    expect(call.seeds.map((entry) => entry.participantId)).not.toContain("a1");
    expect(call.seeds).toHaveLength(4);
    expect(call.seeds.find((entry) => entry.seed === 1)?.participantId).toBe("b1");
  });

  it("refuses a cut wider than the field", async () => {
    const field = twoGroupField();
    const players = field.players.map((player) =>
      player.id.startsWith("b") ? { ...player, status: "dropped" } : player,
    );
    const { repos, createCut } = mockRepos({ ...field, players });
    const message = await messageOf(
      generateGroupCutRound(repos, groupCutTournament({ cutSize: 8 })),
    );
    expect(message).toContain("needs 8 qualifiers");
    expect(createCut).not.toHaveBeenCalled();
  });
});

describe("generateGroupCutRound: fixed bracket progression", () => {
  const SEEDED = Array.from({ length: 8 }, (_, index) =>
    playerRow(`s${index + 1}`, "A", index % 4, { seed: index + 1 }),
  );

  function cutRound(
    roundNumber: number,
    pods: { podNumber: number; playerIds: [string, string]; outcome: Outcome }[],
  ): PodRoundRows {
    return roundRows(roundNumber, pods, "finalized");
  }

  const QUARTER_FINALS = cutRound(4, [
    { podNumber: 1, playerIds: ["s1", "s8"], outcome: "second" },
    { podNumber: 2, playerIds: ["s4", "s5"], outcome: "first" },
    { podNumber: 3, playerIds: ["s2", "s7"], outcome: "first" },
    { podNumber: 4, playerIds: ["s3", "s6"], outcome: "second" },
  ]);

  it("feeds the winners into the predetermined semi-final pods, higher seed on seat 0", async () => {
    const { repos, createCutRound, createCut, clearSeeds } = mockRepos({
      players: SEEDED,
      roundRows: [QUARTER_FINALS],
    });
    await generateGroupCutRound(repos, groupCutTournament({ cutSize: 8 }));
    expect(createCutRound).toHaveBeenCalledWith("t-1", 5, [
      { podNumber: 1, playerIds: ["s4", "s8"], placements: null },
      { podNumber: 2, playerIds: ["s2", "s6"], placements: null },
    ]);
    expect(createCut).not.toHaveBeenCalled();
    expect(clearSeeds).not.toHaveBeenCalled();
  });

  it("keeps seat 0 on the higher original seed in the final", async () => {
    const semiFinals = cutRound(5, [
      { podNumber: 1, playerIds: ["s4", "s8"], outcome: "second" },
      { podNumber: 2, playerIds: ["s2", "s6"], outcome: "first" },
    ]);
    const { repos, createCutRound } = mockRepos({
      players: SEEDED,
      roundRows: [QUARTER_FINALS, semiFinals],
    });
    await generateGroupCutRound(repos, groupCutTournament({ cutSize: 8 }));
    expect(createCutRound).toHaveBeenCalledWith("t-1", 6, [
      { podNumber: 1, playerIds: ["s2", "s8"], placements: null },
    ]);
  });

  it("advances the opponent of a seed who dropped during the cut", async () => {
    const walkover = cutRound(4, [
      { podNumber: 1, playerIds: ["s1", "s8"], outcome: "walkover" },
      { podNumber: 2, playerIds: ["s4", "s5"], outcome: "first" },
      { podNumber: 3, playerIds: ["s2", "s7"], outcome: "first" },
      { podNumber: 4, playerIds: ["s3", "s6"], outcome: "second" },
    ]);
    const players = SEEDED.map((player) =>
      player.id === "s1" ? { ...player, status: "dropped" } : player,
    );
    const { repos, createCutRound } = mockRepos({ players, roundRows: [walkover] });
    await generateGroupCutRound(repos, groupCutTournament({ cutSize: 8 }));
    expect(createCutRound).toHaveBeenCalledWith("t-1", 5, [
      { podNumber: 1, playerIds: ["s4", "s8"], placements: null },
      { podNumber: 2, playerIds: ["s2", "s6"], placements: null },
    ]);
  });

  it("blocks the next round while a bracket match has no result", async () => {
    const open = cutRound(4, [
      { podNumber: 1, playerIds: ["s1", "s8"], outcome: "open" },
      { podNumber: 2, playerIds: ["s4", "s5"], outcome: "first" },
      { podNumber: 3, playerIds: ["s2", "s7"], outcome: "first" },
      { podNumber: 4, playerIds: ["s3", "s6"], outcome: "second" },
    ]);
    const { repos, createCutRound } = mockRepos({ players: SEEDED, roundRows: [open] });
    const message = await messageOf(
      generateGroupCutRound(repos, groupCutTournament({ cutSize: 8 })),
    );
    expect(message).toContain("needs a result first");
    expect(createCutRound).not.toHaveBeenCalled();
  });

  it("refuses to pair past an unfinalized round", async () => {
    const open = roundRows(4, [
      { podNumber: 1, playerIds: ["s1", "s8"], outcome: "first" },
      { podNumber: 2, playerIds: ["s4", "s5"], outcome: "first" },
    ]);
    const { repos } = mockRepos({ players: SEEDED, roundRows: [open] });
    const message = await messageOf(
      generateGroupCutRound(repos, groupCutTournament({ cutSize: 4 })),
    );
    expect(message).toContain("already open");
  });

  it("refuses to pair past the final", async () => {
    const final = cutRound(6, [{ podNumber: 1, playerIds: ["s2", "s8"], outcome: "second" }]);
    const { repos } = mockRepos({ players: SEEDED, roundRows: [final] });
    const message = await messageOf(
      generateGroupCutRound(repos, groupCutTournament({ cutSize: 8 })),
    );
    expect(message).toContain("final");
  });
});

describe("generateGroupCutRound: group generation and drops", () => {
  it("leaves a player who dropped before generation out of the plan", async () => {
    const roster = Array.from({ length: 18 }, (_, index) =>
      playerRow(`p${index + 1}`, "A", 0, { groupId: null, groupSlot: null }),
    ).map((player, index) => (index < 2 ? { ...player, status: "dropped" } : player));
    const { repos, createGroupStage } = mockRepos({ players: roster, roundRows: [] });
    await generateGroupCutRound(repos, groupCutTournament({ cutSize: 8 }));
    const call = createGroupStage.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) {
      return;
    }
    const assigned = call.groups.flatMap((group) => group.playerIds);
    expect(assigned).toHaveLength(16);
    expect(assigned).not.toContain("p1");
    expect(assigned).not.toContain("p2");
    expect(new Set(assigned).size).toBe(16);
    expect(call.groups.map((group) => group.playerIds.length)).toEqual([4, 4, 4, 4]);
    expect(call.firstRoundPods).toHaveLength(8);
  });

  it("refuses a field that cannot fill groups of four", async () => {
    const roster = Array.from({ length: 17 }, (_, index) =>
      playerRow(`p${index + 1}`, "A", 0, { groupId: null, groupSlot: null }),
    );
    const { repos, createGroupStage } = mockRepos({ players: roster, roundRows: [] });
    const status = await statusOf(generateGroupCutRound(repos, groupCutTournament()));
    expect(status).toBe(400);
    expect(createGroupStage).not.toHaveBeenCalled();
  });
});

describe("reportGroupStageWalkovers", () => {
  it("forfeits every open group match of the dropped player, the cross-group one included", async () => {
    const pending: PendingGroupPod[] = [
      {
        podId: "pod-intra-1",
        members: [
          { playerId: "b1", status: "dropped" },
          { playerId: "b3", status: "active" },
        ],
      },
      {
        podId: "pod-intra-2",
        members: [
          { playerId: "b2", status: "active" },
          { playerId: "b1", status: "dropped" },
        ],
      },
      {
        podId: "pod-cross",
        members: [
          { playerId: "b1", status: "dropped" },
          { playerId: "c1", status: "active" },
        ],
      },
    ];
    const { repos, setWalkoverResult } = mockRepos({ players: [], pendingPods: pending });
    await reportGroupStageWalkovers(repos, groupCutTournament(), "b1");
    expect(setWalkoverResult).toHaveBeenCalledTimes(3);
    expect(setWalkoverResult.mock.calls.map((call) => call[0])).toEqual([
      "pod-intra-1",
      "pod-intra-2",
      "pod-cross",
    ]);
    expect(setWalkoverResult.mock.calls.map((call) => call[1])).toEqual([
      [
        { playerId: "b1", placement: 2 },
        { playerId: "b3", placement: 1 },
      ],
      [
        { playerId: "b2", placement: 1 },
        { playerId: "b1", placement: 2 },
      ],
      [
        { playerId: "b1", placement: 2 },
        { playerId: "c1", placement: 1 },
      ],
    ]);
  });

  it("writes placements only, never a 2:0 scoreline", async () => {
    const pending: PendingGroupPod[] = [
      {
        podId: "pod-1",
        members: [
          { playerId: "a1", status: "dropped" },
          { playerId: "a2", status: "active" },
        ],
      },
    ];
    const { repos, setWalkoverResult } = mockRepos({ players: [], pendingPods: pending });
    await reportGroupStageWalkovers(repos, groupCutTournament(), "a1");
    const results = setWalkoverResult.mock.calls[0]?.[1] ?? [];
    expect(
      results.every((result) => Object.keys(result).toSorted().join(",") === "placement,playerId"),
    ).toBe(true);
  });

  it("draws the walkover between two dropped players", async () => {
    const pending: PendingGroupPod[] = [
      {
        podId: "pod-1",
        members: [
          { playerId: "a1", status: "dropped" },
          { playerId: "a2", status: "dropped" },
        ],
      },
    ];
    const { repos, setWalkoverResult } = mockRepos({ players: [], pendingPods: pending });
    await reportGroupStageWalkovers(repos, groupCutTournament(), "a1");
    expect(setWalkoverResult.mock.calls[0]?.[1]).toEqual([
      { playerId: "a1", placement: 1 },
      { playerId: "a2", placement: 1 },
    ]);
  });

  it("touches nothing when every match of the dropped player was played", async () => {
    const { repos, setWalkoverResult } = mockRepos({ players: [], pendingPods: [] });
    await reportGroupStageWalkovers(repos, groupCutTournament(), "a1");
    expect(setWalkoverResult).not.toHaveBeenCalled();
  });

  it("stays out of a tournament that runs no group stage", async () => {
    const { repos, setWalkoverResult } = mockRepos({ players: [] });
    await reportGroupStageWalkovers(repos, groupCutTournament({ format: "rounds" }), "a1");
    expect(setWalkoverResult).not.toHaveBeenCalled();
  });
});

describe("rerollGroupCutRound", () => {
  const SEEDED = Array.from({ length: 8 }, (_, index) =>
    playerRow(`s${index + 1}`, "A", index % 4, { seed: index + 1 }),
  );

  it("deletes the first cut round and clears the seeds", async () => {
    const cut = roundRows(4, [
      { podNumber: 1, playerIds: ["s1", "s8"], outcome: "open" },
      { podNumber: 2, playerIds: ["s4", "s5"], outcome: "open" },
    ]);
    const { repos, deleteRound, clearSeeds, createCutRound } = mockRepos({
      players: SEEDED,
      roundRows: [cut],
    });
    await rerollGroupCutRound(repos, groupCutTournament({ cutSize: 8 }), 4);
    expect(deleteRound).toHaveBeenCalledWith("r-4", "t-1", 3);
    expect(clearSeeds).toHaveBeenCalledWith("t-1");
    expect(createCutRound).not.toHaveBeenCalled();
  });

  it("refuses once a cut result has been entered", async () => {
    const cut = roundRows(4, [
      { podNumber: 1, playerIds: ["s1", "s8"], outcome: "first" },
      { podNumber: 2, playerIds: ["s4", "s5"], outcome: "open" },
    ]);
    const { repos, deleteRound } = mockRepos({ players: SEEDED, roundRows: [cut] });
    const status = await statusOf(
      rerollGroupCutRound(repos, groupCutTournament({ cutSize: 8 }), 4),
    );
    expect(status).toBe(400);
    expect(deleteRound).not.toHaveBeenCalled();
  });

  it("rebuilds a later cut round from the previous one", async () => {
    const quarters = roundRows(
      4,
      [
        { podNumber: 1, playerIds: ["s1", "s8"], outcome: "second" },
        { podNumber: 2, playerIds: ["s4", "s5"], outcome: "first" },
        { podNumber: 3, playerIds: ["s2", "s7"], outcome: "first" },
        { podNumber: 4, playerIds: ["s3", "s6"], outcome: "second" },
      ],
      "finalized",
    );
    const semis = roundRows(5, [
      { podNumber: 1, playerIds: ["s4", "s8"], outcome: "open" },
      { podNumber: 2, playerIds: ["s2", "s6"], outcome: "open" },
    ]);
    const { repos, loadRounds, deleteRound, createCutRound, clearSeeds } = mockRepos({
      players: SEEDED,
      roundRows: [quarters, semis],
    });
    loadRounds.mockResolvedValueOnce([quarters, semis]).mockResolvedValueOnce([quarters]);
    await rerollGroupCutRound(repos, groupCutTournament({ cutSize: 8 }), 5);
    expect(deleteRound).toHaveBeenCalledWith("r-5", "t-1", 4);
    expect(clearSeeds).not.toHaveBeenCalled();
    expect(createCutRound).toHaveBeenCalledWith("t-1", 5, [
      { podNumber: 1, playerIds: ["s4", "s8"], placements: null },
      { podNumber: 2, playerIds: ["s2", "s6"], placements: null },
    ]);
  });

  it("re-shuffles the groups while round 1 is untouched", async () => {
    const roster = Array.from({ length: 8 }, (_, index) =>
      playerRow(`p${index + 1}`, "A", index % 4),
    );
    const rows = groupStageRoundRows([
      { labels: ["A"], rounds: ["open"] },
      { labels: ["B"], rounds: ["open"] },
    ]);
    const { repos, deleteGroupStage, createGroupStage } = mockRepos({
      players: roster,
      roundRows: rows,
    });
    await rerollGroupCutRound(repos, groupCutTournament(), 1);
    expect(deleteGroupStage).toHaveBeenCalledWith("t-1");
    expect(createGroupStage).toHaveBeenCalledTimes(1);
  });

  it("refuses to re-shuffle once a group match has a result", async () => {
    const roster = Array.from({ length: 8 }, (_, index) =>
      playerRow(`p${index + 1}`, "A", index % 4),
    );
    const rows = groupStageRoundRows([
      { labels: ["A"], rounds: ["first"] },
      { labels: ["B"], rounds: ["open"] },
    ]);
    const { repos, deleteGroupStage } = mockRepos({ players: roster, roundRows: rows });
    const message = await messageOf(rerollGroupCutRound(repos, groupCutTournament(), 1));
    expect(message).toContain("before a group match has a result");
    expect(deleteGroupStage).not.toHaveBeenCalled();
  });

  it("refuses to re-roll a fixed group round", async () => {
    const roster = Array.from({ length: 8 }, (_, index) =>
      playerRow(`p${index + 1}`, "A", index % 4),
    );
    const rows = groupStageRoundRows([
      { labels: ["A"], rounds: ["first", "open"] },
      { labels: ["B"], rounds: ["first", "open"] },
    ]);
    const { repos } = mockRepos({ players: roster, roundRows: rows });
    const message = await messageOf(rerollGroupCutRound(repos, groupCutTournament(), 2));
    expect(message).toContain("fixed schedule");
  });
});
