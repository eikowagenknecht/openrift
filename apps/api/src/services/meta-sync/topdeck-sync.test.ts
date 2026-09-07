import { TOPDECK_FORMATS } from "@openrift/shared";
import { createLogger } from "@openrift/shared/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../../deps.js";
import { autoAcceptTopdeckEvents } from "./topdeck-accept.js";
import type { TopdeckClient, TopdeckSearchBody } from "./topdeck-client.js";
import { TopdeckThrottledError } from "./topdeck-client.js";
import type { TopdeckSyncDeps } from "./topdeck-deps.js";
import type { TopdeckSyncResult } from "./topdeck-sync.js";
import { backfillTopdeck, isTopdeckSyncNoop, syncTopdeckCatalog } from "./topdeck-sync.js";

vi.mock("./topdeck-accept.js", () => ({
  autoAcceptTopdeckEvents: vi.fn(() =>
    Promise.resolve({ considered: 0, accepted: 0, failed: 0, errors: [] }),
  ),
}));

const NOW = new Date("2026-09-04T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function tournament(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    TID: "summoner-skirmish-4",
    tournamentName: "Summoner Skirmish #4",
    format: "Constructed",
    startDate: Math.floor(NOW.getTime() / 1000) - DAY_MS / 1000,
    standings: [
      {
        name: "Ashe Ryder",
        id: "acct-1",
        wins: 4,
        losses: 1,
        draws: 0,
        leader: "Lee Sin, Blind Monk",
        deckObj: {
          Legend: { "Lee Sin, Blind Monk": { id: "OGN-001", count: 1 } },
          Mainboard: { Gust: { count: 3 } },
        },
      },
    ],
    ...overrides,
  };
}

interface StandingsWrite {
  tid: string;
  rows: { playerKey: string; legendName: string | null; rank: number | null }[];
}
interface DeckWrite {
  sourceDeckId: string;
  cards: { zone: string; cardName: string; quantity: number }[];
}
interface MissingCall {
  format: string;
  from: Date;
  to: Date;
}

function fakeDeps(options: {
  byFormat?: Record<string, unknown[]>;
  unchanged?: boolean;
  failWrites?: boolean;
  throttleOn?: string;
  cancelled?: boolean;
  bridge?: Map<string, { cardId: string; name: string; type: string }>;
}) {
  const searches: TopdeckSearchBody[] = [];
  const standings: StandingsWrite[] = [];
  const decks: DeckWrite[] = [];
  const missing: MissingCall[] = [];
  const requeued: string[] = [];
  const heartbeats: unknown[] = [];

  const client = {
    requests: 0,
    searchTournaments: (body: TopdeckSearchBody): Promise<unknown[]> => {
      searches.push(body);
      if (options.throttleOn === body.format) {
        return Promise.reject(new TopdeckThrottledError("search"));
      }
      return Promise.resolve(options.byFormat?.[body.format] ?? []);
    },
  } as unknown as TopdeckClient;

  const topdeckEvents = {
    cardsByShortCode: () => Promise.resolve(options.bridge ?? new Map()),
    upsertBatch: (rows: { tid: string }[]) =>
      Promise.resolve(
        options.unchanged === true
          ? { inserted: [], changed: [], unchanged: rows.map((row) => row.tid) }
          : { inserted: rows.map((row) => row.tid), changed: [], unchanged: [] },
      ),
    markMissing: (params: MissingCall) => {
      missing.push(params);
      return Promise.resolve(2);
    },
    requeueResults: (tids: string[]) => {
      requeued.push(...tids);
      return Promise.resolve();
    },
  };

  const topdeckResults = {
    replaceStandings: (tid: string, rows: StandingsWrite["rows"]) => {
      if (options.failWrites === true) {
        return Promise.reject(new Error("write failed"));
      }
      standings.push({ tid, rows });
      return Promise.resolve();
    },
    putDecklist: (row: { sourceDeckId: string }, cards: DeckWrite["cards"]): Promise<void> => {
      decks.push({ sourceDeckId: row.sourceDeckId, cards });
      return Promise.resolve();
    },
  };

  const deps: TopdeckSyncDeps = {
    repos: {
      topdeckEvents,
      topdeckResults,
      jobRuns: {
        getResult: () => Promise.resolve({ cancelRequested: options.cancelled === true }),
        mergeResult: (_id: string, patch: unknown) => {
          heartbeats.push(patch);
          return Promise.resolve();
        },
      },
    } as unknown as Repos,
    transact: (() => Promise.reject(new Error("no writes here"))) as unknown as Transact,
    client,
    log: createLogger("test"),
    now: () => NOW,
  };
  return { deps, searches, standings, decks, missing, requeued, heartbeats };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncTopdeckCatalog", () => {
  it("asks once per format, because a search must name one", async () => {
    const { deps, searches } = fakeDeps({});

    await syncTopdeckCatalog(deps);

    expect(searches.map((body) => body.format)).toEqual([...TOPDECK_FORMATS]);
    expect(searches.every((body) => body.game === "Riftbound")).toBe(true);
  });

  it("asks for the decklist column, which is what carries the lists", async () => {
    const { deps, searches } = fakeDeps({});

    await syncTopdeckCatalog(deps);

    expect(searches[0]?.columns).toContain("decklist");
  });

  it("covers the last thirty days and never reaches past now", async () => {
    const { deps, searches } = fakeDeps({});

    await syncTopdeckCatalog(deps);

    const body = searches[0];
    expect(body?.end).toBe(Math.floor(NOW.getTime() / 1000));
    expect(body?.start).toBe(Math.floor((NOW.getTime() - 30 * DAY_MS) / 1000));
  });

  it("writes the standings and the lists of an event it just catalogued", async () => {
    const { deps, standings, decks } = fakeDeps({
      byFormat: { Constructed: [tournament()] },
      bridge: new Map([["OGN-001", { cardId: "c1", name: "Blind Monk", type: "legend" }]]),
    });

    const result = await syncTopdeckCatalog(deps);

    expect(result.players).toBe(1);
    expect(result.decks).toBe(1);
    expect(standings[0]?.rows[0]).toMatchObject({ playerKey: "uacct-1", rank: 1 });
    expect(decks[0]?.cards.map((card) => card.cardName)).toEqual(["Blind Monk", "Gust"]);
  });

  it("takes the legend from the deck's own line over the source's leader string", async () => {
    const { deps, standings } = fakeDeps({
      byFormat: { Constructed: [tournament()] },
      bridge: new Map([["OGN-001", { cardId: "c1", name: "Blind Monk", type: "legend" }]]),
    });

    await syncTopdeckCatalog(deps);

    expect(standings[0]?.rows[0]?.legendName).toBe("Blind Monk");
  });

  it("keeps the source's leader string for a standing with no list", async () => {
    const { deps, standings } = fakeDeps({
      byFormat: {
        Constructed: [
          tournament({
            standings: [{ name: "Vi Lane", id: "b2", leader: "Rengar, Pridestalker" }],
          }),
        ],
      },
    });

    await syncTopdeckCatalog(deps);

    expect(standings[0]?.rows[0]?.legendName).toBe("Rengar, Pridestalker");
  });

  it("leaves an unchanged event's results alone", async () => {
    const { deps, standings } = fakeDeps({
      byFormat: { Constructed: [tournament()] },
      unchanged: true,
    });

    const result = await syncTopdeckCatalog(deps);

    expect(standings).toEqual([]);
    expect(result.unchanged).toBe(1);
  });

  it("puts an event back in line when its results could not be written", async () => {
    const { deps, requeued, missing } = fakeDeps({
      byFormat: { Constructed: [tournament()] },
      failWrites: true,
    });

    const result = await syncTopdeckCatalog(deps);

    expect(requeued).toEqual(["summoner-skirmish-4"]);
    expect(result.complete).toBe(false);
    expect(result.errors[0]).toContain("summoner-skirmish-4");
    expect(missing.map((call) => call.format)).not.toContain("Constructed");
  });

  it("flags rows a covering crawl stopped returning, per format", async () => {
    const { deps, missing } = fakeDeps({});

    const result = await syncTopdeckCatalog(deps);

    expect(missing.map((call) => call.format)).toEqual([...TOPDECK_FORMATS]);
    expect(result.missing).toBe(2 * TOPDECK_FORMATS.length);
  });

  it("reports a throttle rather than throwing, and stops short", async () => {
    const { deps, searches } = fakeDeps({ throttleOn: "Sealed" });

    const result = await syncTopdeckCatalog(deps);

    expect(result.throttled).toBe(true);
    expect(result.complete).toBe(false);
    expect(searches.map((body) => body.format)).toEqual(["Constructed", "Limited", "Sealed"]);
  });

  it("hands the keys it touched to the auto-accept sweep", async () => {
    const { deps } = fakeDeps({ byFormat: { Constructed: [tournament()] } });

    await syncTopdeckCatalog(deps);

    expect(autoAcceptTopdeckEvents).toHaveBeenCalledWith(deps, ["summoner-skirmish-4"]);
  });
});

describe("isTopdeckSyncNoop", () => {
  function result(overrides: Partial<TopdeckSyncResult> = {}): TopdeckSyncResult {
    return {
      requests: 1,
      rows: 0,
      inserted: 0,
      changed: 0,
      unchanged: 12,
      missing: 0,
      autoAccepted: 0,
      players: 0,
      decks: 0,
      throttled: false,
      complete: true,
      coveredThrough: null,
      resumedFrom: null,
      cancelRequested: false,
      errors: [],
      ...overrides,
    };
  }

  it("calls a pass that changed nothing a noop", () => {
    expect(isTopdeckSyncNoop(result())).toBe(true);
  });

  it("does not call a throttled pass a noop, so the run stays visible", () => {
    expect(isTopdeckSyncNoop(result({ throttled: true }))).toBe(false);
  });

  it("does not call a pass that wrote or accepted anything a noop", () => {
    expect(isTopdeckSyncNoop(result({ inserted: 1 }))).toBe(false);
    expect(isTopdeckSyncNoop(result({ changed: 1 }))).toBe(false);
    expect(isTopdeckSyncNoop(result({ missing: 1 }))).toBe(false);
    expect(isTopdeckSyncNoop(result({ autoAccepted: 1 }))).toBe(false);
  });
});

describe("backfillTopdeck", () => {
  it("walks the archive in chunks and records how far it got", async () => {
    const { deps, searches } = fakeDeps({});

    const result = await backfillTopdeck(deps);

    expect(result.coveredThrough).toBe(NOW.toISOString());
    expect(searches.length).toBeGreaterThan(TOPDECK_FORMATS.length);
    expect(searches[0]?.start).toBe(Math.floor(Date.UTC(2025, 5, 1) / 1000));
  });

  it("starts after the point a prior run reached", async () => {
    const resumeFrom = new Date("2026-08-01T00:00:00.000Z");
    const { deps, searches } = fakeDeps({});

    const result = await backfillTopdeck(deps, undefined, { resumeFrom });

    expect(result.resumedFrom).toBe(resumeFrom.toISOString());
    expect(searches[0]?.start).toBe(Math.floor((resumeFrom.getTime() + 1) / 1000));
  });

  it("stops when the admin asked it to, keeping what it already covered", async () => {
    const { deps, searches } = fakeDeps({ cancelled: true });

    const result = await backfillTopdeck(deps, "run-1");

    expect(result.cancelRequested).toBe(true);
    expect(result.complete).toBe(false);
    expect(searches).toEqual([]);
  });

  it("beats a heartbeat per chunk, so a long run reads as alive", async () => {
    const { deps, heartbeats } = fakeDeps({});

    await backfillTopdeck(deps, "run-1");

    expect(heartbeats.length).toBeGreaterThan(0);
    expect(heartbeats[0]).toHaveProperty("heartbeatAt");
  });
});
