import { describe, expect, it, beforeEach } from "bun:test";

import { Hono } from "hono";

import { catalogRoute } from "./catalog";

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

const mockState = {
  tables: {} as Record<string, unknown[]>,
};

function createMockDb() {
  return {
    selectFrom: (table: string) => {
      const data = mockState.tables[table] ?? [];
      const chain: Record<string, unknown> = {
        selectAll: () => chain,
        select: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        distinctOn: () => chain,
        where: () => chain,
        or: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        execute: () => data,
        executeTakeFirst: () => data[0] ?? undefined,
        executeTakeFirstOrThrow: () => data[0],
      };
      return chain;
    },
  };
}

const mockDb = createMockDb();

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("db", mockDb);
    await next();
  })
  .route("/api", catalogRoute);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const dbSet = { id: "OGS", slug: "OGS", name: "Original Set" };

const dbCard = {
  id: "OGS-001",
  slug: "OGS-001",
  name: "Fire Dragon",
  type: "Unit",
  superTypes: ["Elite"],
  domains: ["Fury"],
  might: 4,
  energy: 5,
  power: 6,
  mightBonus: 1,
  keywords: ["Shield"],
  rulesText: "A fiery beast",
  effectText: "Deal 3 damage",
  tags: ["Dragon"],
};

const dbPrintingRow = {
  id: "OGS-001:rare:normal:",
  slug: "OGS-001:rare:normal:",
  cardId: "OGS-001",
  setId: "OGS",
  sourceId: "OGS-001",
  collectorNumber: 1,
  rarity: "Rare",
  artVariant: "normal",
  isSigned: false,
  isPromo: false,
  finish: "normal",
  artist: "Alice",
  publicCode: "ABCD",
  printedRulesText: "A fiery beast",
  printedEffectText: "Deal 3 damage",
  flavorText: null,
};

const dbImage = {
  printingId: "OGS-001:rare:normal:",
  face: "front",
  url: "https://example.com/thumb.jpg",
};

const dbPrice = {
  printingId: "OGS-001:rare:normal:",
  marketCents: 275,
  recordedAt: new Date("2026-03-01"),
};

function catalogTables(overrides?: Record<string, unknown[]>) {
  return {
    sets: [dbSet],
    cards: [dbCard],
    printings: [dbPrintingRow],
    printingImages: [dbImage],
    "marketplaceSources as ps": [dbPrice],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /api/catalog
// ---------------------------------------------------------------------------

describe("GET /api/catalog", () => {
  beforeEach(() => {
    mockState.tables = catalogTables();
  });

  it("returns 200 with normalized RiftboundCatalog structure", async () => {
    const res = await app.request("/api/catalog");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sets).toHaveLength(1);
    expect(json.printings).toHaveLength(1);
    expect(Object.keys(json.cards)).toHaveLength(1);
  });

  it("returns sets as { id, slug, name } objects", async () => {
    const res = await app.request("/api/catalog");
    const json = await res.json();
    expect(json.sets[0]).toEqual({ id: "OGS", slug: "OGS", name: "Original Set" });
  });

  it("returns cards keyed by card ID", async () => {
    const res = await app.request("/api/catalog");
    const json = await res.json();
    const card = json.cards["OGS-001"];
    expect(card).toBeDefined();
    expect(card.name).toBe("Fire Dragon");
    expect(card.superTypes).toEqual(["Elite"]);
    expect(card.mightBonus).toBe(1);
    expect(card.might).toBe(4);
    expect(card.energy).toBe(5);
    expect(card.power).toBe(6);
  });

  it("maps printing fields with cardId reference instead of nested card", async () => {
    const res = await app.request("/api/catalog");
    const json = await res.json();
    const printing = json.printings[0];

    expect(printing.id).toBe("OGS-001:rare:normal:");
    expect(printing.sourceId).toBe("OGS-001");
    expect(printing.collectorNumber).toBe(1);
    expect(printing.publicCode).toBe("ABCD");
    expect(printing.artVariant).toBe("normal");
    expect(printing.isSigned).toBe(false);
    expect(printing.isPromo).toBe(false);
    expect(printing.finish).toBe("normal");
    expect(printing.artist).toBe("Alice");
    expect(printing.cardId).toBe("OGS-001");
    expect(printing.card).toBeUndefined();
  });

  it("maps image URL into images array", async () => {
    const res = await app.request("/api/catalog");
    const json = await res.json();
    expect(json.printings[0].images).toEqual([
      { face: "front", url: "https://example.com/thumb.jpg" },
    ]);
  });

  it("passes setId through on printing", async () => {
    const res = await app.request("/api/catalog");
    const json = await res.json();
    expect(json.printings[0].setId).toBe("OGS");
  });

  it("uses rulesText as card.rulesText", async () => {
    const res = await app.request("/api/catalog");
    const json = await res.json();
    const card = json.cards["OGS-001"];
    expect(card.rulesText).toBe("A fiery beast");
    expect(card.effectText).toBe("Deal 3 damage");
  });

  it("includes latest market price on printing", async () => {
    const res = await app.request("/api/catalog");
    const json = await res.json();
    expect(json.printings[0].marketPrice).toBe(2.75);
  });

  it("omits marketPrice when no price exists", async () => {
    mockState.tables = catalogTables({ "marketplaceSources as ps": [] });
    const res = await app.request("/api/catalog");
    const json = await res.json();
    expect(json.printings[0].marketPrice).toBeUndefined();
  });

  it("returns printings from multiple sets as flat array", async () => {
    const secondSet = { id: "S2", slug: "S2", name: "Set Two" };
    const secondCard = { ...dbCard, id: "S2-001", slug: "S2-001" };
    const secondRow = {
      ...dbPrintingRow,
      id: "S2-001:rare:normal",
      slug: "S2-001:rare:normal",
      cardId: "S2-001",
      sourceId: "S2-001",
      setId: "S2",
    };
    mockState.tables = catalogTables({
      sets: [dbSet, secondSet],
      cards: [dbCard, secondCard],
      printings: [dbPrintingRow, secondRow],
      printingImages: [],
    });

    const res = await app.request("/api/catalog");
    const json = await res.json();
    expect(json.sets).toHaveLength(2);
    expect(json.printings).toHaveLength(2);
    expect(Object.keys(json.cards)).toHaveLength(2);
  });

  it("returns empty printings when catalog is empty", async () => {
    mockState.tables = catalogTables({
      sets: [],
      cards: [],
      printings: [],
      printingImages: [],
      "marketplaceSources as ps": [],
    });
    const res = await app.request("/api/catalog");
    const json = await res.json();
    expect(json.printings).toEqual([]);
    expect(json.cards).toEqual({});
    expect(json.sets).toEqual([]);
  });

  it("returns ETag and Cache-Control headers", async () => {
    const res = await app.request("/api/catalog");
    expect(res.headers.get("ETag")).toBeTruthy();
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=300");
  });

  it("returns 304 when If-None-Match matches current ETag", async () => {
    const first = await app.request("/api/catalog");
    const etag = first.headers.get("ETag") ?? "";

    const res = await app.request("/api/catalog", {
      headers: { "If-None-Match": etag },
    });
    expect(res.status).toBe(304);
  });

  it("returns 200 when If-None-Match does not match", async () => {
    const res = await app.request("/api/catalog", {
      headers: { "If-None-Match": '"stale"' },
    });
    expect(res.status).toBe(200);
  });
});
