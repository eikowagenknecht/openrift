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

function makeMockRepo(opts: {
  ignoredKeys?: LoadedIgnoredKeys;
  variants?: {
    id: string;
    printingId: string;
    externalId: number;
    finish: string;
    language: string | null;
  }[];
  countResult?: number;
}) {
  const ignoredKeys = opts.ignoredKeys ?? emptyIgnoredKeys();
  const variants = opts.variants ?? [];
  const countResult = opts.countResult ?? 0;
  let upsertGroupsCalled = false;
  let upsertGroupsArgs: unknown[] = [];

  const repo = {
    loadIgnoredKeys: async () => ignoredKeys,
    upsertGroups: async (...args: unknown[]) => {
      upsertGroupsCalled = true;
      upsertGroupsArgs = args;
    },
    variantsWithFinish: async () => variants,
    countSnapshots: async () => countResult,
    countStaging: async () => countResult,
    upsertSnapshots: async () => 0,
    upsertStaging: async () => 0,
  } as unknown as Repos["priceRefresh"];

  return {
    repo,
    wasUpsertGroupsCalled: () => upsertGroupsCalled,
    upsertGroupsArgs: () => upsertGroupsArgs,
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

    expect(counts.snapshots.total).toBe(0);
    expect(counts.snapshots.new).toBe(0);
    expect(counts.snapshots.updated).toBe(0);
    expect(counts.snapshots.unchanged).toBe(0);
    expect(counts.staging.total).toBe(0);
    expect(counts.staging.new).toBe(0);
    expect(counts.staging.updated).toBe(0);
    expect(counts.staging.unchanged).toBe(0);
  });

  it("builds no snapshots when no variants are mapped", async () => {
    const { repo } = makeMockRepo({ variants: [] });
    const staging = [makeStagingRow(999, "normal")];

    const counts = await upsertPriceData(repo, noopLogger, config, staging);

    expect(counts.snapshots.total).toBe(0);
    // Staging should still be processed
    expect(counts.staging.total).toBe(1);
  });

  it("builds snapshots when variants match staging entries", async () => {
    const { log, messages } = makeMockLogger();
    const { repo } = makeMockRepo({
      variants: [
        {
          id: "var-1",
          printingId: "print-1",
          externalId: 1001,
          finish: "normal",
          language: "EN",
        },
      ],
    });
    const staging = [makeStagingRow(1001, "normal")];

    const counts = await upsertPriceData(repo, log, config, staging);

    // One variant maps to one snapshot
    expect(counts.snapshots.total).toBe(1);
    // Log message should mention the snapshot count
    expect(messages.some((m) => m.includes("1 snapshots") || m.includes("1 snapshot"))).toBe(true);
  });

  it("deduplicates staging by (externalId, finish, language, recordedAt)", async () => {
    const { repo } = makeMockRepo({});
    const row1 = makeStagingRow(2001, "normal", { marketCents: 100 });
    const row2 = makeStagingRow(2001, "normal", { marketCents: 200 });
    // Same externalId, finish, language, and recordedAt — should deduplicate to 1

    const counts = await upsertPriceData(repo, noopLogger, config, [row1, row2]);

    expect(counts.staging.total).toBe(1);
  });

  it("keeps separate staging entries for different finishes", async () => {
    const { repo } = makeMockRepo({});
    const normal = makeStagingRow(3001, "normal");
    const foil = makeStagingRow(3001, "foil");

    const counts = await upsertPriceData(repo, noopLogger, config, [normal, foil]);

    expect(counts.staging.total).toBe(2);
  });

  it("keeps separate staging entries for different recordedAt", async () => {
    const { repo } = makeMockRepo({});
    const row1 = makeStagingRow(4001, "normal");
    const row2 = {
      ...makeStagingRow(4001, "normal"),
      recordedAt: new Date("2026-03-11T00:00:00Z"),
    };

    const counts = await upsertPriceData(repo, noopLogger, config, [row1, row2]);

    expect(counts.staging.total).toBe(2);
  });

  it("maps multiple variants to multiple snapshots for same externalId+finish", async () => {
    const { log } = makeMockLogger();
    const { repo } = makeMockRepo({
      variants: [
        {
          id: "var-1",
          printingId: "print-1",
          externalId: 5001,
          finish: "normal",
          language: "EN",
        },
        {
          id: "var-2",
          printingId: "print-2",
          externalId: 5001,
          finish: "normal",
          language: "EN",
        },
      ],
    });
    const staging = [makeStagingRow(5001, "normal")];

    const counts = await upsertPriceData(repo, log, config, staging);

    // Two variants mapped to the same external_id::finish::language -> 2 snapshots
    expect(counts.snapshots.total).toBe(2);
  });

  it("does not log snapshot info message when there are no snapshots", async () => {
    const { log, messages } = makeMockLogger();
    const { repo } = makeMockRepo({ variants: [] });
    const staging = [makeStagingRow(9999, "normal")];

    await upsertPriceData(repo, log, config, staging);

    // Should not have the "N snapshots for M mapped variants" message
    expect(messages.some((m) => m.includes("snapshots"))).toBe(false);
  });

  it("matches staging EN rows against NULL-language variants when languageAggregate is true", async () => {
    // Cardmarket's price guide is cross-language. Staging rows carry a
    // placeholder language ("EN") but the matched variants in the DB have
    // `language = NULL`. With the `languageAggregate: true` config flag, the
    // matcher ignores the language dimension and pairs them purely on
    // (externalId, finish) — so the staging row finds its variant.
    const aggregateConfig: PriceUpsertConfig = {
      marketplace: "cardmarket",
      languageAggregate: true,
    };
    const { repo } = makeMockRepo({
      variants: [
        {
          id: "var-cm",
          printingId: "print-en",
          externalId: 12_345,
          finish: "normal",
          language: null,
        },
      ],
    });
    // Staging row from the CM scraper with the placeholder "EN".
    const staging = [makeStagingRow(12_345, "normal")];

    const counts = await upsertPriceData(repo, noopLogger, aggregateConfig, staging);

    // Under the old strict key ("...::EN" vs "...::null") this would be 0.
    expect(counts.snapshots.total).toBe(1);
  });

  it("still pins per-language variants when languageAggregate is false", async () => {
    const exactConfig: PriceUpsertConfig = {
      marketplace: "cardtrader",
      languageAggregate: false,
    };
    const { repo } = makeMockRepo({
      variants: [
        {
          id: "var-en",
          printingId: "print-en",
          externalId: 54_321,
          finish: "normal",
          language: "EN",
        },
        {
          id: "var-zh",
          printingId: "print-zh",
          externalId: 54_321,
          finish: "normal",
          language: "ZH",
        },
      ],
    });
    // Two staging rows for the same external_id × finish, differing only on language.
    const staging = [
      { ...makeStagingRow(54_321, "normal"), language: "EN" },
      { ...makeStagingRow(54_321, "normal"), language: "ZH" },
    ];

    const counts = await upsertPriceData(repo, noopLogger, exactConfig, staging);

    // EN row goes to var-en, ZH row goes to var-zh — two distinct snapshots.
    expect(counts.snapshots.total).toBe(2);
  });
});
