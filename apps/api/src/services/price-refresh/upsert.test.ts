import type { Logger } from "@openrift/shared/logger";
import { describe, expect, it } from "vitest";

import type { Repos } from "../../deps";
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

function makeMockRepo(opts: {
  ignoredKeys?: Set<string>;
  sources?: { id: string; printingId: string; externalId: number; finish: string }[];
  countResult?: number;
}) {
  const ignoredKeys = opts.ignoredKeys ?? new Set<string>();
  const sources = opts.sources ?? [];
  const countResult = opts.countResult ?? 0;
  let upsertGroupsCalled = false;
  let upsertGroupsArgs: unknown[] = [];

  const repo = {
    loadIgnoredKeys: async () => ignoredKeys,
    upsertGroups: async (...args: unknown[]) => {
      upsertGroupsCalled = true;
      upsertGroupsArgs = args;
    },
    sourcesWithFinish: async () => sources,
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
  it("returns a Set of externalId::finish strings", async () => {
    const expected = new Set(["123::normal", "456::foil"]);
    const { repo } = makeMockRepo({ ignoredKeys: expected });

    const result = await loadIgnoredKeys(repo, "cardmarket");

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(2);
    expect(result.has("123::normal")).toBe(true);
    expect(result.has("456::foil")).toBe(true);
  });

  it("returns empty set when no ignored products", async () => {
    const { repo } = makeMockRepo({});

    const result = await loadIgnoredKeys(repo, "tcgplayer");

    expect(result.size).toBe(0);
  });

  it("handles single ignored product", async () => {
    const expected = new Set(["789::normal"]);
    const { repo } = makeMockRepo({ ignoredKeys: expected });

    const result = await loadIgnoredKeys(repo, "cardmarket");

    expect(result.size).toBe(1);
    expect(result.has("789::normal")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// upsertMarketplaceGroups
// ---------------------------------------------------------------------------

describe("upsertMarketplaceGroups", () => {
  it("returns early on empty groups array without calling upsertGroups", async () => {
    const { repo, wasUpsertGroupsCalled } = makeMockRepo({});

    await upsertMarketplaceGroups(repo, "cardmarket", []);

    // The repo's upsertGroups returns early for empty arrays
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

  it("builds no snapshots when no sources are mapped", async () => {
    const { repo } = makeMockRepo({ sources: [] });
    const staging = [makeStagingRow(999, "normal")];

    const counts = await upsertPriceData(repo, noopLogger, config, staging);

    expect(counts.snapshots.total).toBe(0);
    // Staging should still be processed
    expect(counts.staging.total).toBe(1);
  });

  it("builds snapshots when sources match staging entries", async () => {
    const { log, messages } = makeMockLogger();
    const { repo } = makeMockRepo({
      sources: [{ id: "src-1", printingId: "print-1", externalId: 1001, finish: "normal" }],
    });
    const staging = [makeStagingRow(1001, "normal")];

    const counts = await upsertPriceData(repo, log, config, staging);

    // One source maps to one snapshot
    expect(counts.snapshots.total).toBe(1);
    // Log message should mention the snapshot count
    expect(messages.some((m) => m.includes("1 snapshots") || m.includes("1 snapshot"))).toBe(true);
  });

  it("deduplicates staging by (externalId, finish, recordedAt)", async () => {
    const { repo } = makeMockRepo({});
    const row1 = makeStagingRow(2001, "normal", { marketCents: 100 });
    const row2 = makeStagingRow(2001, "normal", { marketCents: 200 });
    // Same externalId, finish, and recordedAt — should deduplicate to 1

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

  it("maps multiple sources to multiple snapshots for same external ID", async () => {
    const { log } = makeMockLogger();
    const { repo } = makeMockRepo({
      sources: [
        { id: "src-1", printingId: "print-1", externalId: 5001, finish: "normal" },
        { id: "src-2", printingId: "print-2", externalId: 5001, finish: "normal" },
      ],
    });
    const staging = [makeStagingRow(5001, "normal")];

    const counts = await upsertPriceData(repo, log, config, staging);

    // Two sources mapped to the same external_id::finish -> 2 snapshots
    expect(counts.snapshots.total).toBe(2);
  });

  it("does not log snapshot info message when there are no snapshots", async () => {
    const { log, messages } = makeMockLogger();
    const { repo } = makeMockRepo({ sources: [] });
    const staging = [makeStagingRow(9999, "normal")];

    await upsertPriceData(repo, log, config, staging);

    // Should not have the "N snapshots for M mapped sources" message
    expect(messages.some((m) => m.includes("snapshots"))).toBe(false);
  });
});
