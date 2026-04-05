import type { Logger } from "@openrift/shared/logger";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos } from "../../deps";
import type { Fetch } from "../../io";
import { refreshCardmarketPrices } from "./cardmarket";
import * as fetchMod from "./fetch";
import * as logMod from "./log";
import type { StagingRow, UpsertCounts } from "./types";
import * as upsertMod from "./upsert";

const stubFetch: Fetch = (() => {
  throw new Error("unexpected real fetch");
}) as unknown as Fetch;

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

interface MockReposConfig {
  ignoredProducts?: { externalId: number; finish: string }[];
}

function createMockRepos(config: MockReposConfig = {}) {
  const insertedExpansionIds: number[] = [];

  const ignoredKeys = new Set(
    (config.ignoredProducts ?? []).map((p) => `${p.externalId}::${p.finish}::EN`),
  );

  const repos = {
    priceRefresh: {
      loadIgnoredKeys: async () => ignoredKeys,
      upsertGroups: async (_marketplace: string, groups: { groupId: number }[]) => {
        for (const g of groups) {
          insertedExpansionIds.push(g.groupId);
        }
      },
    },
  } as unknown as Repos;

  return { repos, insertedExpansionIds };
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

  fetchJsonSpy.mockImplementation(async (_fetchFn: Fetch, url: string) => {
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

  function upsertStaging(): StagingRow[] {
    return upsertSpy.mock.calls[0][3];
  }

  beforeEach(() => {
    fetchJsonSpy = vi.spyOn(fetchMod, "fetchJson" as any).mockResolvedValue({
      data: {},
      lastModified: null,
    });
    upsertSpy = vi.spyOn(upsertMod, "upsertPriceData" as any).mockResolvedValue(ZERO_COUNTS);
    logUpsertSpy = vi.spyOn(logMod, "logUpsertCounts" as any);
  });

  afterEach(() => {
    fetchJsonSpy.mockRestore();
    upsertSpy.mockRestore();
    logUpsertSpy.mockRestore();
  });

  // ── Fetch URLs ────────────────────────────────────────────────────────

  describe("API fetch", () => {
    it("fetches price guide and singles from Cardmarket S3 endpoints", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [], []);

      await refreshCardmarketPrices(stubFetch, repos, log);

      const urls = fetchJsonSpy.mock.calls.map((c: unknown[]) => c[1]);
      expect(urls).toContainEqual(
        "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_22.json",
      );
      expect(urls).toContainEqual(
        "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_22.json",
      );
    });

    it("handles empty API responses gracefully", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();

      const result = await refreshCardmarketPrices(stubFetch, repos, log);

      const staging = upsertStaging();
      expect(staging).toHaveLength(0);
      expect(result.transformed.products).toBe(0);
      expect(result.transformed.prices).toBe(0);
    });
  });

  // ── Staging rows ──────────────────────────────────────────────────────

  describe("staging rows", () => {
    it("creates normal staging row with correct cents from non-zero avg", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(stubFetch, repos, log);

      const staging = upsertStaging();
      const normal = staging.find(
        (r: StagingRow) => r.externalId === 845_712 && r.finish === "normal",
      );
      expect(normal).toBeDefined();
      expect(normal?.marketCents).toBe(4);
      expect(normal?.lowCents).toBe(2);
      expect(normal?.trendCents).toBe(2);
      expect(normal?.avg1Cents).toBe(6);
      expect(normal?.avg7Cents).toBe(4);
      expect(normal?.avg30Cents).toBe(5);
      expect(normal?.productName).toBe("Blazing Scorcher");
      expect(normal?.groupId).toBe(6286);
    });

    it("creates foil staging row with correct cents from non-zero avg-foil", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(stubFetch, repos, log);

      const staging = upsertStaging();
      const foil = staging.find((r: StagingRow) => r.externalId === 845_712 && r.finish === "foil");
      expect(foil).toBeDefined();
      expect(foil?.marketCents).toBe(19);
      expect(foil?.lowCents).toBe(2);
      expect(foil?.trendCents).toBe(23);
      expect(foil?.avg1Cents).toBe(12);
      expect(foil?.avg7Cents).toBe(19);
      expect(foil?.avg30Cents).toBe(19);
    });

    it("skips foil staging when avg-foil is 0", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_ANNIE], [PRICE_ANNIE]);

      await refreshCardmarketPrices(stubFetch, repos, log);

      const staging = upsertStaging();
      const foil = staging.find((r: StagingRow) => r.externalId === 847_277 && r.finish === "foil");
      expect(foil).toBeUndefined();
    });

    it("skips normal staging when avg is 0", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_TEEMO], [PRICE_TEEMO]);

      await refreshCardmarketPrices(stubFetch, repos, log);

      const staging = upsertStaging();
      const normal = staging.find(
        (r: StagingRow) => r.externalId === 847_140 && r.finish === "normal",
      );
      expect(normal).toBeUndefined();
    });

    it("creates foil-only staging for product with zero normal avg", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_TEEMO], [PRICE_TEEMO]);

      await refreshCardmarketPrices(stubFetch, repos, log);

      const staging = upsertStaging();
      const foil = staging.find((r: StagingRow) => r.externalId === 847_140 && r.finish === "foil");
      expect(foil).toBeDefined();
      expect(foil?.marketCents).toBe(14);
    });

    it("skips products with no matching price guide", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      const orphan = { idProduct: 999_999, name: "No Price Card", idExpansion: 6286 };
      setupFetchJson(fetchJsonSpy, [orphan], []);

      await refreshCardmarketPrices(stubFetch, repos, log);

      const staging = upsertStaging();
      expect(staging).toHaveLength(0);
    });

    it("skips ignored normal products but keeps foil", async () => {
      const { repos } = createMockRepos({
        ignoredProducts: [{ externalId: 845_712, finish: "normal" }],
      });
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(stubFetch, repos, log);

      const staging = upsertStaging();
      expect(
        staging.find((r: StagingRow) => r.externalId === 845_712 && r.finish === "normal"),
      ).toBeUndefined();
      expect(
        staging.find((r: StagingRow) => r.externalId === 845_712 && r.finish === "foil"),
      ).toBeDefined();
    });

    it("skips ignored foil products but keeps normal", async () => {
      const { repos } = createMockRepos({
        ignoredProducts: [{ externalId: 845_712, finish: "foil" }],
      });
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(stubFetch, repos, log);

      const staging = upsertStaging();
      expect(
        staging.find((r: StagingRow) => r.externalId === 845_712 && r.finish === "foil"),
      ).toBeUndefined();
      expect(
        staging.find((r: StagingRow) => r.externalId === 845_712 && r.finish === "normal"),
      ).toBeDefined();
    });

    it("stages products across multiple expansions", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupFetchJson(
        fetchJsonSpy,
        [PRODUCT_BLAZING, PRODUCT_ANNIE, PRODUCT_TEEMO],
        [PRICE_BLAZING, PRICE_ANNIE, PRICE_TEEMO],
      );

      await refreshCardmarketPrices(stubFetch, repos, log);

      const staging = upsertStaging();
      // Blazing: normal + foil = 2
      // Annie: normal only (foil avg = 0) = 1
      // Teemo: foil only (normal avg = 0) = 1
      expect(staging).toHaveLength(4);
    });
  });

  // ── Expansion upsert ──────────────────────────────────────────────────

  describe("expansion upsert", () => {
    it("collects unique expansion IDs from products", async () => {
      const { repos, insertedExpansionIds } = createMockRepos();
      const { log } = makeMockLogger();
      // Blazing & Teemo share 6286; Annie is 6289
      setupFetchJson(
        fetchJsonSpy,
        [PRODUCT_BLAZING, PRODUCT_ANNIE, PRODUCT_TEEMO],
        [PRICE_BLAZING, PRICE_ANNIE, PRICE_TEEMO],
      );

      await refreshCardmarketPrices(stubFetch, repos, log);

      expect(insertedExpansionIds.sort()).toEqual([6286, 6289]);
    });

    it("does not insert expansions when there are no products", async () => {
      const { repos, insertedExpansionIds } = createMockRepos();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [], []);

      await refreshCardmarketPrices(stubFetch, repos, log);

      expect(insertedExpansionIds).toHaveLength(0);
    });
  });

  // ── recordedAt ────────────────────────────────────────────────────────

  describe("recordedAt", () => {
    it("uses createdAt from response body when available", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING], {
        createdAt: "2026-03-10T02:49:27+0100",
      });

      await refreshCardmarketPrices(stubFetch, repos, log);

      const staging = upsertStaging();
      expect(staging[0].recordedAt).toEqual(new Date("2026-03-10T02:49:27+0100"));
    });

    it("falls back to lastModified when createdAt is absent", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      const lastMod = new Date("2026-03-09T12:00:00Z");
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING], {
        createdAt: undefined,
        lastModified: lastMod,
      });

      await refreshCardmarketPrices(stubFetch, repos, log);

      const staging = upsertStaging();
      expect(staging[0].recordedAt).toEqual(lastMod);
    });

    it("falls back to current time when neither createdAt nor lastModified exist", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      const before = Date.now();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING], {
        createdAt: undefined,
        lastModified: null,
      });

      await refreshCardmarketPrices(stubFetch, repos, log);

      const staging = upsertStaging();
      const ts = staging[0].recordedAt.getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(Date.now());
    });
  });

  // ── upsertPriceData call ────────────────────────────────────

  describe("upsertPriceData call", () => {
    it("passes repos.priceRefresh as first argument", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [], []);

      await refreshCardmarketPrices(stubFetch, repos, log);

      expect(upsertSpy.mock.calls[0][0]).toBe(repos.priceRefresh);
    });
  });

  // ── Return value ──────────────────────────────────────────────────────

  describe("return value", () => {
    it("returns correct fetched counts", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupFetchJson(
        fetchJsonSpy,
        [PRODUCT_BLAZING, PRODUCT_ANNIE, PRODUCT_TEEMO],
        [PRICE_BLAZING, PRICE_ANNIE, PRICE_TEEMO],
      );

      const result = await refreshCardmarketPrices(stubFetch, repos, log);

      expect(result.transformed).toEqual({
        groups: 2,
        products: 3,
        // Blazing: normal + foil, Annie: normal only, Teemo: foil only
        prices: 4,
      });
    });

    it("returns upsert counts from upsertPriceData", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [], []);
      const customCounts: UpsertCounts = {
        snapshots: { total: 20, new: 10, updated: 5, unchanged: 5 },
        staging: { total: 15, new: 8, updated: 4, unchanged: 3 },
      };
      upsertSpy.mockResolvedValue(customCounts);

      const result = await refreshCardmarketPrices(stubFetch, repos, log);

      expect(result.upserted).toBe(customCounts);
    });
  });

  // ── Logging ───────────────────────────────────────────────────────────

  describe("logging", () => {
    it("logs fetched summary with expansion and product counts", async () => {
      const { repos } = createMockRepos();
      const { log, messages } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING, PRODUCT_ANNIE], [PRICE_BLAZING, PRICE_ANNIE]);

      await refreshCardmarketPrices(stubFetch, repos, log);

      const summary = messages.find((m) => m.startsWith("Fetched:"));
      expect(summary).toBeDefined();
      expect(summary).toContain("2 groups");
      expect(summary).toContain("2 products");
      expect(summary).toContain("3 prices");
    });

    it("includes ignored count in summary when products are ignored", async () => {
      const { repos } = createMockRepos({
        ignoredProducts: [
          { externalId: 845_712, finish: "normal" },
          { externalId: 845_712, finish: "foil" },
        ],
      });
      const { log, messages } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(stubFetch, repos, log);

      const summary = messages.find((m) => m.startsWith("Fetched:"));
      expect(summary).toContain("2 ignored");
    });

    it("omits ignored suffix when no products are ignored", async () => {
      const { repos } = createMockRepos();
      const { log, messages } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(stubFetch, repos, log);

      const summary = messages.find((m) => m.startsWith("Fetched:"));
      expect(summary).not.toContain("ignored");
    });

    it("calls logUpsertCounts with logger and counts", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [], []);

      await refreshCardmarketPrices(stubFetch, repos, log);

      expect(logUpsertSpy).toHaveBeenCalledWith(log, ZERO_COUNTS);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles both normal and foil for the same product in staging", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(stubFetch, repos, log);

      const staging = upsertStaging();
      const normalRow = staging.find(
        (row: StagingRow) => row.externalId === 845_712 && row.finish === "normal",
      );
      const foilRow = staging.find(
        (row: StagingRow) => row.externalId === 845_712 && row.finish === "foil",
      );
      expect(normalRow).toBeDefined();
      expect(foilRow).toBeDefined();
    });

    it("sets midCents and highCents to null for Cardmarket", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(stubFetch, repos, log);

      const staging = upsertStaging();
      expect(staging[0].midCents).toBeNull();
      expect(staging[0].highCents).toBeNull();
    });

    it("upserts cardmarket marketplace config", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING], [PRICE_BLAZING]);

      await refreshCardmarketPrices(stubFetch, repos, log);

      // Config should be "cardmarket"
      expect(upsertSpy.mock.calls[0][2]).toEqual({ marketplace: "cardmarket" });
    });

    it("correctly computes group rows from unique expansion IDs", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      // Two products in the same expansion
      const product2 = { idProduct: 845_713, name: "Another Card", idExpansion: 6286 };
      setupFetchJson(fetchJsonSpy, [PRODUCT_BLAZING, product2], [PRICE_BLAZING]);

      const result = await refreshCardmarketPrices(stubFetch, repos, log);

      // Only one unique expansion
      expect(result.transformed.groups).toBe(1);
      expect(result.transformed.products).toBe(2);
    });
  });
});
