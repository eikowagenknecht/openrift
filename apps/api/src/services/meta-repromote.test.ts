import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { promoteMetaEvent } from "./meta-promote.js";
import { repromoteMetaEvents } from "./meta-repromote.js";

vi.mock("./meta-promote.js", () => ({ promoteMetaEvent: vi.fn() }));

function promoted(metaEventId: string, errors: string[] = []) {
  return { metaEventId, players: 0, decks: 0, matches: 0, phases: 0, unresolvedNames: [], errors };
}

function fakeRepos(options: {
  eventIds?: string[];
  externalIds?: string[];
  sources?: { metaEventId: string }[];
}): Repos {
  return {
    meta: {
      allEvents: () => Promise.resolve((options.eventIds ?? []).map((id) => ({ id }))),
      sourcesByKeys: () => Promise.resolve(options.sources ?? []),
    },
    uvsgamesEvents: {
      externalIdsForTemplate: () => Promise.resolve(options.externalIds ?? []),
    },
  } as unknown as Repos;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("repromoteMetaEvents", () => {
  it("promotes every archived event when no template scopes the pass", async () => {
    vi.mocked(promoteMetaEvent).mockImplementation((_repos, id) => Promise.resolve(promoted(id)));

    const result = await repromoteMetaEvents(fakeRepos({ eventIds: ["ev-1", "ev-2"] }));

    expect(result).toEqual({ events: 2, failed: 0, errors: [] });
  });

  it("keeps going after one event throws, and records it as failed", async () => {
    vi.mocked(promoteMetaEvent).mockImplementation((_repos, id) =>
      id === "ev-2"
        ? Promise.reject(new Error("mirror row is half written"))
        : Promise.resolve(promoted(id)),
    );

    const result = await repromoteMetaEvents(fakeRepos({ eventIds: ["ev-1", "ev-2", "ev-3"] }));

    // One hard failure used to abort the batch, leaving every later event
    // unpromoted with nothing recorded about why.
    expect(vi.mocked(promoteMetaEvent)).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ events: 3, failed: 1 });
    expect(result.errors[0]).toContain("mirror row is half written");
  });

  it("counts an event that reported a problem without throwing", async () => {
    vi.mocked(promoteMetaEvent).mockImplementation((_repos, id) =>
      Promise.resolve(promoted(id, id === "ev-1" ? ["No mapping for that format."] : [])),
    );

    const result = await repromoteMetaEvents(fakeRepos({ eventIds: ["ev-1", "ev-2"] }));

    expect(result).toEqual({
      events: 2,
      failed: 1,
      errors: ["No mapping for that format."],
    });
  });

  it("resolves a template's events through one batched citation lookup", async () => {
    vi.mocked(promoteMetaEvent).mockImplementation((_repos, id) => Promise.resolve(promoted(id)));
    const repos = fakeRepos({
      externalIds: ["evt-1", "evt-2", "evt-3"],
      // Two keys citing one event: the pass must promote it once.
      sources: [{ metaEventId: "ev-1" }, { metaEventId: "ev-1" }, { metaEventId: "ev-2" }],
    });
    const byKeys = vi.spyOn(repos.meta, "sourcesByKeys");

    const result = await repromoteMetaEvents(repos, { templateId: "tpl-1" });

    expect(byKeys).toHaveBeenCalledTimes(1);
    expect(result.events).toBe(2);
  });

  it("promotes nothing for a template no event runs", async () => {
    const result = await repromoteMetaEvents(fakeRepos({}), { templateId: "tpl-unused" });

    expect(result).toEqual({ events: 0, failed: 0, errors: [] });
    expect(vi.mocked(promoteMetaEvent)).not.toHaveBeenCalled();
  });
});
