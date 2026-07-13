import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type { PodTournament } from "../repositories/pod-tournaments.js";
import { pairNextRound } from "./pod-pairing.js";

const TOURNAMENT = {
  id: "pod-1",
  scoringScheme: "standard",
  byePoints: 3,
  currentRound: 0,
  status: "setup",
} as unknown as PodTournament;

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
