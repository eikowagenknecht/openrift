import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import type { Kysely } from "kysely";

import type { Database } from "../db/types";
import type { Logger } from "../logger";
import type { CardmarketSnapshotData, CardmarketStagingRow } from "./refresh-cardmarket-prices";
import { refreshCardmarketPrices } from "./refresh-cardmarket-prices";
import type { UpsertCounts } from "./refresh-prices-shared";
import * as shared from "./refresh-prices-shared";

// ── Representative mock data (sampled from real Cardmarket API) ──────────

const CREATED_AT = "2026-03-10T02:49:27+0100";

/** Blazing Scorcher — has both normal and foil prices */
const PRODUCT_BLAZING = { idProduct: 845_712, name: "Blazing Scorcher", idExpansion: 6286 };
const PRICE_BLAZING = {
  idProduct: 845_712,
  avg: 0.04,
  low: 0.02,
  trend: 0.02,
  avg1: 0.06,
  avg7: 0.04,
  avg30: 0.05,
  "avg-foil": 0.19,
  "low-foil": 0.02,
  "trend-foil": 0.23,
  "avg1-foil": 0.12,
  "avg7-foil": 0.19,
  "avg30-foil": 0.19,
};

/** Annie, Fiery — normal prices only; foil avg is 0 */
const PRODUCT_ANNIE = { idProduct: 847_277, name: "Annie, Fiery", idExpansion: 6289 };
const PRICE_ANNIE = {
  idProduct: 847_277,
  avg: 0.12,
  low: 0.02,
  trend: 0.13,
  avg1: 0.1,
  avg7: 0.12,
  avg30: 0.13,
  "avg-foil": 0,
  "low-foil": 0,
  "trend-foil": 0,
  "avg1-foil": 0,
  "avg7-foil": 0,
  "avg30-foil": 0,
};

/** Teemo, Scout — normal avg is 0; foil prices present */
const PRODUCT_TEEMO = { idProduct: 847_140, name: "Teemo, Scout", idExpansion: 6286 };
const PRICE_TEEMO = {
  idProduct: 847_140,
  avg: 0,
  low: 0.02,
  trend: 0,
  avg1: 0,
  avg7: 0,
  avg30: 0,
  "avg-foil": 0.14,
  "low-foil": 0.02,
  "trend-foil": 0.16,
  "avg1-foil": 0.17,
  "avg7-foil": 0.17,
  "avg30-foil": 0.16,
};

const ZERO_COUNTS: UpsertCounts = {
  sources: { total: 0, new: 0, updated: 0, unchanged: 0 },
  snapshots: { total: 0, new: 0, updated: 0, unchanged: 0 },
  staging: { total: 0, new: 0, updated: 0, unchanged: 0 },
};

// ── Helpers ──────────────────────────────────────────────────────────────

function makeMockLogger(): { log: Logger; messages: string[] } {
  const messages: string[] = [];
  const log = {
    info: (msg: string) => messages.push(msg),
  } as unknown as Logger;
  return { log, messages };
}

/**
 * Proxy-based Kysely builder chain. Every property access / method call
 * returns another chain; `.execute()` resolves with `value`.
 * @returns A proxy that mimics the Kysely fluent builder API.
 */
function makeChain(value: unknown): any {
  return new Proxy(
    // oxlint-disable-next-line no-empty-function -- proxy target requires a callable
    function noop() {},
    {
      get(_, prop) {
        if (prop === "execute") {
          return async () => value;
        }
        if (prop === "then" || prop === "catch" || prop === "finally") {
          // oxlint-disable-next-line no-useless-undefined -- must explicitly return undefined so the proxy isn't treated as a thenable
          return undefined;
        }
        return makeChain(value);
      },
      apply(_, __, args) {
        for (const arg of args) {
          if (typeof arg === "function") {
            arg(makeChain(value));
          }
        }
        return makeChain(value);
      },
    },
  );
}

interface MockDbConfig {
  ignoredProducts?: { external_id: number; finish: string }[];
  expansions?: { expansion_id: number }[];
  existingSources?: { printing_id: string; external_id: number; finish: string }[];
}

function createMockDb(config: MockDbConfig = {}) {
  const insertedExpansionIds: number[] = [];

  const valuesChain: any = new Proxy(
    // oxlint-disable-next-line no-empty-function -- proxy target requires a callable
    function noop() {},
    {
      get(_, prop) {
        if (prop === "values") {
          return (vals: { expansion_id?: number }[]) => {
            for (const v of vals) {
              if (v.expansion_id !== undefined) {
                insertedExpansionIds.push(v.expansion_id);
              }
            }
            return makeChain(config.expansions ?? []);
          };
        }
        if (prop === "then" || prop === "catch" || prop === "finally") {
          // oxlint-disable-next-line no-useless-undefined -- must explicitly return undefined so the proxy isn't treated as a thenable
          return undefined;
        }
        return makeChain(config.expansions ?? []);
      },
      apply() {
        return makeChain(null);
      },
    },
  );

  const db = {
    selectFrom(table: string) {
      if (table === "cardmarket_ignored_products") {
        return makeChain(config.ignoredProducts ?? []);
      }
      if (table.startsWith("cardmarket_sources")) {
        return makeChain(config.existingSources ?? []);
      }
      return makeChain([]);
    },
    insertInto() {
      return valuesChain;
    },
  } as unknown as Kysely<Database>;

  return { db, insertedExpansionIds };
}

interface FetchJsonOpts {
  createdAt?: string | undefined;
  lastModified?: Date | null;
}

function setupFetchJson(
  fetchJsonSpy: ReturnType<typeof spyOn>,
  products: Record<string, unknown>[],
  priceGuides: Record<string, unknown>[],
  opts: FetchJsonOpts = {},
) {
  const includeCreatedAt = !("createdAt" in opts) || opts.createdAt !== undefined;
  const createdAt = opts.createdAt ?? CREATED_AT;
  const lastModified = opts.lastModified ?? null;

  fetchJsonSpy.mockImplementation(async (url: string) => {
    if (url.includes("priceGuide")) {
      return {
        data: { ...(includeCreatedAt ? { createdAt } : {}), priceGuides },
        lastModified,
      };
    }
    return { data: { products }, lastModified: null };
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("refreshCardmarketPrices", () => {
  let fetchJsonSpy: ReturnType<typeof spyOn>;
  let upsertSpy: ReturnType<typeof spyOn>;
  let logUpsertSpy: ReturnType<typeof spyOn>;

  /**
   * Extract [snapshots, staging] from the spy upsert call args.
   * @returns The snapshots and staging arrays from the first upsert call.
   */
  function upsertArgs(): {
    snapshots: CardmarketSnapshotData[];
    staging: CardmarketStagingRow[];
  } {
    const args = upsertSpy.mock.calls[0];
    return { snapshots: args[3], staging: args[4] };
  }

  beforeEach(() => {
    fetchJsonSpy = spyOn(shared, "fetchJson" as any).mockResolvedValue({
      data: {},
      lastModified: null,
    });
    upsertSpy = spyOn(shared, "upsertPriceData" as any).mockResolvedValue(ZERO_COUNTS);
    logUpsertSpy = spyOn(shared, "logUpsertCounts" as any);
  });

  afterEach(() => {
    fetchJsonSpy.mockRestore();
    upsertSpy.mockRestore();
    logUpsertSpy.mockRestore();
  });

  // ── Fetch URLs ────────────────────────────────────────────────────────

  describe("API fetch", () => {
    it("fetches price guide and singles from Cardmarket S3 endpoints", async () => {
      const { db } = createMockDb();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [], []);

      await refreshCardmarketPrices(db, log);

      const urls = fetchJsonSpy.mock.calls.map((c: unknown[]) => c[0]);
      expect(urls).toContainEqual(
        "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_22.json",
      );
      expect(urls).toContainEqual(
        "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_22.json",
      );
    });

    it("handles empty API responses gracefully", async () => {
      const { db } = createMockDb();
      const { log } = makeMockLogger();

      const result = await refreshCardmarketPrices(db, log);

      const { snapshots, staging } = upsertArgs();
      expect(staging).toHaveLength(0);
      expect(snapshots).toHaveLength(0);
      expect(result.fetched.products).toBe(0);
      expect(result.fetched.prices).toBe(0);
    });
  });

  // ── Staging rows ──────────────────────────────────────────────────────

  describe("staging rows", () => {
    it("creates normal staging row with correct cents from non-zero avg", async () => {
      const { db } = createMockDb();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(db, log);

      const { staging } = upsertArgs();
      const normal = staging.find(
        (r: CardmarketStagingRow) => r.external_id === 845_712 && r.finish === "normal",
      );
      expect(normal).toBeDefined();
      expect(normal?.market_cents).toBe(4);
      expect(normal?.low_cents).toBe(2);
      expect(normal?.trend_cents).toBe(2);
      expect(normal?.avg1_cents).toBe(6);
      expect(normal?.avg7_cents).toBe(4);
      expect(normal?.avg30_cents).toBe(5);
      expect(normal?.product_name).toBe("Blazing Scorcher");
      expect(normal?.group_id).toBe(6286);
    });

    it("creates foil staging row with correct cents from non-zero avg-foil", async () => {
      const { db } = createMockDb();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(db, log);

      const { staging } = upsertArgs();
      const foil = staging.find(
        (r: CardmarketStagingRow) => r.external_id === 845_712 && r.finish === "foil",
      );
      expect(foil).toBeDefined();
      expect(foil?.market_cents).toBe(19);
      expect(foil?.low_cents).toBe(2);
      expect(foil?.trend_cents).toBe(23);
      expect(foil?.avg1_cents).toBe(12);
      expect(foil?.avg7_cents).toBe(19);
      expect(foil?.avg30_cents).toBe(19);
    });

    it("skips foil staging when avg-foil is 0", async () => {
      const { db } = createMockDb();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_ANNIE], [PRICE_ANNIE]);

      await refreshCardmarketPrices(db, log);

      const { staging } = upsertArgs();
      const foil = staging.find(
        (r: CardmarketStagingRow) => r.external_id === 847_277 && r.finish === "foil",
      );
      expect(foil).toBeUndefined();
    });

    it("skips normal staging when avg is 0", async () => {
      const { db } = createMockDb();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_TEEMO], [PRICE_TEEMO]);

      await refreshCardmarketPrices(db, log);

      const { staging } = upsertArgs();
      const normal = staging.find(
        (r: CardmarketStagingRow) => r.external_id === 847_140 && r.finish === "normal",
      );
      expect(normal).toBeUndefined();
    });

    it("creates foil-only staging for product with zero normal avg", async () => {
      const { db } = createMockDb();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_TEEMO], [PRICE_TEEMO]);

      await refreshCardmarketPrices(db, log);

      const { staging } = upsertArgs();
      const foil = staging.find(
        (r: CardmarketStagingRow) => r.external_id === 847_140 && r.finish === "foil",
      );
      expect(foil).toBeDefined();
      expect(foil?.market_cents).toBe(14);
    });

    it("skips products with no matching price guide", async () => {
      const { db } = createMockDb();
      const { log } = makeMockLogger();
      const orphan = { idProduct: 999_999, name: "No Price Card", idExpansion: 6286 };
      setupFetchJson(fetchJsonSpy, [orphan], []);

      await refreshCardmarketPrices(db, log);

      const { staging } = upsertArgs();
      expect(staging).toHaveLength(0);
    });

    it("skips ignored normal products but keeps foil", async () => {
      const { db } = createMockDb({
        ignoredProducts: [{ external_id: 845_712, finish: "normal" }],
      });
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(db, log);

      const { staging } = upsertArgs();
      expect(
        staging.find(
          (r: CardmarketStagingRow) => r.external_id === 845_712 && r.finish === "normal",
        ),
      ).toBeUndefined();
      expect(
        staging.find((r: CardmarketStagingRow) => r.external_id === 845_712 && r.finish === "foil"),
      ).toBeDefined();
    });

    it("skips ignored foil products but keeps normal", async () => {
      const { db } = createMockDb({
        ignoredProducts: [{ external_id: 845_712, finish: "foil" }],
      });
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(db, log);

      const { staging } = upsertArgs();
      expect(
        staging.find((r: CardmarketStagingRow) => r.external_id === 845_712 && r.finish === "foil"),
      ).toBeUndefined();
      expect(
        staging.find(
          (r: CardmarketStagingRow) => r.external_id === 845_712 && r.finish === "normal",
        ),
      ).toBeDefined();
    });

    it("stages products across multiple expansions", async () => {
      const { db } = createMockDb();
      const { log } = makeMockLogger();
      setupFetchJson(
        fetchJsonSpy,
        [PRODUCT_BLAZING, PRODUCT_ANNIE, PRODUCT_TEEMO],
        [PRICE_BLAZING, PRICE_ANNIE, PRICE_TEEMO],
      );

      await refreshCardmarketPrices(db, log);

      const { staging } = upsertArgs();
      // Blazing: normal + foil = 2
      // Annie: normal only (foil avg = 0) = 1
      // Teemo: foil only (normal avg = 0) = 1
      expect(staging).toHaveLength(4);
    });
  });

  // ── Snapshot rows ─────────────────────────────────────────────────────

  describe("snapshot rows", () => {
    it("creates snapshot for staging row with matching source", async () => {
      const { db } = createMockDb({
        existingSources: [{ printing_id: "print-001", external_id: 845_712, finish: "normal" }],
      });
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(db, log);

      const { snapshots } = upsertArgs();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].printing_id).toBe("print-001");
      expect(snapshots[0].market_cents).toBe(4);
      expect(snapshots[0].low_cents).toBe(2);
      expect(snapshots[0].trend_cents).toBe(2);
    });

    it("creates snapshots for both normal and foil mapped sources", async () => {
      const { db } = createMockDb({
        existingSources: [
          { printing_id: "print-001", external_id: 845_712, finish: "normal" },
          { printing_id: "print-002", external_id: 845_712, finish: "foil" },
        ],
      });
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(db, log);

      const { snapshots } = upsertArgs();
      expect(snapshots).toHaveLength(2);
      const ids = snapshots.map((s: CardmarketSnapshotData) => s.printing_id).sort();
      expect(ids).toEqual(["print-001", "print-002"]);
    });

    it("creates multiple snapshots when one source maps to multiple printings", async () => {
      const { db } = createMockDb({
        existingSources: [
          { printing_id: "print-001", external_id: 845_712, finish: "normal" },
          { printing_id: "print-003", external_id: 845_712, finish: "normal" },
        ],
      });
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(db, log);

      const { snapshots } = upsertArgs();
      const normalSnaps = snapshots.filter(
        (s: CardmarketSnapshotData) =>
          s.printing_id === "print-001" || s.printing_id === "print-003",
      );
      expect(normalSnaps).toHaveLength(2);
      expect(normalSnaps[0].market_cents).toBe(normalSnaps[1].market_cents);
    });

    it("produces no snapshots when no sources are mapped", async () => {
      const { db } = createMockDb({ existingSources: [] });
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(db, log);

      const { snapshots } = upsertArgs();
      expect(snapshots).toHaveLength(0);
    });

    it("skips foil snapshot when foil source exists but foil avg is 0", async () => {
      const { db } = createMockDb({
        existingSources: [
          { printing_id: "print-001", external_id: 847_277, finish: "normal" },
          { printing_id: "print-002", external_id: 847_277, finish: "foil" },
        ],
      });
      const { log } = makeMockLogger();
      // Annie: normal only, foil avg = 0 → no foil staging → no foil snapshot
      setupFetchJson(fetchJsonSpy, [PRODUCT_ANNIE], [PRICE_ANNIE]);

      await refreshCardmarketPrices(db, log);

      const { snapshots } = upsertArgs();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].printing_id).toBe("print-001");
    });
  });

  // ── Expansion upsert ──────────────────────────────────────────────────

  describe("expansion upsert", () => {
    it("collects unique expansion IDs from products", async () => {
      const { db, insertedExpansionIds } = createMockDb();
      const { log } = makeMockLogger();
      // Blazing & Teemo share 6286; Annie is 6289
      setupFetchJson(
        fetchJsonSpy,
        [PRODUCT_BLAZING, PRODUCT_ANNIE, PRODUCT_TEEMO],
        [PRICE_BLAZING, PRICE_ANNIE, PRICE_TEEMO],
      );

      await refreshCardmarketPrices(db, log);

      expect(insertedExpansionIds.sort()).toEqual([6286, 6289]);
    });

    it("does not insert expansions when there are no products", async () => {
      const { db, insertedExpansionIds } = createMockDb();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [], []);

      await refreshCardmarketPrices(db, log);

      expect(insertedExpansionIds).toHaveLength(0);
    });
  });

  // ── recorded_at ───────────────────────────────────────────────────────

  describe("recorded_at", () => {
    it("uses createdAt from response body when available", async () => {
      const { db } = createMockDb();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING], {
        createdAt: "2026-03-10T02:49:27+0100",
      });

      await refreshCardmarketPrices(db, log);

      const { staging } = upsertArgs();
      expect(staging[0].recorded_at).toEqual(new Date("2026-03-10T02:49:27+0100"));
    });

    it("falls back to lastModified when createdAt is absent", async () => {
      const { db } = createMockDb();
      const { log } = makeMockLogger();
      const lastMod = new Date("2026-03-09T12:00:00Z");
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING], {
        createdAt: undefined,
        lastModified: lastMod,
      });

      await refreshCardmarketPrices(db, log);

      const { staging } = upsertArgs();
      expect(staging[0].recorded_at).toEqual(lastMod);
    });

    it("falls back to current time when neither createdAt nor lastModified exist", async () => {
      const { db } = createMockDb();
      const { log } = makeMockLogger();
      const before = Date.now();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING], {
        createdAt: undefined,
        lastModified: null,
      });

      await refreshCardmarketPrices(db, log);

      const { staging } = upsertArgs();
      const ts = staging[0].recorded_at.getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(Date.now());
    });
  });

  // ── upsertPriceData call ────────────────────────────────────

  describe("upsertPriceData call", () => {
    it("passes db as first argument", async () => {
      const { db } = createMockDb();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [], []);

      await refreshCardmarketPrices(db, log);

      expect(upsertSpy.mock.calls[0][0]).toBe(db);
    });
  });

  // ── Return value ──────────────────────────────────────────────────────

  describe("return value", () => {
    it("returns correct fetched counts", async () => {
      const { db } = createMockDb({
        expansions: [{ expansion_id: 6286 }, { expansion_id: 6289 }],
      });
      const { log } = makeMockLogger();
      setupFetchJson(
        fetchJsonSpy,
        [PRODUCT_BLAZING, PRODUCT_ANNIE, PRODUCT_TEEMO],
        [PRICE_BLAZING, PRICE_ANNIE, PRICE_TEEMO],
      );

      const result = await refreshCardmarketPrices(db, log);

      expect(result.fetched).toEqual({
        groups: 2,
        products: 3,
        prices: 3,
      });
    });

    it("returns upsert counts from upsertPriceData", async () => {
      const { db } = createMockDb();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [], []);
      const customCounts: UpsertCounts = {
        sources: { total: 0, new: 0, updated: 0, unchanged: 0 },
        snapshots: { total: 20, new: 10, updated: 5, unchanged: 5 },
        staging: { total: 15, new: 8, updated: 4, unchanged: 3 },
      };
      upsertSpy.mockResolvedValue(customCounts);

      const result = await refreshCardmarketPrices(db, log);

      expect(result.upserted).toBe(customCounts);
    });
  });

  // ── Logging ───────────────────────────────────────────────────────────

  describe("logging", () => {
    it("logs snapshot count when snapshots exist", async () => {
      const { db } = createMockDb({
        existingSources: [{ printing_id: "print-001", external_id: 845_712, finish: "normal" }],
      });
      const { log, messages } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(db, log);

      expect(
        messages.some((m) => m.includes("1 snapshots") && m.includes("1 mapped sources")),
      ).toBe(true);
    });

    it("does not log snapshot line when there are no snapshots", async () => {
      const { db } = createMockDb();
      const { log, messages } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(db, log);

      expect(messages.some((m) => m.includes("snapshots") && m.includes("mapped sources"))).toBe(
        false,
      );
    });

    it("logs fetched summary with expansion and product counts", async () => {
      const { db } = createMockDb({
        expansions: [{ expansion_id: 6286 }, { expansion_id: 6289 }],
      });
      const { log, messages } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING, PRODUCT_ANNIE], [PRICE_BLAZING, PRICE_ANNIE]);

      await refreshCardmarketPrices(db, log);

      const summary = messages.find((m) => m.startsWith("Fetched:"));
      expect(summary).toBeDefined();
      expect(summary).toContain("2 expansions");
      expect(summary).toContain("2 products");
      expect(summary).toContain("2 prices");
    });

    it("includes ignored count in summary when products are ignored", async () => {
      const { db } = createMockDb({
        ignoredProducts: [
          { external_id: 845_712, finish: "normal" },
          { external_id: 845_712, finish: "foil" },
        ],
      });
      const { log, messages } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(db, log);

      const summary = messages.find((m) => m.startsWith("Fetched:"));
      expect(summary).toContain("2 ignored");
    });

    it("omits ignored suffix when no products are ignored", async () => {
      const { db } = createMockDb();
      const { log, messages } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(db, log);

      const summary = messages.find((m) => m.startsWith("Fetched:"));
      expect(summary).not.toContain("ignored");
    });

    it("calls logUpsertCounts with logger and counts", async () => {
      const { db } = createMockDb();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [], []);

      await refreshCardmarketPrices(db, log);

      expect(logUpsertSpy).toHaveBeenCalledWith(log, ZERO_COUNTS);
    });
  });
});
