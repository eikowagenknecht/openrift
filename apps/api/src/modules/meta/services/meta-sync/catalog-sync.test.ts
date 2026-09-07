import { isResumableCheckpoint } from "@openrift/shared/contracts/admin/meta-catalog";
import { createLogger } from "@openrift/shared/logger";
import { describe, expect, it } from "vitest";

import type { Repos, Transact } from "../../../../deps.js";
import type { UvsgamesUpsertInput } from "../../repositories/uvsgames-events.js";
import { ARCHIVE_START, backfillCatalog, syncCatalog, sliceRange } from "./catalog-sync.js";
import type { MetaSyncDeps } from "./deps.js";
import type { UvsClient, UvsPage, UvsQuery } from "./uvsgames-client.js";

const NOW = new Date("2026-08-20T12:00:00Z");

const WATCHED_TEMPLATES: [string, string][] = [
  ["0cbcab3e-be80-4d1d-a450-9485e584906d", "Regional Qualifier"],
];

const TEMPLATE_VOCABULARY = [
  { id: "0cbcab3e-be80-4d1d-a450-9485e584906d", name: "Riftbound Regional Qualifier" },
  { id: "f0c650f5-ab18-4d69-8112-19e5cff8b7b2", name: "Summoners' League" },
];

interface PageRequest {
  path: string;
  query: UvsQuery;
  page: number;
  pageSize: number;
}

function listingRow(id: number, startAt: string): Record<string, unknown> {
  return {
    id,
    name: `MTC Event ${id}`,
    start_datetime: startAt,
    display_status: "complete",
    gameplay_format: { name: "Constructed" },
  };
}

function bounds(request: PageRequest): [string, string] {
  return [String(request.query.start_date_after), String(request.query.start_date_before)];
}

function spans(request: PageRequest): { from: number; to: number } {
  const [after, before] = bounds(request);
  return { from: Date.parse(after), to: Date.parse(before) };
}

function fakeClient(respond: (request: PageRequest) => UvsPage<unknown>): {
  client: UvsClient;
  requests: PageRequest[];
  gets: { path: string; query: UvsQuery | undefined }[];
} {
  const requests: PageRequest[] = [];
  const gets: { path: string; query: UvsQuery | undefined }[] = [];
  let count = 0;
  const client: UvsClient = {
    get: <T>(path: string, query?: UvsQuery) => {
      gets.push({ path, query });
      count++;
      return Promise.resolve(TEMPLATE_VOCABULARY as T);
    },
    page: <T>(path: string, query: UvsQuery, page: number, pageSize = 250) => {
      requests.push({ path, query, page, pageSize });
      count++;
      return Promise.resolve(respond({ path, query, page, pageSize }) as UvsPage<T>);
    },
    get requests() {
      return count;
    },
  };
  return { client, requests, gets };
}

interface MarkMissingCall {
  from: Date;
  to: Date;
}

function fakeDeps(
  client: UvsClient,
  watched: [string, string][] = WATCHED_TEMPLATES,
): {
  deps: MetaSyncDeps;
  upserted: UvsgamesUpsertInput[];
  namedTemplates: unknown[];
  markMissingCalls: MarkMissingCall[];
  heartbeats: { runId: string; result: Record<string, unknown> }[];
  stored: { value: unknown };
} {
  const upserted: UvsgamesUpsertInput[] = [];
  const namedTemplates: unknown[] = [];
  const markMissingCalls: MarkMissingCall[] = [];
  const heartbeats: { runId: string; result: Record<string, unknown> }[] = [];
  const stored: { value: unknown } = { value: null };

  const uvsgamesEvents = {
    watchedTemplates: () => Promise.resolve(new Map(watched)),
    upsertTemplates: (rows: readonly unknown[]) => {
      namedTemplates.push(...rows);
      return Promise.resolve(rows.length);
    },
    discoverTemplatesFromEvents: () => Promise.resolve(0),
    upsertBatch: (rows: readonly UvsgamesUpsertInput[]) => {
      upserted.push(...rows);
      return Promise.resolve({
        inserted: rows.map((row) => row.externalId),
        changed: [],
        unchanged: [],
      });
    },
    markMissing: (params: MarkMissingCall) => {
      markMissingCalls.push({ from: params.from, to: params.to });
      return Promise.resolve(2);
    },
    settings: () =>
      Promise.resolve({
        autoAcceptMinPlayers: null,
        autoAcceptNotable: false,
        autoAcceptOfficial: false,
        updatedAt: NOW,
      }),
  };

  const jobRuns = {
    getResult: () => Promise.resolve(stored.value),
    mergeResult: (runId: string, patch: object) => {
      const previous = (stored.value ?? {}) as Record<string, unknown>;
      // The column merge keeps a cancel the patch was built before, the way
      // `jobRunsRepo.mergeResult` does.
      const merged = {
        ...previous,
        ...patch,
        ...(previous.cancelRequested === true ? { cancelRequested: true } : {}),
      };
      stored.value = merged;
      heartbeats.push({ runId, result: merged as Record<string, unknown> });
      return Promise.resolve();
    },
  };

  const deps: MetaSyncDeps = {
    repos: { uvsgamesEvents, jobRuns } as unknown as Repos,
    transact: (() => Promise.reject(new Error("no writes here"))) as unknown as Transact,
    client,
    log: createLogger("test"),
    now: () => NOW,
  };
  return { deps, upserted, namedTemplates, markMissingCalls, heartbeats, stored };
}

function pageOf(results: unknown[], count = results.length): UvsPage<unknown> {
  return { results, count, nextPage: null };
}

// Matches the real listing: any page containing a poison id 500s, others answer normally.
function fakeSource(
  events: { id: number; at: string }[],
  poison: number[] = [],
): (request: PageRequest) => UvsPage<unknown> {
  const broken = new Set(poison);
  return (request) => {
    const { from, to } = spans(request);
    const inside = events.filter((event) => {
      const at = Date.parse(event.at);
      return at >= from && at <= to;
    });
    const offset = (request.page - 1) * request.pageSize;
    const window = inside.slice(offset, offset + request.pageSize);
    if (window.some((event) => broken.has(event.id))) {
      throw new Error("HTTP 500 for the listing");
    }
    return pageOf(
      window.map((event) => listingRow(event.id, event.at)),
      inside.length,
    );
  };
}

describe("sliceRange", () => {
  it("covers the range exactly once, with no gap and no overlap", () => {
    const slices = sliceRange(new Date(0), new Date(99), 7);

    expect(slices[0]!.from.getTime()).toBe(0);
    expect(slices.at(-1)?.to.getTime()).toBe(99);
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i]!.from.getTime()).toBe(slices[i - 1]!.to.getTime() + 1);
    }
  });

  it("never produces an empty slice, however narrow the range", () => {
    const slices = sliceRange(new Date(10), new Date(12), 12);

    expect(slices).toHaveLength(3);
    expect(slices.every((slice) => slice.from.getTime() <= slice.to.getTime())).toBe(true);
  });
});

describe("isResumableCheckpoint", () => {
  it("reads a run from before this shape as no checkpoint at all", () => {
    expect(isResumableCheckpoint({ pages: 366, rows: 91_500, inserted: 947 })).toBe(false);
    expect(isResumableCheckpoint(null)).toBe(false);
  });

  it("declines a run that finished its window, however much it skipped", () => {
    const finished = { complete: true, cancelRequested: false, rows: 10, coveredThrough: "x" };
    expect(isResumableCheckpoint(finished)).toBe(false);
  });

  it("takes a run that stopped early and said where", () => {
    const stopped = {
      complete: false,
      cancelRequested: true,
      rows: 10,
      coveredThrough: "2026-04-06T13:00:00.000Z",
    };
    expect(isResumableCheckpoint(stopped)).toBe(true);
  });
});

describe("syncCatalog", () => {
  it("asks from a week back out to the horizon, once when it fits a page", async () => {
    const { client, requests } = fakeClient(() => pageOf([]));
    const { deps } = fakeDeps(client);

    await syncCatalog(deps);

    expect(requests).toHaveLength(1);
    expect(requests[0]!.query).toMatchObject({
      game_slug: "riftbound",
      start_date_after: "2026-08-13T12:00:00.000Z",
    });
    expect(spans(requests[0]!).to).toBeGreaterThan(NOW.getTime());
  });

  it("splits by date rather than paging, so an unstable sort cannot drop a row", async () => {
    const events = Array.from({ length: 900 }, (_, i) => ({
      id: i + 1,
      at: new Date(NOW.getTime() - (i + 1) * 60_000).toISOString(),
    }));
    const { client, requests } = fakeClient(fakeSource(events));
    const { deps, upserted } = fakeDeps(client);

    const result = await syncCatalog(deps);

    expect(new Set(upserted.map((row) => row.externalId)).size).toBe(events.length);
    expect(result.complete).toBe(true);
    expect(requests.every((request) => request.page === 1)).toBe(true);
  });

  it("counts a split range's rows once, not once per level of the split", async () => {
    const events = Array.from({ length: 900 }, (_, i) => ({
      id: i + 1,
      at: new Date(NOW.getTime() - (i + 1) * 60_000).toISOString(),
    }));
    const { client } = fakeClient(fakeSource(events));
    const { deps, upserted } = fakeDeps(client);

    const result = await syncCatalog(deps);

    expect(result.rows).toBe(events.length);
    expect(result.inserted).toBe(events.length);
    expect(upserted).toHaveLength(events.length);
  });

  it("flags unseen rows in the past slice only, once everything was covered", async () => {
    const { client } = fakeClient(() => pageOf([listingRow(1, "2026-08-18T00:00:00Z")]));
    const { deps, markMissingCalls } = fakeDeps(client);

    const result = await syncCatalog(deps);

    expect(markMissingCalls).toHaveLength(1);
    expect(markMissingCalls[0]!.from.toISOString()).toBe("2026-08-13T12:00:00.000Z");
    expect(markMissingCalls[0]!.to.toISOString()).toBe(NOW.toISOString());
    expect(result.missing).toBe(2);
  });

  it("flags nothing when coverage fell short: the gap may be ours", async () => {
    const at = "2026-08-18T00:00:00.000Z";
    const { client } = fakeClient(fakeSource([{ id: 1, at }], [1]));
    const { deps, markMissingCalls } = fakeDeps(client);

    const result = await syncCatalog(deps);

    expect(result.complete).toBe(false);
    expect(markMissingCalls).toHaveLength(0);
  });

  it("stores the projection of every row it reads and counts the unreadable ones", async () => {
    const { client } = fakeClient(() =>
      pageOf([listingRow(1, "2026-08-15T18:00:00Z"), { id: null }]),
    );
    const { deps, upserted } = fakeDeps(client);

    const result = await syncCatalog(deps);

    expect(upserted).toHaveLength(1);
    expect(upserted[0]).toMatchObject({ externalId: "1", name: "MTC Event 1" });
    expect(result.rows).toBe(2);
    expect(result.unreadable).toBe(1);
    expect(result.inserted).toBe(1);
  });

  it("refreshes the source's template vocabulary on the same run", async () => {
    const { client, gets } = fakeClient(() => pageOf([]));
    const { deps, namedTemplates } = fakeDeps(client);

    const result = await syncCatalog(deps);

    expect(gets).toEqual([
      { path: "/api/v2/event-configuration-templates/", query: { game_slug: "riftbound" } },
    ]);
    expect(namedTemplates).toEqual([
      {
        templateId: "0cbcab3e-be80-4d1d-a450-9485e584906d",
        sourceName: "Riftbound Regional Qualifier",
      },
      { templateId: "f0c650f5-ab18-4d69-8112-19e5cff8b7b2", sourceName: "Summoners' League" },
    ]);
    expect(result.templatesNamed).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it("keeps the crawl when the template endpoint fails", async () => {
    const { client } = fakeClient(() => pageOf([listingRow(1, "2026-08-15T18:00:00Z")]));
    client.get = () => Promise.reject(new Error("HTTP 503"));
    const { deps, upserted } = fakeDeps(client);

    const result = await syncCatalog(deps);

    expect(upserted).toHaveLength(1);
    expect(result.templatesNamed).toBe(0);
    expect(result.errors.at(-1)).toContain("Template vocabulary: HTTP 503");
  });
});

describe("a row the source refuses", () => {
  const POISON = "2026-08-18T13:00:00.000Z";

  function neighbours() {
    return [
      { id: 1, at: "2026-08-18T12:00:00.000Z" },
      { id: 2, at: POISON },
      { id: 3, at: "2026-08-18T14:00:00.000Z" },
      { id: 4, at: "2026-08-19T09:00:00.000Z" },
    ];
  }

  it("keeps crawling everything around it instead of ending the run", async () => {
    const { client } = fakeClient(fakeSource(neighbours(), [2]));
    const { deps, upserted } = fakeDeps(client);

    const result = await syncCatalog(deps);

    expect(upserted.map((row) => row.externalId).toSorted()).toEqual(["1", "3", "4"]);
    expect(result.skipped).toBe(1);
  });

  it("corners it on its own instant and says so", async () => {
    const { client } = fakeClient(fakeSource(neighbours(), [2]));
    const { deps } = fakeDeps(client);

    const result = await syncCatalog(deps);

    expect(result.complete).toBe(false);
    expect(result.skippedRanges).toEqual([`${POISON} row 1`]);
  });

  it("saves the rows sharing that instant, losing only the one that breaks", async () => {
    const events = [
      { id: 1, at: POISON },
      { id: 2, at: POISON },
      { id: 3, at: POISON },
    ];
    const { client } = fakeClient(fakeSource(events, [2]));
    const { deps, upserted } = fakeDeps(client);

    const result = await syncCatalog(deps);

    expect(upserted.map((row) => row.externalId).toSorted()).toEqual(["1", "3"]);
    expect(result.skipped).toBe(1);
  });
});

describe("a source that is down", () => {
  it("gives up instead of bisecting its whole budget against nothing", async () => {
    const { client, requests } = fakeClient(() => {
      throw new Error("HTTP 503 for the listing");
    });
    const { deps } = fakeDeps(client);

    const result = await syncCatalog(deps);

    expect(result.complete).toBe(false);
    expect(requests.length).toBeLessThan(30);
    expect(result.errors.at(-1)).toContain("failed in a row");
  });
});

describe("backfillCatalog", () => {
  it("starts at the archive's first day and reaches past today", async () => {
    const { client, requests } = fakeClient(() => pageOf([]));
    const { deps } = fakeDeps(client);

    await backfillCatalog(deps);

    expect(requests[0]!.query.start_date_after).toBe(ARCHIVE_START.toISOString());
    expect(spans(requests[0]!).to).toBeGreaterThan(NOW.getTime());
  });

  it("resumes one millisecond past where the last run got to", async () => {
    const { client, requests } = fakeClient(() => pageOf([]));
    const { deps } = fakeDeps(client);
    const resumeFrom = new Date("2026-03-01T00:00:00.000Z");

    const result = await backfillCatalog(deps, undefined, { resumeFrom });

    expect(requests[0]!.query.start_date_after).toBe("2026-03-01T00:00:00.001Z");
    expect(result.resumedFrom).toBe(resumeFrom.toISOString());
  });

  it("leaves a resume point behind covering everything it read", async () => {
    const events = Array.from({ length: 600 }, (_, i) => ({
      id: i + 1,
      at: new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString(),
    }));
    const { client } = fakeClient(fakeSource(events));
    const { deps } = fakeDeps(client);

    const result = await backfillCatalog(deps);

    expect(result.complete).toBe(true);
    expect(Date.parse(result.coveredThrough as string)).toBeGreaterThan(NOW.getTime());
    expect(isResumableCheckpoint(result)).toBe(false);
  });

  it("hands the next run a resume point when it stopped short", async () => {
    const at = "2026-04-06T13:00:00.000Z";
    const { client } = fakeClient(fakeSource([{ id: 1, at }], [1]));
    const { deps } = fakeDeps(client);

    const result = await backfillCatalog(deps);

    expect(result.complete).toBe(false);
    expect(isResumableCheckpoint(result)).toBe(true);
  });
});

describe("crawl heartbeats", () => {
  function manyRanges() {
    return fakeSource(
      Array.from({ length: 4000 }, (_, i) => ({
        id: i + 1,
        at: new Date(Date.UTC(2026, 0, 1) + i * 600_000).toISOString(),
      })),
    );
  }

  it("writes partial counters and the resume point into the run as it walks", async () => {
    const { client } = fakeClient(manyRanges());
    const { deps, heartbeats } = fakeDeps(client);

    await backfillCatalog(deps, "run-1");

    expect(heartbeats.length).toBeGreaterThan(0);
    expect(heartbeats.every((beat) => beat.runId === "run-1")).toBe(true);
    expect(heartbeats[0]!.result.heartbeatAt).toBe(NOW.toISOString());
    expect(typeof heartbeats[0]!.result.coveredThrough).toBe("string");
  });

  it("writes nothing without a run id", async () => {
    const { client } = fakeClient(manyRanges());
    const { deps, heartbeats } = fakeDeps(client);

    await backfillCatalog(deps);

    expect(heartbeats).toHaveLength(0);
  });

  it("stops at the next beat once the run row asks it to", async () => {
    const { client, requests } = fakeClient(manyRanges());
    const { deps, stored } = fakeDeps(client);
    stored.value = { complete: false, cancelRequested: true, rows: 0, coveredThrough: null };

    const result = await backfillCatalog(deps, "run-1");

    expect(result.cancelRequested).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.coveredThrough).not.toBeNull();
    expect(requests.length).toBeLessThan(200);
  });
});
