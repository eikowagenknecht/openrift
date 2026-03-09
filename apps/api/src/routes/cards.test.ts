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
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        execute: () => data,
      };
      return chain;
    },
  },
  dialect: {},
}));

// oxlint-disable-next-line import/first -- mock.module must come before imports
import { cardsRoute } from "./cards";

const app = new Hono();
app.route("/api", cardsRoute);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const dbSet = { id: "OGS", name: "Original Set", printed_total: 100 };

// Joined row from printings + cards
const dbJoinedRow = {
  printing_id: "OGS-001:normal:::normal",
  card_id: "OGS-001",
  set_id: "OGS",
  source_id: "OGS-001",
  collector_number: 1,
  rarity: "Rare",
  art_variant: "normal",
  is_signed: false,
  is_promo: false,
  finish: "normal",
  image_url: "https://example.com/thumb.jpg",
  artist: "Alice",
  public_code: "ABCD",
  printed_rules_text: "A fiery beast",
  printed_effect_text: "Deal 3 damage",
  name: "Fire Dragon",
  type: "Unit",
  super_types: ["Elite"],
  domains: ["Fury"],
  might: 4,
  energy: 5,
  power: 6,
  might_bonus: 1,
  keywords: ["Shield"],
  rules_text: "A fiery beast",
  effect_text: "Deal 3 damage",
  tags: ["Dragon"],
};

const dbPrice = {
  printing_id: "OGS-001:normal:::normal",
  external_id: 12_345,
  market_cents: 275,
  low_cents: 150,
  mid_cents: 250,
  high_cents: 500,
  recorded_at: new Date("2026-03-01"),
};

const dbPriceFoil = {
  printing_id: "OGS-001:normal:::foil",
  external_id: 12_345,
  market_cents: 800,
  low_cents: 500,
  mid_cents: 750,
  high_cents: 1000,
  recorded_at: new Date("2026-03-01"),
};

// ---------------------------------------------------------------------------
// GET /api/cards
// ---------------------------------------------------------------------------

describe("GET /api/cards", () => {
  beforeEach(() => {
    // The route now uses selectFrom("printings as p").innerJoin("cards as c")
    // Our mock chain returns whatever is in the "printings as p" key
    mockState.tables = { sets: [dbSet], "printings as p": [dbJoinedRow] };
  });

  it("returns 200 with RiftboundContent structure", async () => {
    const res = await app.request("/api/cards");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.game).toBe("Riftbound");
    expect(json.version).toBe("2.0.0");
    expect(json.sets).toHaveLength(1);
  });

  it("maps joined row fields to camelCase Card shape", async () => {
    const res = await app.request("/api/cards");
    const json = await res.json();
    const card = json.sets[0].cards[0];

    expect(card.id).toBe("OGS-001:normal:::normal");
    expect(card.cardId).toBe("OGS-001");
    expect(card.sourceId).toBe("OGS-001");
    expect(card.superTypes).toEqual(["Elite"]);
    expect(card.collectorNumber).toBe(1);
    expect(card.mightBonus).toBe(1);
    expect(card.publicCode).toBe("ABCD");
    expect(card.artVariant).toBe("normal");
    expect(card.isSigned).toBe(false);
    expect(card.finish).toBe("normal");
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
      imageURL: "https://example.com/thumb.jpg",
      artist: "Alice",
    });
  });

  it("maps set_id to card.set", async () => {
    const res = await app.request("/api/cards");
    const json = await res.json();
    const card = json.sets[0].cards[0];

    expect(card.set).toBe("OGS");
  });

  it("uses printed_rules_text as description", async () => {
    const res = await app.request("/api/cards");
    const json = await res.json();
    const card = json.sets[0].cards[0];

    expect(card.description).toBe("A fiery beast");
    expect(card.effect).toBe("Deal 3 damage");
  });

  it("groups cards by set", async () => {
    const secondSet = { id: "S2", name: "Set Two", printed_total: 50 };
    const secondRow = {
      ...dbJoinedRow,
      printing_id: "S2-001:normal:::normal",
      card_id: "S2-001",
      source_id: "S2-001",
      set_id: "S2",
    };
    mockState.tables = {
      sets: [dbSet, secondSet],
      "printings as p": [dbJoinedRow, secondRow],
    };

    const res = await app.request("/api/cards");
    const json = await res.json();

    expect(json.sets).toHaveLength(2);
    expect(json.sets[0].cards).toHaveLength(1);
    expect(json.sets[1].cards).toHaveLength(1);
    expect(json.sets[1].cards[0].cardId).toBe("S2-001");
  });

  it("returns empty cards array for sets with no cards", async () => {
    const emptySet = { id: "EMPTY", name: "Empty Set", printed_total: 0 };
    mockState.tables = { sets: [emptySet], "printings as p": [] };

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
    expect(set.printedTotal).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// GET /api/prices
// ---------------------------------------------------------------------------

describe("GET /api/prices", () => {
  beforeEach(() => {
    mockState.tables = { "tcgplayer_sources as ps": [dbPrice, dbPriceFoil] };
  });

  it("returns 200 with PricesData structure", async () => {
    const res = await app.request("/api/prices");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.source).toBe("tcgplayer");
    expect(json.cards).toBeDefined();
  });

  it("converts cents to dollars", async () => {
    const res = await app.request("/api/prices");
    const json = await res.json();
    const price = json.cards["OGS-001:normal:::normal"];

    expect(price.low).toBe(1.5);
    expect(price.mid).toBe(2.5);
    expect(price.high).toBe(5);
    expect(price.market).toBe(2.75);
  });

  it("returns one entry per printing (flat, no normal/foil grouping)", async () => {
    const res = await app.request("/api/prices");
    const json = await res.json();

    // Each printing gets its own entry keyed by printing_id
    expect(json.cards["OGS-001:normal:::normal"]).toBeDefined();
    expect(json.cards["OGS-001:normal:::foil"]).toBeDefined();
    expect(json.cards["OGS-001:normal:::normal"].market).toBe(2.75);
    expect(json.cards["OGS-001:normal:::foil"].market).toBe(8);
  });

  it("sets productId from the price row", async () => {
    const res = await app.request("/api/prices");
    const json = await res.json();
    const price = json.cards["OGS-001:normal:::normal"];

    expect(price.productId).toBe(12_345);
  });

  it("defaults null cents to 0 before conversion", async () => {
    mockState.tables = {
      "tcgplayer_sources as ps": [
        {
          ...dbPrice,
          low_cents: null,
          mid_cents: null,
          high_cents: null,
        },
      ],
    };

    const res = await app.request("/api/prices");
    const json = await res.json();
    const price = json.cards["OGS-001:normal:::normal"];

    expect(price.low).toBe(0);
    expect(price.mid).toBe(0);
    expect(price.high).toBe(0);
  });

  it("returns tcgplayer source when no rows exist", async () => {
    mockState.tables = { "tcgplayer_sources as ps": [] };

    const res = await app.request("/api/prices");
    const json = await res.json();

    expect(json.source).toBe("tcgplayer");
    expect(json.cards).toEqual({});
  });
});
