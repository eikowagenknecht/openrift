import type { Logger } from "@openrift/shared/logger";
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "../../db/types";
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

// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- proxy mock
function makeChain(value: unknown): any {
  return new Proxy(
    // oxlint-disable-next-line no-empty-function -- proxy target requires a callable
    function _target() {},
    {
      get(_, prop) {
        if (prop === "execute") {
          return async () => value;
        }
        if (prop === "executeTakeFirstOrThrow") {
          return async () => (Array.isArray(value) ? value[0] : value);
        }
        if (prop === "executeTakeFirst") {
          return async () => (Array.isArray(value) ? value[0] : value);
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

// ---------------------------------------------------------------------------
// loadIgnoredKeys
// ---------------------------------------------------------------------------

describe("loadIgnoredKeys", () => {
  it("returns a Set of externalId::finish strings", async () => {
    const rows = [
      { externalId: 123, finish: "normal" },
      { externalId: 456, finish: "foil" },
    ];
    const db = {
      selectFrom: () => makeChain(rows),
    } as unknown as Kysely<Database>;

    const result = await loadIgnoredKeys(db, "cardmarket");

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(2);
    expect(result.has("123::normal")).toBe(true);
    expect(result.has("456::foil")).toBe(true);
  });

  it("returns empty set when no ignored products", async () => {
    const db = {
      selectFrom: () => makeChain([]),
    } as unknown as Kysely<Database>;

    const result = await loadIgnoredKeys(db, "tcgplayer");

    expect(result.size).toBe(0);
  });

  it("handles single ignored product", async () => {
    const rows = [{ externalId: 789, finish: "normal" }];
    const db = {
      selectFrom: () => makeChain(rows),
    } as unknown as Kysely<Database>;

    const result = await loadIgnoredKeys(db, "cardmarket");

    expect(result.size).toBe(1);
    expect(result.has("789::normal")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// upsertMarketplaceGroups
// ---------------------------------------------------------------------------

describe("upsertMarketplaceGroups", () => {
  it("returns early on empty groups array without calling insertInto", async () => {
    let insertCalled = false;
    const db = {
      insertInto: () => {
        insertCalled = true;
        return makeChain([]);
      },
    } as unknown as Kysely<Database>;

    await upsertMarketplaceGroups(db, "cardmarket", []);

    expect(insertCalled).toBe(false);
  });

  it("calls insertInto when groups are provided", async () => {
    let insertCalled = false;
    let insertedValues: unknown[] = [];
    const db = {
      insertInto: () => {
        insertCalled = true;
        return {
          values: (vals: unknown[]) => {
            insertedValues = vals;
            return makeChain([]);
          },
        };
      },
    } as unknown as Kysely<Database>;

    const groups: GroupRow[] = [
      { groupId: 101, name: "Core Set", abbreviation: "CS" },
      { groupId: 102 },
    ];

    await upsertMarketplaceGroups(db, "tcgplayer", groups);

    expect(insertCalled).toBe(true);
    expect(insertedValues).toHaveLength(2);
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- checking dynamic mock values
    const first = insertedValues[0] as any;
    expect(first.marketplace).toBe("tcgplayer");
    expect(first.groupId).toBe(101);
    expect(first.name).toBe("Core Set");
    expect(first.abbreviation).toBe("CS");

    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- checking dynamic mock values
    const second = insertedValues[1] as any;
    expect(second.marketplace).toBe("tcgplayer");
    expect(second.groupId).toBe(102);
    expect(second.name).toBeNull();
    expect(second.abbreviation).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// upsertPriceData
// ---------------------------------------------------------------------------

describe("upsertPriceData", () => {
  const config: PriceUpsertConfig = { marketplace: "cardmarket" };

  function createMockDb(opts: {
    sources?: { id: string; printingId: string; externalId: number; finish: string }[];
    countResult?: { count: number };
  }) {
    const sources = opts.sources ?? [];
    const countResult = opts.countResult ?? { count: 0 };
    const insertedBatches: unknown[][] = [];

    const db = {
      selectFrom(table: string) {
        if (table === "marketplaceProducts as src") {
          return makeChain(sources);
        }
        // COUNT query for marketplaceSnapshots or marketplaceStaging
        return makeChain(countResult);
      },
      insertInto() {
        return {
          values(batch: unknown[]) {
            insertedBatches.push(batch);
            // Return empty array from .returning().execute() to simulate no affected rows
            return makeChain([]);
          },
        };
      },
      fn: {
        countAll: () => ({
          as: () => "count",
        }),
      },
    } as unknown as Kysely<Database>;

    return { db, insertedBatches };
  }

  it("returns zeroed counts for empty staging input", async () => {
    const { db } = createMockDb({});
    const counts = await upsertPriceData(db, noopLogger, config, []);

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
    const { db } = createMockDb({ sources: [] });
    const staging = [makeStagingRow(999, "normal")];

    const counts = await upsertPriceData(db, noopLogger, config, staging);

    expect(counts.snapshots.total).toBe(0);
    // Staging should still be processed
    expect(counts.staging.total).toBe(1);
  });

  it("builds snapshots when sources match staging entries", async () => {
    const { log, messages } = makeMockLogger();
    const { db } = createMockDb({
      sources: [{ id: "src-1", printingId: "print-1", externalId: 1001, finish: "normal" }],
    });
    const staging = [makeStagingRow(1001, "normal")];

    const counts = await upsertPriceData(db, log, config, staging);

    // One source maps to one snapshot
    expect(counts.snapshots.total).toBe(1);
    // Log message should mention the snapshot count
    expect(messages.some((m) => m.includes("1 snapshots") || m.includes("1 snapshot"))).toBe(true);
  });

  it("deduplicates staging by (externalId, finish, recordedAt)", async () => {
    const { db } = createMockDb({});
    const row1 = makeStagingRow(2001, "normal", { marketCents: 100 });
    const row2 = makeStagingRow(2001, "normal", { marketCents: 200 });
    // Same externalId, finish, and recordedAt — should deduplicate to 1

    const counts = await upsertPriceData(db, noopLogger, config, [row1, row2]);

    expect(counts.staging.total).toBe(1);
  });

  it("keeps separate staging entries for different finishes", async () => {
    const { db } = createMockDb({});
    const normal = makeStagingRow(3001, "normal");
    const foil = makeStagingRow(3001, "foil");

    const counts = await upsertPriceData(db, noopLogger, config, [normal, foil]);

    expect(counts.staging.total).toBe(2);
  });

  it("keeps separate staging entries for different recordedAt", async () => {
    const { db } = createMockDb({});
    const row1 = makeStagingRow(4001, "normal");
    const row2 = {
      ...makeStagingRow(4001, "normal"),
      recordedAt: new Date("2026-03-11T00:00:00Z"),
    };

    const counts = await upsertPriceData(db, noopLogger, config, [row1, row2]);

    expect(counts.staging.total).toBe(2);
  });

  it("maps multiple sources to multiple snapshots for same external ID", async () => {
    const { log } = makeMockLogger();
    const { db } = createMockDb({
      sources: [
        { id: "src-1", printingId: "print-1", externalId: 5001, finish: "normal" },
        { id: "src-2", printingId: "print-2", externalId: 5001, finish: "normal" },
      ],
    });
    const staging = [makeStagingRow(5001, "normal")];

    const counts = await upsertPriceData(db, log, config, staging);

    // Two sources mapped to the same external_id::finish -> 2 snapshots
    expect(counts.snapshots.total).toBe(2);
  });

  it("does not log snapshot info message when there are no snapshots", async () => {
    const { log, messages } = makeMockLogger();
    const { db } = createMockDb({ sources: [] });
    const staging = [makeStagingRow(9999, "normal")];

    await upsertPriceData(db, log, config, staging);

    // Should not have the "N snapshots for M mapped sources" message
    expect(messages.some((m) => m.includes("snapshots"))).toBe(false);
  });
});
