import type { PairingPlayer } from "@openrift/shared";
import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type { PodTournament } from "../repositories/pod-tournaments.js";
import { pairNextRound } from "./pod-pairing.js";

const TOURNAMENT = {
  id: "pod-1",
  pairingStyle: "pod",
  scoringScheme: "standard",
  byePoints: 3,
  winPoints: 3,
  drawPoints: 1,
  matchFormat: "bo1",
  regionsEnabled: false,
  currentRound: 0,
  status: "setup",
} as unknown as PodTournament;

const SWISS_TOURNAMENT = { ...TOURNAMENT, pairingStyle: "swiss" } as PodTournament;

function player(id: string, overrides: Partial<PairingPlayer> = {}): PairingPlayer {
  return { id, score: 0, pods3: 0, pods4: 0, byes: 0, opponents: new Map(), ...overrides };
}

/**
 * Builds a repos stub for `pairNextRound` with an all-bye (empty) snapshot so
 * the pairing engine is skipped and only the createRound outcome matters.
 * @returns The repos stub.
 */
function reposFor(createRound: () => Promise<unknown>): Repos {
  return {
    podTournaments: {
      findOpenRound: vi.fn(async () => undefined),
      loadPairingSnapshot: vi.fn(async () => []),
      createRound: vi.fn(createRound),
      update: vi.fn(async () => undefined),
    },
  } as unknown as Repos;
}

/**
 * Builds a repos stub whose snapshot returns the given players and whose
 * createRound records its arguments for assertions.
 * @returns The repos stub plus the createRound mock.
 */
function reposWithSnapshot(players: PairingPlayer[]) {
  const createRound = vi.fn(async () => ({ id: "round-1", roundNumber: 1 }));
  const repos = {
    podTournaments: {
      findOpenRound: vi.fn(async () => undefined),
      loadPairingSnapshot: vi.fn(async () => players),
      createRound,
      update: vi.fn(async () => undefined),
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
    // A 23505 from some other index inside createRound is a real bug, not a
    // pairing collision, so it must not be masked as "round already open".
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
    // "c" has 0 byes and the lowest score among the bye-less (c/e tie at 3; id breaks it).
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
    expect(byes[0]).toBe("d");
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
    // 5 players are unrepresentable in pods; without organizer byes this must
    // stay a 400, not silently sit someone out.
    await expect(pairNextRound(repos, TOURNAMENT)).rejects.toMatchObject({ status: 400 });
  });
});

describe("pairNextRound region guard", () => {
  const REGION_TOURNAMENT = { ...SWISS_TOURNAMENT, regionsEnabled: true } as PodTournament;

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
