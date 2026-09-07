import type { TeamSnapshotPlayer } from "@openrift/shared";
import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type { Tournament } from "../repositories/tournaments.js";
import { pairNextRound, submitPodPlayerResult, submitPodResult } from "./pod-pairing.js";

const TOURNAMENT = {
  id: "pod-1",
  pairingStyle: "pod",
  playMode: "1v1",
  scoringScheme: "standard",
  byePoints: 3,
  winPoints: 3,
  drawPoints: 1,
  matchFormat: "bo1",
  regionsEnabled: false,
  currentRound: 0,
  status: "setup",
} as unknown as Tournament;

const SWISS_TOURNAMENT = { ...TOURNAMENT, pairingStyle: "swiss" } as Tournament;
const TEAM_TOURNAMENT = {
  ...TOURNAMENT,
  pairingStyle: "swiss",
  playMode: "2v2",
} as Tournament;

function player(id: string, overrides: Partial<TeamSnapshotPlayer> = {}): TeamSnapshotPlayer {
  return {
    id,
    teamId: null,
    score: 0,
    pods3: 0,
    pods4: 0,
    byes: 0,
    opponents: new Map(),
    ...overrides,
  };
}

function reposFor(createRound: () => Promise<unknown>): Repos {
  return {
    podTournaments: {
      findOpenRound: vi.fn(async () => undefined),
      loadPairingSnapshot: vi.fn(async () => []),
      createRound: vi.fn(createRound),
    },
    tournaments: {
      updateSettings: vi.fn(async () => undefined),
    },
  } as unknown as Repos;
}

function reposWithSnapshot(players: TeamSnapshotPlayer[]) {
  const createRound = vi.fn(
    async (..._args: Parameters<Repos["podTournaments"]["createRound"]>) => ({
      id: "round-1",
      roundNumber: 1,
    }),
  );
  const repos = {
    podTournaments: {
      findOpenRound: vi.fn(async () => undefined),
      loadPairingSnapshot: vi.fn(async () => players),
      createRound,
    },
    tournaments: {
      updateSettings: vi.fn(async () => undefined),
    },
  } as unknown as Repos;
  return { repos, createRound };
}

describe("pairNextRound round-number race", () => {
  it("maps a unique violation on createRound to a 409, not a raw 500", async () => {
    const repos = reposFor(async () => {
      throw Object.assign(new Error("duplicate key"), {
        code: "23505",
        constraint_name: "uq_pod_rounds_number",
      });
    });
    const result = await pairNextRound(repos, TOURNAMENT).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(AppError);
    expect((result as AppError).status).toBe(409);
  });

  it("re-throws a unique violation from a different constraint (not the round race)", async () => {
    const boom = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint_name: "some_other_unique",
    });
    const repos = reposFor(async () => {
      throw boom;
    });
    await expect(pairNextRound(repos, TOURNAMENT)).rejects.toBe(boom);
  });

  it("re-throws a non-unique createRound error", async () => {
    const boom = new Error("connection reset");
    const repos = reposFor(async () => {
      throw boom;
    });
    await expect(pairNextRound(repos, TOURNAMENT)).rejects.toBe(boom);
  });

  it("returns the created round on the happy path", async () => {
    const round = { id: "round-1", roundNumber: 1 };
    const repos = reposFor(async () => round);
    await expect(pairNextRound(repos, TOURNAMENT)).resolves.toBe(round);
  });
});

describe("pairNextRound swiss auto-bye", () => {
  it("auto-byes the player with fewest byes, then lowest score, on an odd field", async () => {
    const players = [
      player("a", { score: 9 }),
      player("b", { score: 0, byes: 1 }),
      player("c", { score: 3 }),
      player("d", { score: 6 }),
      player("e", { score: 3 }),
    ];
    const { repos, createRound } = reposWithSnapshot(players);
    await pairNextRound(repos, SWISS_TOURNAMENT);
    expect(createRound).toHaveBeenCalledTimes(1);
    const call = createRound.mock.calls[0]!;
    const [pairing, byes] = [call[2], call[3]];
    expect(byes).toEqual(["c"]);
    expect(pairing.pods).toHaveLength(2);
    expect(pairing.pods.every((pod: { size: number }) => pod.size === 2)).toBe(true);
  });

  it("does not auto-bye when organizer byes make the field even", async () => {
    const players = [player("a"), player("b"), player("c"), player("d"), player("e")];
    const { repos, createRound } = reposWithSnapshot(players);
    await pairNextRound(repos, SWISS_TOURNAMENT, ["e"]);
    const call = createRound.mock.calls[0]!;
    const [pairing, byes] = [call[2], call[3]];
    expect(byes).toEqual(["e"]);
    expect(pairing.pods).toHaveLength(2);
  });

  it("auto-byes on top of organizer byes when the remainder is odd", async () => {
    const players = [player("a"), player("b"), player("c"), player("d")];
    const { repos, createRound } = reposWithSnapshot(players);
    await pairNextRound(repos, SWISS_TOURNAMENT, ["d"]);
    const call = createRound.mock.calls[0]!;
    const [pairing, byes] = [call[2], call[3]];
    expect(byes).toHaveLength(2);
    expect(byes![0]).toBe("d");
    expect(pairing.pods).toHaveLength(1);
  });

  it("turns a single seated player into a bye-only round", async () => {
    const players = [player("only")];
    const { repos, createRound } = reposWithSnapshot(players);
    await pairNextRound(repos, SWISS_TOURNAMENT);
    const call = createRound.mock.calls[0]!;
    const [pairing, byes] = [call[2], call[3]];
    expect(byes).toEqual(["only"]);
    expect(pairing.pods).toHaveLength(0);
  });

  it("never auto-byes a pod-style tournament", async () => {
    const players = [player("a"), player("b"), player("c"), player("d"), player("e")];
    const { repos } = reposWithSnapshot(players);
    await expect(pairNextRound(repos, TOURNAMENT)).rejects.toMatchObject({ status: 400 });
  });
});

describe("pairNextRound region guard", () => {
  const REGION_TOURNAMENT = { ...SWISS_TOURNAMENT, regionsEnabled: true } as Tournament;

  it("rejects pairing while a seated player has no region", async () => {
    const players = [player("a", { region: "noxus" }), player("b", { region: null })];
    const { repos, createRound } = reposWithSnapshot(players);
    const result = await pairNextRound(repos, REGION_TOURNAMENT).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(AppError);
    expect((result as AppError).status).toBe(400);
    expect((result as AppError).message).toContain("region");
    expect(createRound).not.toHaveBeenCalled();
  });

  it("counts every region-less seated player in the message", async () => {
    const players = [
      player("a", { region: "noxus" }),
      player("b", { region: null }),
      player("c"),
      player("d", { region: "ionia" }),
    ];
    const { repos } = reposWithSnapshot(players);
    await expect(pairNextRound(repos, REGION_TOURNAMENT)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("2 players"),
    });
  });

  it("allows pairing when the region-less players are byed", async () => {
    const players = [
      player("a", { region: "noxus" }),
      player("b", { region: "demacia" }),
      player("c", { region: null }),
    ];
    const { repos, createRound } = reposWithSnapshot(players);
    await pairNextRound(repos, REGION_TOURNAMENT, ["c"]);
    expect(createRound).toHaveBeenCalledTimes(1);
  });

  it("ignores missing regions when the feature is off", async () => {
    const players = [player("a"), player("b")];
    const { repos, createRound } = reposWithSnapshot(players);
    await pairNextRound(repos, SWISS_TOURNAMENT);
    expect(createRound).toHaveBeenCalledTimes(1);
  });
});

describe("pairNextRound 2v2 team pairing", () => {
  const team = (teamId: string, ids: [string, string], overrides = {}) =>
    ids.map((id) => player(id, { teamId, ...overrides }));

  it("pairs teams into size-4 pods with each side's members adjacent", async () => {
    const players = [...team("A", ["a1", "a2"]), ...team("B", ["b1", "b2"])];
    const { repos, createRound } = reposWithSnapshot(players);
    await pairNextRound(repos, TEAM_TOURNAMENT);
    const call = createRound.mock.calls[0]!;
    const [pairing, byes] = [call[2], call[3]];
    expect(byes).toEqual([]);
    expect(pairing.pods).toHaveLength(1);
    expect(pairing.pods[0]!.size).toBe(4);
    const seated = pairing.pods[0]!.playerIds as string[];
    expect(seated.toSorted()).toEqual(["a1", "a2", "b1", "b2"]);
    const firstSide = new Set(seated.slice(0, 2));
    expect(firstSide.has("a1") === firstSide.has("a2")).toBe(true);
  });

  it("rejects pairing while a seated player has no team", async () => {
    const players = [...team("A", ["a1", "a2"]), player("lonely")];
    const { repos, createRound } = reposWithSnapshot(players);
    await expect(pairNextRound(repos, TEAM_TOURNAMENT)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("not on a team"),
    });
    expect(createRound).not.toHaveBeenCalled();
  });

  it("allows an unteamed player to be byed instead of blocking", async () => {
    const players = [...team("A", ["a1", "a2"]), ...team("B", ["b1", "b2"]), player("lonely")];
    const { repos, createRound } = reposWithSnapshot(players);
    await pairNextRound(repos, TEAM_TOURNAMENT, ["lonely"]);
    expect(createRound).toHaveBeenCalledTimes(1);
    const call = createRound.mock.calls[0]!;
    expect(call[3]).toEqual(["lonely"]);
  });

  it("rejects a bye that names only one member of a team", async () => {
    const players = [...team("A", ["a1", "a2"]), ...team("B", ["b1", "b2"])];
    const { repos } = reposWithSnapshot(players);
    await expect(pairNextRound(repos, TEAM_TOURNAMENT, ["a1"])).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("whole team"),
    });
  });

  it("rejects pairing while a team is missing its partner", async () => {
    const players = [...team("A", ["a1", "a2"]), player("half", { teamId: "H" })];
    const { repos } = reposWithSnapshot(players);
    await expect(pairNextRound(repos, TEAM_TOURNAMENT)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("missing its partner"),
    });
  });

  it("auto-byes a whole team (fewest byes, lowest score) on an odd team count", async () => {
    const players = [
      ...team("A", ["a1", "a2"], { score: 6 }),
      ...team("B", ["b1", "b2"], { score: 3 }),
      ...team("C", ["c1", "c2"], { score: 0 }),
    ];
    const { repos, createRound } = reposWithSnapshot(players);
    await pairNextRound(repos, TEAM_TOURNAMENT);
    const call = createRound.mock.calls[0]!;
    const [pairing, byes] = [call[2], call[3]];
    expect((byes as string[]).toSorted()).toEqual(["c1", "c2"]);
    expect(pairing.pods).toHaveLength(1);
  });
});

describe("submitPodResult 2v2 team results", () => {
  function reposWithPod(playMode: "1v1" | "2v2") {
    const setPodResult = vi.fn(
      async (..._args: Parameters<Repos["podTournaments"]["setPodResult"]>) => undefined,
    );
    const repos = {
      podTournaments: {
        findPodForResult: vi.fn(async () => ({
          pod: { id: "pod-x", size: 4 },
          round: { status: "reporting" },
          tournament: { ...TEAM_TOURNAMENT, playMode },
          memberPlayerIds: ["a1", "a2", "b1", "b2"],
          teamByPlayer: new Map([
            ["a1", "A"],
            ["a2", "A"],
            ["b1", "B"],
            ["b2", "B"],
          ]),
        })),
        setPodResult,
      },
    } as unknown as Repos;
    return { repos, setPodResult };
  }

  it("accepts a team result (teammates sharing points) and derives team placements", async () => {
    const { repos, setPodResult } = reposWithPod("2v2");
    await submitPodResult(
      repos,
      TEAM_TOURNAMENT.id,
      "pod-x",
      [
        { playerId: "a1", gamePoints: 2 },
        { playerId: "a2", gamePoints: 2 },
        { playerId: "b1", gamePoints: 1 },
        { playerId: "b2", gamePoints: 1 },
      ],
      { allowFinalized: false },
    );
    expect(setPodResult).toHaveBeenCalledTimes(1);
    const results = setPodResult.mock.calls[0]![1] as {
      playerId: string;
      placement: number;
    }[];
    const placementOf = (id: string) => results.find((row) => row.playerId === id)?.placement;
    expect(placementOf("a1")).toBe(1);
    expect(placementOf("a2")).toBe(1);
    expect(placementOf("b1")).toBe(3);
    expect(placementOf("b2")).toBe(3);
  });

  it("rejects teammates with mismatched game points", async () => {
    const { repos, setPodResult } = reposWithPod("2v2");
    await expect(
      submitPodResult(
        repos,
        TEAM_TOURNAMENT.id,
        "pod-x",
        [
          { playerId: "a1", gamePoints: 2 },
          { playerId: "a2", gamePoints: 1 },
          { playerId: "b1", gamePoints: 1 },
          { playerId: "b2", gamePoints: 1 },
        ],
        { allowFinalized: false },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("Teammates"),
    });
    expect(setPodResult).not.toHaveBeenCalled();
  });

  it("leaves 1v1 results unvalidated for team equality", async () => {
    const { repos, setPodResult } = reposWithPod("1v1");
    await submitPodResult(
      repos,
      TEAM_TOURNAMENT.id,
      "pod-x",
      [
        { playerId: "a1", gamePoints: 8 },
        { playerId: "a2", gamePoints: 5 },
        { playerId: "b1", gamePoints: 5 },
        { playerId: "b2", gamePoints: 2 },
      ],
      { allowFinalized: false },
    );
    expect(setPodResult).toHaveBeenCalledTimes(1);
  });
});

describe("submitPodPlayerResult 2v2 self-reporting", () => {
  function reposWithPod(playMode: "1v1" | "2v2") {
    const setMemberGamePoints = vi.fn(async () => undefined);
    const repos = {
      podTournaments: {
        findPodForResult: vi.fn(async () => ({
          pod: { id: "pod-x", size: 4 },
          round: { status: "reporting" },
          tournament: { ...TEAM_TOURNAMENT, playMode },
          memberPlayerIds: ["a1", "a2", "b1", "b2"],
          teamByPlayer: new Map([
            ["a1", "A"],
            ["a2", "A"],
            ["b1", "B"],
            ["b2", "B"],
          ]),
        })),
        setMemberGamePoints,
      },
    } as unknown as Repos;
    return { repos, setMemberGamePoints };
  }

  it("mirrors a member's report onto their teammate", async () => {
    const { repos, setMemberGamePoints } = reposWithPod("2v2");
    await submitPodPlayerResult(repos, TEAM_TOURNAMENT.id, "pod-x", "b1", 2);
    expect(setMemberGamePoints).toHaveBeenCalledWith("pod-x", ["b1", "b2"], 2);
  });

  it("writes only the reporter's own row in 1v1", async () => {
    const { repos, setMemberGamePoints } = reposWithPod("1v1");
    await submitPodPlayerResult(repos, TEAM_TOURNAMENT.id, "pod-x", "b1", 2);
    expect(setMemberGamePoints).toHaveBeenCalledWith("pod-x", ["b1"], 2);
  });
});
