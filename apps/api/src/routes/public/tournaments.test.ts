import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../../deps.js";
import { participantDisplayName, resolveSelfJoin } from "./tournaments.js";

const USER = { id: "user-1", name: "Ashe", email: "ashe@example.com" };
const TOURNAMENT_ID = "tournament-1";

/**
 * Builds a minimal repos stub over the two participant methods
 * `resolveSelfJoin` calls.
 * @returns The repos stub plus references to its two mocks.
 */
function reposStub(overrides: {
  findByUser: (...args: unknown[]) => Promise<unknown>;
  createParticipant: (...args: unknown[]) => Promise<unknown>;
}) {
  const findParticipantByUser = vi.fn(overrides.findByUser);
  const createParticipant = vi.fn(overrides.createParticipant);
  const repos = { tournaments: { findParticipantByUser, createParticipant } } as unknown as Repos;
  return { repos, findParticipantByUser, createParticipant };
}

describe("participantDisplayName", () => {
  it("uses the account name when present", () => {
    expect(participantDisplayName("Rift Walker", "someone@example.com")).toBe("Rift Walker");
  });

  it("never exposes the raw email: falls back to the local part", () => {
    expect(participantDisplayName(null, "someone@example.com")).toBe("someone");
    expect(participantDisplayName(undefined, "someone@example.com")).toBe("someone");
  });

  it("treats a blank name as missing", () => {
    expect(participantDisplayName("   ", "someone@example.com")).toBe("someone");
    expect(participantDisplayName("", "someone@example.com")).toBe("someone");
  });

  it("falls back to a generic name for a degenerate email", () => {
    expect(participantDisplayName(null, "@example.com")).toBe("Player");
  });
});

describe("resolveSelfJoin", () => {
  it("returns the existing spot without inserting", async () => {
    const { repos, createParticipant } = reposStub({
      findByUser: async () => ({ id: "p-existing", status: "approved" }),
      createParticipant: async () => ({ id: "p-new", status: "requested" }),
    });
    const result = await resolveSelfJoin(repos, TOURNAMENT_ID, USER);
    expect(result).toEqual({
      participantId: "p-existing",
      status: "approved",
      alreadyJoined: true,
    });
    expect(createParticipant).not.toHaveBeenCalled();
  });

  it("creates a requested participant when none exists", async () => {
    const { repos } = reposStub({
      findByUser: async () => undefined,
      createParticipant: async () => ({ id: "p-new", status: "requested" }),
    });
    const result = await resolveSelfJoin(repos, TOURNAMENT_ID, USER);
    expect(result).toEqual({ participantId: "p-new", status: "requested", alreadyJoined: false });
  });

  it("resolves to the race winner when the insert hits a unique violation", async () => {
    // First lookup misses (no spot yet), the insert loses the race with a 23505,
    // and the re-read finds the concurrently-created row.
    const findByUser = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "p-race", status: "requested" });
    const repos = {
      tournaments: {
        findParticipantByUser: findByUser,
        createParticipant: vi.fn(async () => {
          throw Object.assign(new Error("duplicate key"), { code: "23505" });
        }),
      },
    } as unknown as Repos;
    const result = await resolveSelfJoin(repos, TOURNAMENT_ID, USER);
    expect(result).toEqual({ participantId: "p-race", status: "requested", alreadyJoined: true });
  });

  it("re-throws a non-unique insert error", async () => {
    const boom = new Error("connection reset");
    const { repos } = reposStub({
      findByUser: async () => undefined,
      createParticipant: async () => {
        throw boom;
      },
    });
    await expect(resolveSelfJoin(repos, TOURNAMENT_ID, USER)).rejects.toBe(boom);
  });
});
