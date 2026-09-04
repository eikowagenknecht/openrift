import { createLogger } from "@openrift/shared/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../../deps.js";
import type { PlayloltcgListRow } from "../../repositories/playloltcg-events.js";
import { autoAcceptPlayloltcgEvents } from "./playloltcg-accept.js";
import type { PlayloltcgClient, PlayloltcgList } from "./playloltcg-client.js";
import { MAX_PAGE_SIZE, PlayloltcgBlockedError } from "./playloltcg-client.js";
import { playloltcgDeepFetch, readPlayloltcgDetail } from "./playloltcg-deep-fetch.js";
import type { PlayloltcgSyncDeps } from "./playloltcg-deps.js";
import {
  backfillPlayloltcg,
  processPlayloltcgRechecks,
  syncPlayloltcgCatalog,
} from "./playloltcg-sync.js";

vi.mock("./playloltcg-accept.js", () => ({
  autoAcceptPlayloltcgEvents: vi.fn(() =>
    Promise.resolve({ considered: 0, accepted: 0, failed: 0, errors: [] }),
  ),
}));

vi.mock("./playloltcg-deep-fetch.js", () => ({
  readPlayloltcgDetail: vi.fn(() =>
    Promise.resolve({ shopId: null, shopName: null, isPublishResult: true }),
  ),
  playloltcgDeepFetch: vi.fn(() =>
    Promise.resolve({
      activityShopId: 109_991,
      requests: 0,
      players: 8,
      decks: 0,
      deckRequests: 0,
      decksRemaining: 0,
      acceptedPlayers: 0,
      skippedPlayers: 0,
      shopId: null,
      publishedResults: true,
      complete: true,
      errors: [],
    }),
  ),
}));

const NOW = new Date("2026-08-30T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SHOPS_PATH = "/xcx/shop/searchShop";

/**
 * A page the crawl must follow with another one. The rows carry no id, so they
 * project to nothing: these tests are about which pages are requested, not what
 * lands.
 */
const FULL_PAGE = Array.from({ length: MAX_PAGE_SIZE }, () => ({}));

interface WindowRequest {
  startTime: string;
  endTime: string;
  pageNum: number;
}

interface MissingCall {
  from: string;
  to: string;
}

interface RecheckWrite {
  activityShopId: number;
  nextCheckAt: Date | null;
  checkStage: number;
}

function dueRow(overrides: Partial<PlayloltcgListRow> = {}): PlayloltcgListRow {
  return {
    activityShopId: 109_991,
    shopId: null,
    shopName: "卡之域卡牌",
    name: "本命传奇挑战",
    activityType: "rune_competition",
    activityTypeName: "符文竞技",
    battleMode: "1v1",
    status: 5,
    startAt: "2026-08-20",
    endAt: "2026-08-20",
    playerCount: 41,
    maxUser: 66,
    fee: 0,
    province: "广东省",
    city: "深圳市",
    area: "福田区",
    address: "华强北世纪汇商场6层",
    longitude: 114.083809,
    latitude: 22.541325,
    contentHash: "hash",
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    missingSince: null,
    triage: "accepted",
    metaEventId: "live-1",
    metaEventSlug: "shenzhen-1",
    shopDisplayName: "卡之域卡牌 深圳",
    nextCheckAt: NOW,
    checkStage: 0,
    stagedPlayerCount: 0,
    stagedLegendCount: 0,
    stagedDeckCount: 0,
    fetchedAt: null,
    ...overrides,
  };
}

function fakeDeps(options: {
  /** The rows one window answers with, keyed `start..end`. A window with no entry answers empty. */
  rows?: Record<string, unknown[]>;
  /** Every window overflows, however narrow: a source that will not be split. */
  overflowing?: boolean;
  blockOn?: string;
  due?: PlayloltcgListRow[];
  /** Deck ids the mirror still owes, which is what holds the ladder open. */
  outstandingDecks?: string[];
  priorResult?: unknown;
}): {
  deps: PlayloltcgSyncDeps;
  windows: WindowRequest[];
  missing: MissingCall[];
  rechecks: RecheckWrite[];
} {
  const windows: WindowRequest[] = [];
  const missing: MissingCall[] = [];
  const rechecks: RecheckWrite[] = [];

  const client = {
    requests: 0,
    postList: <T>(path: string, body: Record<string, unknown>): Promise<PlayloltcgList<T>> => {
      if (path === SHOPS_PATH) {
        return Promise.resolve({ items: [] as T[], total: null });
      }
      const startTime = String(body.startTime);
      const endTime = String(body.endTime);
      windows.push({ startTime, endTime, pageNum: Number(body.pageNum) });
      if (options.blockOn === startTime) {
        return Promise.reject(new PlayloltcgBlockedError(path));
      }
      const items = options.overflowing
        ? FULL_PAGE
        : (options.rows?.[`${startTime}..${endTime}`] ?? []);
      // The source never reports a total for these listings, which is exactly
      // what makes a full page ambiguous and the split necessary.
      return Promise.resolve({ items: items as T[], total: null });
    },
  } as unknown as PlayloltcgClient;

  const playloltcgResults = {
    deckCoverage: () => Promise.resolve({ outstanding: options.outstandingDecks ?? [], held: 0 }),
  };

  const playloltcgEvents = {
    upsertShops: () => Promise.resolve(0),
    upsertBatch: () => Promise.resolve({ inserted: [], changed: [], unchanged: [] }),
    markMissing: (params: MissingCall) => {
      missing.push({ from: params.from, to: params.to });
      return Promise.resolve(3);
    },
    dueForRecheck: () => Promise.resolve(options.due ?? []),
    linkShopFromDetail: () => Promise.resolve(),
    setRecheck: (activityShopId: number, values: Omit<RecheckWrite, "activityShopId">) => {
      rechecks.push({ activityShopId, ...values });
      return Promise.resolve();
    },
  };

  const deps: PlayloltcgSyncDeps = {
    repos: {
      playloltcgEvents,
      playloltcgResults,
      jobRuns: {
        findLatestForResume: () => Promise.resolve({ result: options.priorResult ?? null }),
        updateResult: () => Promise.resolve(),
      },
    } as unknown as Repos,
    transact: (() => Promise.reject(new Error("no writes here"))) as unknown as Transact,
    client,
    log: createLogger("test"),
    now: () => NOW,
  };
  return { deps, windows, missing, rechecks };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncPlayloltcgCatalog", () => {
  it("crawls the lookback window and flags the past slice's dropped rows", async () => {
    const { deps, windows, missing } = fakeDeps({});

    const result = await syncPlayloltcgCatalog(deps);

    expect(windows[0]).toMatchObject({ startTime: "2026-08-23", pageNum: 1 });
    expect(missing).toEqual([{ from: "2026-08-23", to: "2026-08-30" }]);
    expect(result.missing).toBe(3);
    expect(result.complete).toBe(true);
  });

  it("stands the source down for six hours when the WAF blocks it", async () => {
    const { deps, missing } = fakeDeps({ blockOn: "2026-08-23" });

    const result = await syncPlayloltcgCatalog(deps);

    expect(result.blocked).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.blockedUntil).toBe(new Date(NOW.getTime() + 6 * HOUR_MS).toISOString());
    expect(missing).toEqual([]);
  });

  it("splits an overflowing window instead of accepting its first page as the whole of it", async () => {
    const { deps, windows } = fakeDeps({
      rows: { "2026-08-23..2028-08-29": FULL_PAGE },
    });

    const result = await syncPlayloltcgCatalog(deps);

    // The wide window overflowed, so its two halves were asked for separately
    // and both fit, which is the only way past the source's result ceiling.
    expect(windows.map((entry) => `${entry.startTime}..${entry.endTime}`)).toEqual([
      "2026-08-23..2028-08-29",
      "2026-08-23..2027-08-26",
      "2027-08-27..2028-08-29",
    ]);
    expect(result.complete).toBe(true);
  });

  it("does not flag rows missing on a run that could not read the whole window", async () => {
    // Even a single day overflows, so there is nothing left to narrow and the
    // crawl has to admit the gap.
    const { deps, missing } = fakeDeps({ overflowing: true });

    const result = await syncPlayloltcgCatalog(deps);

    expect(result.complete).toBe(false);
    expect(missing).toEqual([]);
    expect(result.errors[0]).toContain("all the source will give for one query");
  });

  it("caps the errors one run collects", async () => {
    vi.mocked(autoAcceptPlayloltcgEvents).mockResolvedValueOnce({
      considered: 70,
      accepted: 0,
      failed: 70,
      errors: Array.from({ length: 70 }, (_, index) => `Auto-accept ${index} failed`),
    });
    const { deps } = fakeDeps({});

    const result = await syncPlayloltcgCatalog(deps);

    expect(result.errors).toHaveLength(50);
  });
});

describe("backfillPlayloltcg", () => {
  it("narrows only the chunk that overflowed, leaving the others one request each", async () => {
    const { deps, windows } = fakeDeps({
      rows: { "2025-06-15..2025-06-28": FULL_PAGE },
    });

    await backfillPlayloltcg(deps);

    const june = windows.filter((entry) => entry.startTime.startsWith("2025-06"));
    expect(june.map((entry) => `${entry.startTime}..${entry.endTime}`)).toEqual([
      // The chunks either side fit, so they cost one call each.
      "2025-06-01..2025-06-14",
      "2025-06-15..2025-06-28",
      "2025-06-15..2025-06-21",
      "2025-06-22..2025-06-28",
      "2025-06-29..2025-07-12",
    ]);
  });
});

describe("processPlayloltcgRechecks", () => {
  it("fetches a published event and steps the ladder on", async () => {
    const { deps, rechecks } = fakeDeps({ due: [dueRow()] });

    const result = await processPlayloltcgRechecks(deps);

    expect(result).toMatchObject({ due: 1, processed: 1, fetched: 1, players: 8 });
    expect(rechecks).toEqual([
      { activityShopId: 109_991, nextCheckAt: new Date(NOW.getTime() + DAY_MS), checkStage: 1 },
    ]);
  });

  it("steps a finished event on even with its results unpublished", async () => {
    vi.mocked(readPlayloltcgDetail).mockResolvedValueOnce({
      shopId: null,
      shopName: null,
      isPublishResult: false,
    });
    const { deps, rechecks } = fakeDeps({ due: [dueRow()] });

    await processPlayloltcgRechecks(deps);

    expect(rechecks).toEqual([
      { activityShopId: 109_991, nextCheckAt: new Date(NOW.getTime() + DAY_MS), checkStage: 1 },
    ]);
  });

  it("gives an unreadable detail an hour without moving the ladder", async () => {
    vi.mocked(readPlayloltcgDetail).mockResolvedValueOnce(null);
    const { deps, rechecks } = fakeDeps({ due: [dueRow({ checkStage: 3, fetchedAt: NOW })] });

    const result = await processPlayloltcgRechecks(deps);

    expect(rechecks).toEqual([
      { activityShopId: 109_991, nextCheckAt: new Date(NOW.getTime() + HOUR_MS), checkStage: 3 },
    ]);
    expect(result.processed).toBe(0);
    expect(playloltcgDeepFetch).not.toHaveBeenCalled();
  });

  it("holds the ladder when the fetch could not read the standings whole", async () => {
    vi.mocked(playloltcgDeepFetch).mockResolvedValueOnce({
      activityShopId: 109_991,
      requests: 1,
      players: 0,
      decks: 0,
      deckRequests: 0,
      decksRemaining: 0,
      acceptedPlayers: 0,
      skippedPlayers: 0,
      shopId: null,
      publishedResults: true,
      complete: false,
      errors: ["Event 109991 standings after rank 1000: HTTP 502"],
    });
    const { deps, rechecks } = fakeDeps({ due: [dueRow({ checkStage: 2 })] });

    const result = await processPlayloltcgRechecks(deps);

    expect(rechecks).toEqual([
      { activityShopId: 109_991, nextCheckAt: new Date(NOW.getTime() + HOUR_MS), checkStage: 2 },
    ]);
    expect(result.processed).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it("revisits a fetched event whose deck bodies are not all held", async () => {
    const { deps } = fakeDeps({
      due: [dueRow({ checkStage: 1, fetchedAt: NOW })],
      outstandingDecks: ["5"],
    });

    const result = await processPlayloltcgRechecks(deps);

    expect(result.fetched).toBe(1);
  });

  it("leaves a fetched event with every deck held alone", async () => {
    const { deps } = fakeDeps({
      due: [dueRow({ checkStage: 1, fetchedAt: NOW })],
      outstandingDecks: [],
    });

    const result = await processPlayloltcgRechecks(deps);

    expect(result.fetched).toBe(0);
    expect(result.processed).toBe(1);
  });

  it("comes straight back for an event whose decks outran the run's budget", async () => {
    vi.mocked(playloltcgDeepFetch).mockResolvedValueOnce({
      activityShopId: 109_991,
      requests: 601,
      players: 3283,
      decks: 600,
      deckRequests: 600,
      decksRemaining: 2683,
      acceptedPlayers: 3283,
      skippedPlayers: 0,
      shopId: null,
      publishedResults: true,
      complete: true,
      errors: [],
    });
    const { deps, rechecks } = fakeDeps({
      due: [dueRow({ checkStage: 1, fetchedAt: NOW })],
      outstandingDecks: ["5"],
    });

    const result = await processPlayloltcgRechecks(deps);

    // The ladder's next rung is days out, and taking it here is what used to
    // abandon the rest of a large field.
    expect(rechecks).toEqual([
      { activityShopId: 109_991, nextCheckAt: new Date(NOW.getTime() + 60_000), checkStage: 1 },
    ]);
    expect(result.processed).toBe(1);
    expect(result.decks).toBe(600);
  });

  it("leaves the rest of the batch to the next run once the budget is spent", async () => {
    vi.mocked(playloltcgDeepFetch).mockResolvedValueOnce({
      activityShopId: 109_991,
      requests: 601,
      players: 900,
      decks: 600,
      deckRequests: 600,
      decksRemaining: 0,
      acceptedPlayers: 900,
      skippedPlayers: 0,
      shopId: null,
      publishedResults: true,
      complete: true,
      errors: [],
    });
    const { deps } = fakeDeps({
      due: [dueRow(), dueRow({ activityShopId: 109_992 })],
    });

    const result = await processPlayloltcgRechecks(deps);

    expect(result.due).toBe(2);
    expect(result.fetched).toBe(1);
  });

  it("reports the same cool-down instant the catalogue sync does", async () => {
    vi.mocked(readPlayloltcgDetail).mockRejectedValueOnce(new PlayloltcgBlockedError("/xcx"));
    const { deps } = fakeDeps({ due: [dueRow()] });

    const recheck = await processPlayloltcgRechecks(deps);
    const sync = await syncPlayloltcgCatalog(fakeDeps({ blockOn: "2026-08-23" }).deps);

    expect(recheck.blocked).toBe(true);
    expect(recheck.blockedUntil).toBe(sync.blockedUntil);
  });
});
