import { WellKnown } from "@openrift/shared";
import { createLogger } from "@openrift/shared/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../../deps.js";
import type { TopdeckListRow } from "../../repositories/topdeck-events.js";
import { promoteNewEvent } from "../meta-promote.js";
import {
  acceptTopdeckEvent,
  autoAcceptTopdeckBacklog,
  autoAcceptTopdeckEvents,
} from "./topdeck-accept.js";
import type { TopdeckSyncDeps } from "./topdeck-deps.js";

vi.mock("../meta-promote.js", () => ({
  promoteNewEvent: vi.fn(() =>
    Promise.resolve({ metaEventId: "live-1", slug: "summoner-skirmish-4", created: true }),
  ),
}));

const NOW = new Date("2026-09-04T12:00:00Z");

function row(overrides: Partial<TopdeckListRow> = {}): TopdeckListRow {
  return {
    tid: "summoner-skirmish-4",
    name: "Summoner Skirmish #4",
    format: "Constructed",
    // The evening of the 2nd in Florida.
    startAt: new Date("2026-01-03T00:30:00.000Z"),
    swissRounds: 9,
    topCut: 16,
    playerCount: 64,
    isTeamEvent: false,
    teamSize: null,
    city: "Kissimmee",
    state: "Florida",
    country: "US",
    address: "1875 Silver Spur Ln",
    longitude: -81.369,
    latitude: 28.298,
    contentHash: "hash",
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    missingSince: null,
    triage: "new",
    metaEventId: null,
    metaEventSlug: null,
    fetchedAt: NOW,
    stagedPlayerCount: 64,
    stagedLegendCount: 60,
    stagedDeckCount: 40,
    rivalProvider: null,
    ...overrides,
  };
}

function fakeDeps(options: { minPlayers?: number | null; rows?: TopdeckListRow[] } = {}) {
  const newKeys = vi.fn(() => Promise.resolve((options.rows ?? []).map((r) => r.tid)));
  const deps: TopdeckSyncDeps = {
    repos: {
      uvsgamesEvents: {
        settings: () =>
          Promise.resolve({
            autoAcceptMinPlayers: "minPlayers" in options ? options.minPlayers : 32,
          }),
      },
      topdeckEvents: {
        unacceptedByKeys: (tids: readonly string[]) =>
          Promise.resolve((options.rows ?? []).filter((r) => tids.includes(r.tid))),
        newKeys,
      },
    } as unknown as Repos,
    transact: (() => Promise.reject(new Error("no writes here"))) as unknown as Transact,
    client: { requests: 0, searchTournaments: () => Promise.resolve([]) },
    log: createLogger("test"),
    now: () => NOW,
  };
  return { deps, newKeys };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("acceptTopdeckEvent", () => {
  it("seeds the live event under the day the event was played locally", async () => {
    const { deps } = fakeDeps();

    await acceptTopdeckEvent(deps, row());

    expect(promoteNewEvent).toHaveBeenCalledWith(
      deps.repos,
      "topdeck",
      "summoner-skirmish-4",
      expect.objectContaining({ eventDate: "2026-01-02" }),
    );
  });

  it("cites the source's own page for the event", async () => {
    const { deps } = fakeDeps();

    await acceptTopdeckEvent(deps, row());

    expect(promoteNewEvent).toHaveBeenCalledWith(
      deps.repos,
      "topdeck",
      "summoner-skirmish-4",
      expect.objectContaining({
        sourceUrl: "https://topdeck.gg/event/summoner-skirmish-4",
      }),
    );
  });

  it("carries the source's own format word through the mapping", async () => {
    const { deps } = fakeDeps();

    await acceptTopdeckEvent(deps, row({ format: "Sealed" }));

    expect(promoteNewEvent).toHaveBeenCalledWith(
      deps.repos,
      "topdeck",
      "summoner-skirmish-4",
      expect.objectContaining({ format: WellKnown.deckFormat.FREEFORM }),
    );
  });
});

describe("autoAcceptTopdeckEvents", () => {
  it("accepts a field at or above the threshold", async () => {
    const { deps } = fakeDeps({ minPlayers: 32, rows: [row({ playerCount: 32 })] });

    const summary = await autoAcceptTopdeckEvents(deps, ["summoner-skirmish-4"]);

    expect(summary).toMatchObject({ considered: 1, accepted: 1, failed: 0 });
  });

  it("leaves a smaller field for a human", async () => {
    const { deps } = fakeDeps({ minPlayers: 32, rows: [row({ playerCount: 31 })] });

    const summary = await autoAcceptTopdeckEvents(deps, ["summoner-skirmish-4"]);

    expect(summary.accepted).toBe(0);
    expect(promoteNewEvent).not.toHaveBeenCalled();
  });

  it("never auto-accepts a team event, whose field is not a list of individual results", async () => {
    const { deps } = fakeDeps({
      minPlayers: 32,
      rows: [row({ isTeamEvent: true, teamSize: 3, playerCount: 90 })],
    });

    const summary = await autoAcceptTopdeckEvents(deps, ["summoner-skirmish-4"]);

    expect(summary.accepted).toBe(0);
  });

  it("skips a row the source gave no field size", async () => {
    const { deps } = fakeDeps({ minPlayers: 32, rows: [row({ playerCount: null })] });

    const summary = await autoAcceptTopdeckEvents(deps, ["summoner-skirmish-4"]);
    expect(summary.accepted).toBe(0);
  });

  it("does nothing at all when no threshold is set", async () => {
    const { deps } = fakeDeps({ minPlayers: null, rows: [row()] });

    const summary = await autoAcceptTopdeckEvents(deps, ["summoner-skirmish-4"]);

    expect(summary).toMatchObject({ considered: 0, accepted: 0 });
  });

  it("does not query at all for an empty key list", async () => {
    const { deps } = fakeDeps({ rows: [row()] });

    const summary = await autoAcceptTopdeckEvents(deps, []);
    expect(summary.considered).toBe(0);
  });

  it("collects a failure and carries on with the rest", async () => {
    vi.mocked(promoteNewEvent).mockRejectedValueOnce(new Error("slug taken"));
    const { deps } = fakeDeps({
      minPlayers: 32,
      rows: [row(), row({ tid: "other", name: "Rift Open" })],
    });

    const summary = await autoAcceptTopdeckEvents(deps, ["summoner-skirmish-4", "other"]);

    expect(summary).toMatchObject({ accepted: 1, failed: 1 });
    expect(summary.errors[0]).toContain("Summoner Skirmish #4");
  });
});

describe("autoAcceptTopdeckBacklog", () => {
  it("sweeps every row still awaiting triage, not just one crawl's keys", async () => {
    const { deps, newKeys } = fakeDeps({ minPlayers: 32, rows: [row()] });

    const summary = await autoAcceptTopdeckBacklog(deps);

    expect(newKeys).toHaveBeenCalled();
    expect(summary.accepted).toBe(1);
  });

  it("reads nothing when no threshold is set", async () => {
    const { deps, newKeys } = fakeDeps({ minPlayers: null, rows: [row()] });

    await autoAcceptTopdeckBacklog(deps);

    expect(newKeys).not.toHaveBeenCalled();
  });
});
