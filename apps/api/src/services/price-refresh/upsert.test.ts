import type { Logger } from "@openrift/shared/logger";
import { describe, expect, it } from "vitest";

import type { Repos } from "../../deps";
import type { LoadedIgnoredKeys } from "../../repositories/price-refresh";
import type { GroupRow, PriceUpsertConfig, StagingRow } from "./types";
import { loadIgnoredKeys, upsertMarketplaceGroups, upsertPriceData } from "./upsert";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockLogger(): { log: Logger; messages: string[] } {
  const messages: string[] = [];
  const log = {
    info: (msg: string) => messages.push(msg),
  } as unknown as Logger;
  return { log, messages };
}

// oxlint-disable-next-line no-empty-function -- noop logger for tests
const noop = () => {};
const noopLogger = { info: noop, warn: noop, error: noop, debug: noop } as unknown as Logger;

function makeStagingRow(
  extId: number,
  finish: string,
  prices: Partial<StagingRow> = {},
): StagingRow {
  return {
    externalId: extId,
    groupId: 1001,
    productName: "Test Product",
    finish,
    language: "EN",
    recordedAt: new Date("2026-03-10T00:00:00Z"),
    marketCents: 100,
    lowCents: null,
    zeroLowCents: null,
    midCents: null,
    highCents: null,
    trendCents: null,
    avg1Cents: null,
    avg7Cents: null,
    avg30Cents: null,
    ...prices,
  };
}

function emptyIgnoredKeys(): LoadedIgnoredKeys {
  return { productIds: new Set<number>(), variantKeys: new Set<string>() };
}

/**
 * Build a mock `priceRefresh` repo. `upsertProductsForMarketplace` returns a
 * product id per SKU by generating a stable key so tests can assert the same
 * id appears in price rows keyed on it.
 *
 * @returns A mock repo plus helpers for asserting calls + inspecting
 *          `upsertProductPrices` input rows.
 */
function makeMockRepo(opts: { ignoredKeys?: LoadedIgnoredKeys; countResult?: number }) {
  const ignoredKeys = opts.ignoredKeys ?? emptyIgnoredKeys();
  const countResult = opts.countResult ?? 0;
  let upsertGroupsCalled = false;
  let upsertGroupsArgs: unknown[] = [];
  const upsertedPrices: { marketplaceProductId: string; recordedAt: Date }[] = [];

  const repo = {
    loadIgnoredKeys: async () => ignoredKeys,
    upsertGroups: async (...args: unknown[]) => {
      upsertGroupsCalled = true;
      upsertGroupsArgs = args;
    },
    upsertProductsForMarketplace: async (
      _marketplace: string,
      skus: {
        externalId: number;
        finish: string;
        language: string | null;
        groupId: number;
        productName: string;
      }[],
    ) =>
      skus.map((s) => ({
        id: `mp-${s.externalId}-${s.finish}-${s.language ?? ""}`,
        externalId: s.externalId,
        finish: s.finish,
        language: s.language,
      })),
    countProductPrices: async () => countResult,
    countStaging: async () => countResult,
    upsertProductPrices: async (batch: { marketplaceProductId: string; recordedAt: Date }[]) => {
      for (const row of batch) {
        upsertedPrices.push({
          marketplaceProductId: row.marketplaceProductId,
          recordedAt: row.recordedAt,
        });
      }
      return 0;
    },
    upsertStaging: async () => 0,
  } as unknown as Repos["priceRefresh"];

  return {
    repo,
    wasUpsertGroupsCalled: () => upsertGroupsCalled,
    upsertGroupsArgs: () => upsertGroupsArgs,
    upsertedPrices,
  };
}

// ---------------------------------------------------------------------------
// loadIgnoredKeys
// ---------------------------------------------------------------------------

describe("loadIgnoredKeys", () => {
  it("returns LoadedIgnoredKeys with productIds and variantKeys", async () => {
    const expected: LoadedIgnoredKeys = {
      productIds: new Set([123]),
      variantKeys: new Set(["123::normal::EN", "456::foil::EN"]),
    };
    const { repo } = makeMockRepo({ ignoredKeys: expected });

    const result = await loadIgnoredKeys(repo, "cardmarket");

    expect(result.productIds.has(123)).toBe(true);
    expect(result.variantKeys.has("123::normal::EN")).toBe(true);
    expect(result.variantKeys.has("456::foil::EN")).toBe(true);
  });

  it("returns empty sets when nothing ignored", async () => {
    const { repo } = makeMockRepo({});

    const result = await loadIgnoredKeys(repo, "tcgplayer");

    expect(result.productIds.size).toBe(0);
    expect(result.variantKeys.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// upsertMarketplaceGroups
// ---------------------------------------------------------------------------

describe("upsertMarketplaceGroups", () => {
  it("calls upsertGroups even for empty array (repo handles empty)", async () => {
    const { repo, wasUpsertGroupsCalled } = makeMockRepo({});

    await upsertMarketplaceGroups(repo, "cardmarket", []);

    expect(wasUpsertGroupsCalled()).toBe(true);
  });

  it("calls upsertGroups when groups are provided", async () => {
    const { repo, wasUpsertGroupsCalled, upsertGroupsArgs } = makeMockRepo({});

    const groups: GroupRow[] = [
      { groupId: 101, name: "Core Set", abbreviation: "CS" },
      { groupId: 102 },
    ];

    await upsertMarketplaceGroups(repo, "tcgplayer", groups);

    expect(wasUpsertGroupsCalled()).toBe(true);
    expect(upsertGroupsArgs()[0]).toBe("tcgplayer");
    expect(upsertGroupsArgs()[1]).toEqual(groups);
  });
});

// ---------------------------------------------------------------------------
// upsertPriceData
// ---------------------------------------------------------------------------

describe("upsertPriceData", () => {
  const config: PriceUpsertConfig = { marketplace: "cardmarket" };

  it("returns zeroed counts for empty staging input", async () => {
    const { repo } = makeMockRepo({});
    const counts = await upsertPriceData(repo, noopLogger, config, []);

    expect(counts.prices.total).toBe(0);
    expect(counts.prices.new).toBe(0);
    expect(counts.prices.updated).toBe(0);
    expect(counts.prices.unchanged).toBe(0);
  });

  it("writes one price row per staging SKU", async () => {
    const { log, messages } = makeMockLogger();
    const { repo, upsertedPrices } = makeMockRepo({});
    const staging = [makeStagingRow(1001, "normal")];

    const counts = await upsertPriceData(repo, log, config, staging);

    expect(counts.prices.total).toBe(1);
    expect(upsertedPrices).toHaveLength(1);
    expect(upsertedPrices[0].marketplaceProductId).toBe("mp-1001-normal-EN");
    expect(messages.some((m) => m.includes("1 price rows"))).toBe(true);
  });

  it("collapses multiple staging rows for the same SKU into one price row per recorded_at", async () => {
    const { repo, upsertedPrices } = makeMockRepo({});
    // Two staging rows for the exact same SKU + recorded_at — the price-row
    // dedup key is `(product_id, recorded_at)`, so these become one row.
    const row1 = makeStagingRow(2001, "normal", { marketCents: 100 });
    const row2 = makeStagingRow(2001, "normal", { marketCents: 200 });

    const counts = await upsertPriceData(repo, noopLogger, config, [row1, row2]);

    expect(counts.prices.total).toBe(1);
    expect(upsertedPrices).toHaveLength(1);
  });

  it("keeps separate price rows for different recordedAt on the same SKU", async () => {
    const { repo, upsertedPrices } = makeMockRepo({});
    const row1 = makeStagingRow(4001, "normal");
    const row2 = {
      ...makeStagingRow(4001, "normal"),
      recordedAt: new Date("2026-03-11T00:00:00Z"),
    };

    const counts = await upsertPriceData(repo, noopLogger, config, [row1, row2]);

    expect(counts.prices.total).toBe(2);
    expect(upsertedPrices).toHaveLength(2);
    expect(upsertedPrices[0].marketplaceProductId).toBe(upsertedPrices[1].marketplaceProductId);
  });

  it("keeps separate price rows for different finishes on the same external_id", async () => {
    const { repo, upsertedPrices } = makeMockRepo({});
    const normal = makeStagingRow(3001, "normal");
    const foil = makeStagingRow(3001, "foil");

    const counts = await upsertPriceData(repo, noopLogger, config, [normal, foil]);

    expect(counts.prices.total).toBe(2);
    const productIds = new Set(upsertedPrices.map((r) => r.marketplaceProductId));
    expect(productIds.size).toBe(2);
  });

  it("does not log a price-count message when there are no prices to write", async () => {
    const { log, messages } = makeMockLogger();
    const { repo } = makeMockRepo({});

    await upsertPriceData(repo, log, config, []);

    expect(messages.some((m) => m.includes("price rows"))).toBe(false);
  });

  it("treats language=null SKUs (CM/TCG) as a distinct product from language='EN'", async () => {
    const { repo, upsertedPrices } = makeMockRepo({});
    const staging = [
      { ...makeStagingRow(12_345, "normal"), language: null },
      { ...makeStagingRow(12_345, "normal"), language: "EN" },
    ];

    const counts = await upsertPriceData(repo, noopLogger, config, staging);

    expect(counts.prices.total).toBe(2);
    const productIds = new Set(upsertedPrices.map((r) => r.marketplaceProductId));
    expect(productIds.size).toBe(2);
  });

  it("pins per-language product rows for marketplaces that expose language (CT)", async () => {
    const ctConfig: PriceUpsertConfig = { marketplace: "cardtrader" };
    const { repo, upsertedPrices } = makeMockRepo({});
    const staging = [
      { ...makeStagingRow(54_321, "normal"), language: "EN" },
      { ...makeStagingRow(54_321, "normal"), language: "ZH" },
    ];

    const counts = await upsertPriceData(repo, noopLogger, ctConfig, staging);

    expect(counts.prices.total).toBe(2);
    const productIds = new Set(upsertedPrices.map((r) => r.marketplaceProductId));
    expect(productIds.size).toBe(2);
  });
});
