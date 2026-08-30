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
  autoAcceptPlayloltcgEvents: vi.fn(() => Promise.resolve({ accepted: 0, errors: [] })),
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
    candidateEventId: "cand-1",
    metaEventId: "live-1",
    metaEventSlug: "shenzhen-1",
    shopDisplayName: "卡之域卡牌 深圳",
    nextCheckAt: NOW,
    checkStage: 0,
    fetchedAt: null,
    ...overrides,
  };
}

function fakeDeps(options: {
  /** Pages keyed by `startTime`, in order. A missing window answers one empty page. */
  pages?: Record<string, { items: unknown[]; total: number }[]>;
  blockOn?: string;
  due?: PlayloltcgListRow[];
  candidateRaw?: unknown;
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
  const seen = new Map<string, number>();

  const client = {
    requests: 0,
    postList: <T>(path: string, body: Record<string, unknown>): Promise<PlayloltcgList<T>> => {
      if (path === SHOPS_PATH) {
        return Promise.resolve({ items: [] as T[], total: 0 });
      }
      const startTime = String(body.startTime);
      windows.push({ startTime, endTime: String(body.endTime), pageNum: Number(body.pageNum) });
      if (options.blockOn === startTime) {
        return Promise.reject(new PlayloltcgBlockedError(path));
      }
      const index = seen.get(startTime) ?? 0;
      seen.set(startTime, index + 1);
      const page = options.pages?.[startTime]?.[index] ?? { items: [], total: 0 };
      return Promise.resolve({ items: page.items as T[], total: page.total });
    },
  } as unknown as PlayloltcgClient;

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
      metaCandidates: {
        eventsBySourceKeys: () => Promise.resolve([{ id: "cand-1", raw: options.candidateRaw }]),
      },
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

  it("does not flag rows missing on a run that could not read the whole window", async () => {
    // Every page comes back full, so the crawl hits its page ceiling with the
    // window unfinished.
    const { deps, missing } = fakeDeps({
      pages: {
        "2026-08-23": Array.from({ length: 120 }, () => ({
          items: FULL_PAGE,
          total: MAX_PAGE_SIZE * 200,
        })),
      },
    });

    const result = await syncPlayloltcgCatalog(deps);

    expect(result.complete).toBe(false);
    expect(missing).toEqual([]);
    expect(result.errors[0]).toContain("exceeded 100 pages");
  });

  it("caps the errors one run collects", async () => {
    vi.mocked(autoAcceptPlayloltcgEvents).mockResolvedValueOnce({
      accepted: 0,
      errors: Array.from({ length: 70 }, (_, index) => `Auto-accept ${index} failed`),
    });
    const { deps } = fakeDeps({});

    const result = await syncPlayloltcgCatalog(deps);

    expect(result.errors).toHaveLength(50);
  });
});

describe("backfillPlayloltcg", () => {
  it("follows a window past its first page instead of stopping on the run's row count", async () => {
    const { deps, windows } = fakeDeps({
      pages: {
        // A first chunk that fills one page exactly, so the run's cumulative row
        // count already exceeds the next chunk's total.
        "2025-06-01": [{ items: FULL_PAGE, total: MAX_PAGE_SIZE }],
        "2025-06-15": [
          { items: FULL_PAGE, total: MAX_PAGE_SIZE + 5 },
          { items: [{ activityShopId: 1, name: "尾页" }], total: MAX_PAGE_SIZE + 5 },
        ],
      },
    });

    await backfillPlayloltcg(deps);

    const secondChunk = windows.filter((entry) => entry.startTime === "2025-06-15");
    expect(secondChunk.map((entry) => entry.pageNum)).toEqual([1, 2]);
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
      acceptedPlayers: 0,
      skippedPlayers: 0,
      shopId: null,
      publishedResults: true,
      complete: false,
      errors: ["Event 109991 standings page 2: HTTP 502"],
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
      candidateRaw: { standings: [{ cardGroupId: 5 }], decks: {} },
    });

    const result = await processPlayloltcgRechecks(deps);

    expect(result.fetched).toBe(1);
  });

  it("leaves a fetched event with every deck held alone", async () => {
    const { deps } = fakeDeps({
      due: [dueRow({ checkStage: 1, fetchedAt: NOW })],
      candidateRaw: { standings: [{ cardGroupId: 5 }], decks: { "5": [] } },
    });

    const result = await processPlayloltcgRechecks(deps);

    expect(result.fetched).toBe(0);
    expect(result.processed).toBe(1);
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
