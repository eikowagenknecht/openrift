import { mock, describe, expect, it, beforeEach } from "bun:test";

import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mock DB — must be before importing the route module
// ---------------------------------------------------------------------------

const mockState = {
  tables: {} as Record<string, unknown[]>,
};

mock.module("../db.js", () => ({
  db: {
    selectFrom: (table: string) => {
      const data = mockState.tables[table] ?? [];
      const chain: Record<string, unknown> = {
        selectAll: () => chain,
        select: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        execute: async () => data,
      };
      return chain;
    },
  },
  dialect: {},
}));

import { cardsRoute } from "./cards";

const app = new Hono();
app.route("/api", cardsRoute);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const dbSet = { id: "OGS", name: "Original Set", total_cards: 100 };

const dbCard = {
  id: "OGS-001",
  name: "Fire Dragon",
  type: "Unit",
  super_types: ["Elite"],
  rarity: "Rare",
  collector_number: 1,
  faction: "Fury",
  might: 4,
  energy: 5,
  power: 6,
  keywords: ["Shield"],
  description: "A fiery beast",
  effect: "Deal 3 damage",
  might_bonus: 1,
  set_id: "OGS",
  thumbnail_url: "https://example.com/thumb.jpg",
  full_url: "https://example.com/full.jpg",
  artist: "Alice",
  tags: ["Dragon"],
  orientation: "portrait",
  public_code: "ABCD",
};

const dbPriceNormal = {
  card_id: "OGS-001",
  variant: "Normal",
  product_id: 12345,
  url: "https://example.com/product",
  low_cents: 150,
  mid_cents: 250,
  high_cents: 500,
  market_cents: 275,
  direct_low_cents: null,
  source: "tcgplayer",
};

const dbPriceFoil = {
  card_id: "OGS-001",
  variant: "Foil",
  product_id: 12345,
  url: "https://example.com/product",
  low_cents: 500,
  mid_cents: 750,
  high_cents: 1000,
  market_cents: 800,
  direct_low_cents: 600,
  source: "tcgplayer",
};

// ---------------------------------------------------------------------------
// GET /api/cards
// ---------------------------------------------------------------------------

describe("GET /api/cards", () => {
  beforeEach(() => {
    mockState.tables = { sets: [dbSet], cards: [dbCard] };
  });

  it("returns 200 with RiftboundContent structure", async () => {
    const res = await app.request("/api/cards");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.game).toBe("Riftbound");
    expect(json.version).toBe("1.0.0");
    expect(json.sets).toHaveLength(1);
  });

  it("maps DB snake_case fields to camelCase", async () => {
    const res = await app.request("/api/cards");
    const json = await res.json();
    const card = json.sets[0].cards[0];

    expect(card.superTypes).toEqual(["Elite"]);
    expect(card.collectorNumber).toBe(1);
    expect(card.mightBonus).toBe(1);
    expect(card.publicCode).toBe("ABCD");
  });

  it("maps DB fields into nested stats object", async () => {
    const res = await app.request("/api/cards");
    const json = await res.json();
    const card = json.sets[0].cards[0];

    expect(card.stats).toEqual({ might: 4, energy: 5, power: 6 });
  });

  it("maps DB fields into nested art object", async () => {
    const res = await app.request("/api/cards");
    const json = await res.json();
    const card = json.sets[0].cards[0];

    expect(card.art).toEqual({
      thumbnailURL: "https://example.com/thumb.jpg",
      fullURL: "https://example.com/full.jpg",
      artist: "Alice",
    });
  });

  it("maps set_id to card.set", async () => {
    const res = await app.request("/api/cards");
    const json = await res.json();
    const card = json.sets[0].cards[0];

    expect(card.set).toBe("OGS");
  });

  it("groups cards by set", async () => {
    const secondSet = { id: "S2", name: "Set Two", total_cards: 50 };
    const secondCard = { ...dbCard, id: "S2-001", set_id: "S2" };
    mockState.tables = {
      sets: [dbSet, secondSet],
      cards: [dbCard, secondCard],
    };

    const res = await app.request("/api/cards");
    const json = await res.json();

    expect(json.sets).toHaveLength(2);
    expect(json.sets[0].cards).toHaveLength(1);
    expect(json.sets[1].cards).toHaveLength(1);
    expect(json.sets[1].cards[0].id).toBe("S2-001");
  });

  it("returns empty cards array for sets with no cards", async () => {
    const emptySet = { id: "EMPTY", name: "Empty Set", total_cards: 0 };
    mockState.tables = { sets: [emptySet], cards: [] };

    const res = await app.request("/api/cards");
    const json = await res.json();

    expect(json.sets[0].cards).toEqual([]);
  });

  it("maps set fields correctly", async () => {
    const res = await app.request("/api/cards");
    const json = await res.json();
    const set = json.sets[0];

    expect(set.id).toBe("OGS");
    expect(set.name).toBe("Original Set");
    expect(set.totalCards).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// GET /api/prices
// ---------------------------------------------------------------------------

describe("GET /api/prices", () => {
  beforeEach(() => {
    mockState.tables = { prices: [dbPriceNormal, dbPriceFoil] };
  });

  it("returns 200 with PricesData structure", async () => {
    const res = await app.request("/api/prices");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.source).toBe("tcgplayer");
    expect(json.unmatched).toEqual([]);
    expect(json.cards).toBeDefined();
  });

  it("converts cents to dollars", async () => {
    const res = await app.request("/api/prices");
    const json = await res.json();
    const card = json.cards["OGS-001"];

    expect(card.normal.low).toBe(1.5);
    expect(card.normal.mid).toBe(2.5);
    expect(card.normal.high).toBe(5);
    expect(card.normal.market).toBe(2.75);
  });

  it("handles null direct_low_cents", async () => {
    const res = await app.request("/api/prices");
    const json = await res.json();
    const card = json.cards["OGS-001"];

    expect(card.normal.directLow).toBeNull();
  });

  it("converts non-null direct_low_cents to dollars", async () => {
    const res = await app.request("/api/prices");
    const json = await res.json();
    const card = json.cards["OGS-001"];

    expect(card.foil.directLow).toBe(6);
  });

  it("groups Normal and Foil variants under the same card", async () => {
    const res = await app.request("/api/prices");
    const json = await res.json();
    const card = json.cards["OGS-001"];

    expect(card.normal).toBeDefined();
    expect(card.foil).toBeDefined();
    expect(card.normal.market).toBe(2.75);
    expect(card.foil.market).toBe(8);
  });

  it("sets productId and url from the first row for a card", async () => {
    const res = await app.request("/api/prices");
    const json = await res.json();
    const card = json.cards["OGS-001"];

    expect(card.productId).toBe(12345);
    expect(card.url).toBe("https://example.com/product");
  });

  it("defaults null cents to 0 before conversion", async () => {
    mockState.tables = {
      prices: [{ ...dbPriceNormal, low_cents: null, mid_cents: null, high_cents: null }],
    };

    const res = await app.request("/api/prices");
    const json = await res.json();
    const card = json.cards["OGS-001"];

    expect(card.normal.low).toBe(0);
    expect(card.normal.mid).toBe(0);
    expect(card.normal.high).toBe(0);
  });

  it("returns empty source when no rows exist", async () => {
    mockState.tables = { prices: [] };

    const res = await app.request("/api/prices");
    const json = await res.json();

    expect(json.source).toBe("");
    expect(json.cards).toEqual({});
  });
});
