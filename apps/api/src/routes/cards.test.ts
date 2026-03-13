import { mock, describe, expect, it, beforeEach } from "bun:test";

import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mock DB — must be before importing the route module
// ---------------------------------------------------------------------------

const mockState = {
  tables: {} as Record<string, unknown[]>,
};

mock.module("../config.js", () => ({
  config: {
    port: 3000,
    databaseUrl: "postgres://mock",
    corsOrigin: undefined,
    auth: { secret: "test-secret", adminEmail: undefined, google: undefined, discord: undefined },
    smtp: { configured: false },
    cron: { enabled: false, tcgplayerSchedule: "", cardmarketSchedule: "" },
  },
}));

mock.module("../db.js", () => ({
  db: {
    selectFrom: (table: string) => {
      const data = mockState.tables[table] ?? [];
      const chain: Record<string, unknown> = {
        selectAll: () => chain,
        select: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        distinctOn: () => chain,
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
  market_cents: 275,
  recorded_at: new Date("2026-03-01"),
};

const dbPriceFoil = {
  printing_id: "OGS-001:normal:::foil",
  market_cents: 800,
  recorded_at: new Date("2026-03-01"),
};

// ---------------------------------------------------------------------------
// GET /api/cards
// ---------------------------------------------------------------------------

describe("GET /api/cards", () => {
  beforeEach(() => {
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

  it("maps joined row fields to Printing shape with nested card", async () => {
    const res = await app.request("/api/cards");
    const json = await res.json();
    const printing = json.sets[0].printings[0];

    expect(printing.id).toBe("OGS-001:normal:::normal");
    expect(printing.sourceId).toBe("OGS-001");
    expect(printing.collectorNumber).toBe(1);
    expect(printing.publicCode).toBe("ABCD");
    expect(printing.artVariant).toBe("normal");
    expect(printing.isSigned).toBe(false);
    expect(printing.finish).toBe("normal");
    expect(printing.artist).toBe("Alice");

    expect(printing.card.id).toBe("OGS-001");
    expect(printing.card.name).toBe("Fire Dragon");
    expect(printing.card.superTypes).toEqual(["Elite"]);
    expect(printing.card.mightBonus).toBe(1);
  });

  it("maps DB fields into nested stats object on card", async () => {
    const res = await app.request("/api/cards");
    const json = await res.json();
    const printing = json.sets[0].printings[0];

    expect(printing.card.stats).toEqual({ might: 4, energy: 5, power: 6 });
  });

  it("maps image URL into images array", async () => {
    const res = await app.request("/api/cards");
    const json = await res.json();
    const printing = json.sets[0].printings[0];

    expect(printing.images).toEqual([{ face: "front", url: "https://example.com/thumb.jpg" }]);
  });

  it("maps set_id to printing.set", async () => {
    const res = await app.request("/api/cards");
    const json = await res.json();
    const printing = json.sets[0].printings[0];

    expect(printing.set).toBe("OGS");
  });

  it("uses rules_text as card.description", async () => {
    const res = await app.request("/api/cards");
    const json = await res.json();
    const printing = json.sets[0].printings[0];

    expect(printing.card.description).toBe("A fiery beast");
    expect(printing.card.effect).toBe("Deal 3 damage");
  });

  it("groups printings by set", async () => {
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
    expect(json.sets[0].printings).toHaveLength(1);
    expect(json.sets[1].printings).toHaveLength(1);
    expect(json.sets[1].printings[0].card.id).toBe("S2-001");
  });

  it("returns empty printings array for sets with no printings", async () => {
    const emptySet = { id: "EMPTY", name: "Empty Set", printed_total: 0 };
    mockState.tables = { sets: [emptySet], "printings as p": [] };

    const res = await app.request("/api/cards");
    const json = await res.json();

    expect(json.sets[0].printings).toEqual([]);
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
    mockState.tables = { "marketplace_sources as ps": [dbPrice, dbPriceFoil] };
  });

  it("returns 200 with PricesData structure", async () => {
    const res = await app.request("/api/prices");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.source).toBe("tcgplayer");
    expect(json.prices).toBeDefined();
  });

  it("converts market_cents to dollars", async () => {
    const res = await app.request("/api/prices");
    const json = await res.json();

    expect(json.prices["OGS-001:normal:::normal"]).toBe(2.75);
  });

  it("returns one entry per printing", async () => {
    const res = await app.request("/api/prices");
    const json = await res.json();

    expect(json.prices["OGS-001:normal:::normal"]).toBe(2.75);
    expect(json.prices["OGS-001:normal:::foil"]).toBe(8);
  });

  it("returns empty prices when no rows exist", async () => {
    mockState.tables = { "marketplace_sources as ps": [] };

    const res = await app.request("/api/prices");
    const json = await res.json();

    expect(json.source).toBe("tcgplayer");
    expect(json.prices).toEqual({});
  });
});
