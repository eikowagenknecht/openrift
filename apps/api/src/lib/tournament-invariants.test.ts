import { ERROR_CODES } from "@openrift/shared";
import type { TournamentPairingStyle, TournamentStatus } from "@openrift/shared";
import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type { Tournament } from "../repositories/tournaments.js";
import {
  assertDateOrder,
  assertParticipantsOpen,
  assertPlayModeCompatible,
  assertStatusTransition,
  assertValidRegion,
} from "./tournament-invariants.js";

const STATUSES: TournamentStatus[] = ["setup", "running", "completed", "cancelled"];

/**
 * The forward-only lifecycle, spelled out independently of the module's own
 * table so a change to that table has to be made here too rather than sailing
 * through a self-referential sweep.
 */
const PERMITTED: Record<TournamentStatus, TournamentStatus[]> = {
  setup: ["setup", "running", "completed", "cancelled"],
  running: ["running", "completed", "cancelled"],
  completed: ["completed", "cancelled"],
  cancelled: ["cancelled"],
};

/**
 * Runs the assertion and returns the AppError it threw, failing the test when
 * it returned normally.
 * @returns The thrown AppError.
 */
function thrown(run: () => unknown): AppError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }
  throw new Error("expected the invariant to throw");
}

const START = new Date("2026-06-01T12:00:00Z");

describe("assertDateOrder", () => {
  it("accepts an open-ended schedule", () => {
    expect(() => assertDateOrder(START, null, null)).not.toThrow();
  });

  it("accepts an end instant at or after the start", () => {
    expect(() => assertDateOrder(START, START, null)).not.toThrow();
    expect(() => assertDateOrder(START, new Date("2026-06-02T12:00:00Z"), null)).not.toThrow();
  });

  it("rejects an end instant before the start", () => {
    const error = thrown(() => assertDateOrder(START, new Date("2026-05-30T12:00:00Z"), null));
    expect(error.status).toBe(422);
    expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(error.message).toContain("end time");
  });

  it("accepts submissions closing at or before the end", () => {
    const end = new Date("2026-06-02T12:00:00Z");
    expect(() => assertDateOrder(START, end, end)).not.toThrow();
    expect(() => assertDateOrder(START, end, START)).not.toThrow();
  });

  it("rejects submissions closing after the end", () => {
    const error = thrown(() =>
      assertDateOrder(START, new Date("2026-06-02T12:00:00Z"), new Date("2026-06-03T12:00:00Z")),
    );
    expect(error.status).toBe(422);
    expect(error.message).toContain("Submissions must close");
  });

  it("leaves a close instant unconstrained when the tournament has no end", () => {
    // Deliberate: with no end instant there is nothing to close before, so a
    // late close is a valid open-ended schedule rather than an error.
    expect(() => assertDateOrder(START, null, new Date("2027-01-01T00:00:00Z"))).not.toThrow();
  });
});

describe("assertPlayModeCompatible", () => {
  it("constrains nothing in 1v1", () => {
    expect(() => assertPlayModeCompatible("1v1", "pod", true)).not.toThrow();
  });

  it("accepts the play modes 2v2 composes with", () => {
    const styles: TournamentPairingStyle[] = ["none", "swiss"];
    for (const style of styles) {
      expect(() => assertPlayModeCompatible("2v2", style, false)).not.toThrow();
    }
  });

  it("rejects 2v2 with pod pairing", () => {
    const error = thrown(() => assertPlayModeCompatible("2v2", "pod", false));
    expect(error.status).toBe(422);
    expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(error.message).toContain("free-for-all pods");
  });

  it("rejects 2v2 with regions", () => {
    const error = thrown(() => assertPlayModeCompatible("2v2", "swiss", true));
    expect(error.status).toBe(422);
    expect(error.message).toContain("Regions aren't");
  });

  it("reports the pairing conflict first when both are wrong", () => {
    const error = thrown(() => assertPlayModeCompatible("2v2", "pod", true));
    expect(error.message).toContain("free-for-all pods");
  });
});

describe("assertStatusTransition", () => {
  it("is a no-op when the patch omits the status", () => {
    for (const status of STATUSES) {
      expect(() => assertStatusTransition(status, undefined)).not.toThrow();
    }
  });

  it("allows every state to restate itself", () => {
    for (const status of STATUSES) {
      expect(() => assertStatusTransition(status, status)).not.toThrow();
    }
  });

  it("matches the lifecycle matrix in both directions", () => {
    // The full 4x4: every pair is either permitted by the matrix or a 409.
    for (const current of STATUSES) {
      for (const next of STATUSES) {
        const allowed = PERMITTED[current].includes(next);
        if (allowed) {
          expect(() => assertStatusTransition(current, next)).not.toThrow();
        } else {
          const error = thrown(() => assertStatusTransition(current, next));
          expect(error.status).toBe(409);
          expect(error.code).toBe(ERROR_CODES.CONFLICT);
          expect(error.message).toBe(`A ${current} tournament can't move to ${next}`);
        }
      }
    }
  });

  it("moves forward only, and treats cancelled as terminal", () => {
    // Spot-checks of the matrix's intent, so a careless edit to the table
    // fails here and not only in the generated sweep above.
    expect(() => assertStatusTransition("setup", "completed")).not.toThrow();
    expect(() => assertStatusTransition("completed", "cancelled")).not.toThrow();
    expect(() => assertStatusTransition("running", "setup")).toThrow();
    expect(() => assertStatusTransition("cancelled", "running")).toThrow();
  });
});

describe("assertParticipantsOpen", () => {
  /** @returns A minimal tournament row carrying just the status. */
  function rowWith(status: TournamentStatus): Tournament {
    return { status } as unknown as Tournament;
  }

  it("stays open while the tournament is set up or running", () => {
    expect(() => assertParticipantsOpen(rowWith("setup"))).not.toThrow();
    expect(() => assertParticipantsOpen(rowWith("running"))).not.toThrow();
  });

  it("closes once the tournament is completed or cancelled", () => {
    for (const status of ["completed", "cancelled"] as const) {
      const error = thrown(() => assertParticipantsOpen(rowWith(status)));
      expect(error.status).toBe(409);
      expect(error.code).toBe(ERROR_CODES.CONFLICT);
    }
  });
});

describe("assertValidRegion", () => {
  /** @returns Repos whose custom-tag lookup returns the given tags. */
  function reposWith(tags: { slug: string; category: string }[]): Repos {
    return {
      customTags: { listBySlugs: vi.fn(() => Promise.resolve(tags)) },
    } as unknown as Repos;
  }

  it("accepts an unset or cleared region without a lookup", async () => {
    const repos = reposWith([]);
    await expect(assertValidRegion(repos, undefined)).resolves.toBeUndefined();
    await expect(assertValidRegion(repos, null)).resolves.toBeUndefined();
    expect(repos.customTags.listBySlugs).not.toHaveBeenCalled();
  });

  it("accepts a slug from the region category", async () => {
    const repos = reposWith([{ slug: "demacia", category: "region" }]);
    await expect(assertValidRegion(repos, "demacia")).resolves.toBeUndefined();
  });

  it("rejects an unknown slug", async () => {
    await expect(assertValidRegion(reposWith([]), "atlantis")).rejects.toMatchObject({
      status: 400,
      code: ERROR_CODES.BAD_REQUEST,
    });
  });

  it("rejects a tag from another category", async () => {
    const repos = reposWith([{ slug: "foil", category: "treatment" }]);
    await expect(assertValidRegion(repos, "foil")).rejects.toMatchObject({ status: 400 });
  });
});
