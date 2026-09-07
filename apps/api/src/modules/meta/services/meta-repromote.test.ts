import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos } from "../../../deps.js";
import { createMetaPromoteContext, promoteMetaEvent } from "./meta-promote.js";
import { repromoteMetaEvents } from "./meta-repromote.js";

vi.mock("./meta-promote.js", () => ({
  promoteMetaEvent: vi.fn(),
  createMetaPromoteContext: vi.fn(() => Promise.resolve({ cardIndex: {} })),
}));

function promoted(metaEventId: string, errors: string[] = []) {
  return {
    metaEventId,
    players: 0,
    removedPlayers: 0,
    decks: 0,
    matches: 0,
    phases: 0,
    unresolvedNames: [],
    mergedLines: [],
    errors,
  };
}

function fakeRepos(eventIds: string[] = []): Repos {
  return {
    meta: {
      allEventTiers: () => Promise.resolve(eventIds.map((id) => ({ id, tier: "local" }))),
    },
  } as unknown as Repos;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("repromoteMetaEvents", () => {
  it("promotes every archived event", async () => {
    vi.mocked(promoteMetaEvent).mockImplementation((_repos, id) => Promise.resolve(promoted(id)));

    const result = await repromoteMetaEvents(fakeRepos(["ev-1", "ev-2"]));

    expect(result).toEqual({ events: 2, failed: 0, errors: [] });
  });

  it("builds the shared rule context once for the whole pass", async () => {
    vi.mocked(promoteMetaEvent).mockImplementation((_repos, id) => Promise.resolve(promoted(id)));

    await repromoteMetaEvents(fakeRepos(["ev-1", "ev-2", "ev-3"]));

    expect(vi.mocked(createMetaPromoteContext)).toHaveBeenCalledTimes(1);
    const context = await vi.mocked(createMetaPromoteContext).mock.results[0]?.value;
    for (const call of vi.mocked(promoteMetaEvent).mock.calls) {
      expect(call[2]).toBe(context);
    }
  });

  it("keeps going after one event throws, and records it as failed", async () => {
    vi.mocked(promoteMetaEvent).mockImplementation((_repos, id) =>
      id === "ev-2"
        ? Promise.reject(new Error("mirror row is half written"))
        : Promise.resolve(promoted(id)),
    );

    const result = await repromoteMetaEvents(fakeRepos(["ev-1", "ev-2", "ev-3"]));

    expect(vi.mocked(promoteMetaEvent)).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ events: 3, failed: 1 });
    expect(result.errors[0]).toContain("mirror row is half written");
  });

  it("counts an event that reported a problem without throwing", async () => {
    vi.mocked(promoteMetaEvent).mockImplementation((_repos, id) =>
      Promise.resolve(promoted(id, id === "ev-1" ? ["No mapping for that format."] : [])),
    );

    const result = await repromoteMetaEvents(fakeRepos(["ev-1", "ev-2"]));

    expect(result).toEqual({
      events: 2,
      failed: 1,
      errors: ["No mapping for that format."],
    });
  });

  it("touches nothing, context included, for an empty archive", async () => {
    const result = await repromoteMetaEvents(fakeRepos([]));

    expect(result).toEqual({ events: 0, failed: 0, errors: [] });
    expect(vi.mocked(createMetaPromoteContext)).not.toHaveBeenCalled();
    expect(vi.mocked(promoteMetaEvent)).not.toHaveBeenCalled();
  });
});
