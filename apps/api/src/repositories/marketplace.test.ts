import { describe, expect, it } from "bun:test";

import { marketplaceRepo } from "./marketplace.js";

// ---------------------------------------------------------------------------
// Mock DB — tracks calls to verify the repo builds correct queries
// ---------------------------------------------------------------------------

interface CallLog {
  method: string;
  args: unknown[];
}

function createMockDb(returnValue: unknown = []) {
  const calls: CallLog[] = [];

  function log(method: string, ...args: unknown[]) {
    calls.push({ method, args });
  }

  const chain: Record<string, (...args: unknown[]) => unknown> = {};

  for (const method of ["select", "where", "orderBy", "innerJoin", "distinctOn"]) {
    chain[method] = (...args: unknown[]) => {
      log(method, ...args);
      return chain;
    };
  }

  chain.execute = () => {
    log("execute");
    return returnValue;
  };

  const db = {
    selectFrom: (table: string) => {
      log("selectFrom", table);
      return chain;
    },
  };

  return { db, calls };
}

// ---------------------------------------------------------------------------
// latestPrices
// ---------------------------------------------------------------------------

describe("marketplaceRepo.latestPrices", () => {
  it("builds the correct query chain for latest tcgplayer prices", async () => {
    const data = [
      { printingId: "p1", marketCents: 100 },
      { printingId: "p2", marketCents: 250 },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = marketplaceRepo(db as any);

    const result = await repo.latestPrices();

    expect(result).toEqual(data);
    expect(calls).toEqual([
      { method: "selectFrom", args: ["marketplaceSources as ps"] },
      { method: "innerJoin", args: ["marketplaceSnapshots as snap", "snap.sourceId", "ps.id"] },
      { method: "innerJoin", args: ["printings as p", "p.id", "ps.printingId"] },
      { method: "where", args: ["ps.marketplace", "=", "tcgplayer"] },
      { method: "distinctOn", args: ["ps.id"] },
      { method: "select", args: [["p.id as printingId", "snap.marketCents"]] },
      { method: "orderBy", args: ["ps.id"] },
      { method: "orderBy", args: ["snap.recordedAt", "desc"] },
      { method: "execute", args: [] },
    ]);
  });

  it("returns empty array when no snapshots exist", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = marketplaceRepo(db as any);

    const result = await repo.latestPrices();

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sourcesForPrinting
// ---------------------------------------------------------------------------

describe("marketplaceRepo.sourcesForPrinting", () => {
  it("selects id, externalId, marketplace for the given printing", async () => {
    const data = [
      { id: "src-1", externalId: 12_345, marketplace: "tcgplayer" },
      { id: "src-2", externalId: 67_890, marketplace: "cardmarket" },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = marketplaceRepo(db as any);

    const result = await repo.sourcesForPrinting("printing-abc");

    expect(result).toEqual(data);
    expect(calls).toEqual([
      { method: "selectFrom", args: ["marketplaceSources"] },
      { method: "select", args: [["id", "externalId", "marketplace"]] },
      { method: "where", args: ["printingId", "=", "printing-abc"] },
      { method: "execute", args: [] },
    ]);
  });

  it("returns empty array when printing has no marketplace sources", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = marketplaceRepo(db as any);

    const result = await repo.sourcesForPrinting("nonexistent-printing");

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// snapshots
// ---------------------------------------------------------------------------

describe("marketplaceRepo.snapshots", () => {
  it("returns all snapshots ordered by recordedAt asc when cutoff is null", async () => {
    const data = [
      {
        recordedAt: new Date("2026-01-01"),
        marketCents: 100,
        lowCents: 80,
        midCents: 100,
        highCents: 150,
        trendCents: 110,
        avg1Cents: 105,
        avg7Cents: 102,
        avg30Cents: 98,
      },
      {
        recordedAt: new Date("2026-01-02"),
        marketCents: 120,
        lowCents: 90,
        midCents: 115,
        highCents: 160,
        trendCents: 125,
        avg1Cents: 118,
        avg7Cents: 112,
        avg30Cents: 105,
      },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = marketplaceRepo(db as any);

    const result = await repo.snapshots("source-abc", null);

    expect(result).toEqual(data);
    expect(calls).toEqual([
      { method: "selectFrom", args: ["marketplaceSnapshots"] },
      {
        method: "select",
        args: [
          [
            "recordedAt",
            "marketCents",
            "lowCents",
            "midCents",
            "highCents",
            "trendCents",
            "avg1Cents",
            "avg7Cents",
            "avg30Cents",
          ],
        ],
      },
      { method: "where", args: ["sourceId", "=", "source-abc"] },
      { method: "orderBy", args: ["recordedAt", "asc"] },
      { method: "execute", args: [] },
    ]);
  });

  it("adds a cutoff filter when cutoff date is provided", async () => {
    const cutoff = new Date("2026-03-01");
    const data = [
      {
        recordedAt: new Date("2026-03-05"),
        marketCents: 200,
        lowCents: null,
        midCents: null,
        highCents: null,
        trendCents: null,
        avg1Cents: null,
        avg7Cents: null,
        avg30Cents: null,
      },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = marketplaceRepo(db as any);

    const result = await repo.snapshots("source-xyz", cutoff);

    expect(result).toEqual(data);
    expect(calls).toEqual([
      { method: "selectFrom", args: ["marketplaceSnapshots"] },
      {
        method: "select",
        args: [
          [
            "recordedAt",
            "marketCents",
            "lowCents",
            "midCents",
            "highCents",
            "trendCents",
            "avg1Cents",
            "avg7Cents",
            "avg30Cents",
          ],
        ],
      },
      { method: "where", args: ["sourceId", "=", "source-xyz"] },
      { method: "orderBy", args: ["recordedAt", "asc"] },
      { method: "where", args: ["recordedAt", ">=", cutoff] },
      { method: "execute", args: [] },
    ]);
  });

  it("returns empty array when no snapshots exist for the source", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = marketplaceRepo(db as any);

    const result = await repo.snapshots("nonexistent-source", null);

    expect(result).toEqual([]);
  });
});
