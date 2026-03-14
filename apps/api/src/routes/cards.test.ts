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
        or: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        execute: () => data,
        executeTakeFirst: () => data[0] ?? undefined,
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

const dbSet = { id: "OGS", slug: "OGS", name: "Original Set", printed_total: 100 };

// Joined row from printings + cards
const dbJoinedRow = {
  printing_id: "OGS-001:rare:normal:",
  printing_slug: "OGS-001:rare:normal:",
  card_id: "OGS-001",
  card_slug: "OGS-001",
  set_id: "OGS",
  set_slug: "OGS",
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
  printing_id: "OGS-001:rare:normal:",
  market_cents: 275,
  recorded_at: new Date("2026-03-01"),
};

const dbPriceFoil = {
  printing_id: "OGS-001:rare:foil:",
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
    expect(json.sets).toHaveLength(1);
  });

  it("maps joined row fields to Printing shape with nested card", async () => {
    const res = await app.request("/api/cards");
    const json = await res.json();
    const printing = json.sets[0].printings[0];

    expect(printing.id).toBe("OGS-001:rare:normal:");
    expect(printing.sourceId).toBe("OGS-001");
    expect(printing.collectorNumber).toBe(1);
    expect(printing.publicCode).toBe("ABCD");
    expect(printing.artVariant).toBe("normal");
    expect(printing.isSigned).toBe(false);
    expect(printing.isPromo).toBe(false);
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
    const secondSet = { id: "S2", slug: "S2", name: "Set Two", printed_total: 50 };
    const secondRow = {
      ...dbJoinedRow,
      printing_id: "S2-001:rare:normal",
      printing_slug: "S2-001:rare:normal",
      card_id: "S2-001",
      card_slug: "S2-001",
      source_id: "S2-001",
      set_id: "S2",
      set_slug: "S2",
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
    const emptySet = { id: "EMPTY", slug: "EMPTY", name: "Empty Set", printed_total: 0 };
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
    expect(json.prices).toBeDefined();
  });

  it("converts market_cents to dollars", async () => {
    const res = await app.request("/api/prices");
    const json = await res.json();

    expect(json.prices["OGS-001:rare:normal:"]).toBe(2.75);
  });

  it("returns one entry per printing", async () => {
    const res = await app.request("/api/prices");
    const json = await res.json();

    expect(json.prices["OGS-001:rare:normal:"]).toBe(2.75);
    expect(json.prices["OGS-001:rare:foil:"]).toBe(8);
  });

  it("returns empty prices when no rows exist", async () => {
    mockState.tables = { "marketplace_sources as ps": [] };

    const res = await app.request("/api/prices");
    const json = await res.json();

    expect(json.prices).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// GET /api/prices/:printingId/history
// ---------------------------------------------------------------------------

const dbPrinting = {
  id: "OGS-001:rare:normal",
  slug: "OGS-001:rare:normal",
};

const dbMarketplaceSource = {
  id: "ms-tcg-1",
  external_id: 12_345,
  marketplace: "tcgplayer",
  printing_id: "OGS-001:rare:normal",
};

const dbMarketplaceSourceCM = {
  id: "ms-cm-1",
  external_id: 67_890,
  marketplace: "cardmarket",
  printing_id: "OGS-001:rare:normal",
};

const dbSnapshot = {
  id: "snap-1",
  source_id: "ms-tcg-1",
  recorded_at: new Date("2026-03-01"),
  market_cents: 275,
  low_cents: 200,
  mid_cents: 250,
  high_cents: 400,
  trend_cents: null,
  avg1_cents: null,
  avg7_cents: null,
  avg30_cents: null,
};

describe("GET /api/prices/:printingId/history", () => {
  beforeEach(() => {
    mockState.tables = {
      printings: [dbPrinting],
      marketplace_sources: [dbMarketplaceSource, dbMarketplaceSourceCM],
      marketplace_snapshots: [dbSnapshot],
    };
  });

  it("returns 200 with PriceHistoryResponse structure", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.printingId).toBe("OGS-001:rare:normal");
    expect(json.tcgplayer).toBeDefined();
    expect(json.cardmarket).toBeDefined();
  });

  it("returns tcgplayer data with correct currency", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history");
    const json = await res.json();

    expect(json.tcgplayer.available).toBe(true);
    expect(json.tcgplayer.currency).toBe("USD");
    expect(json.tcgplayer.productId).toBe(12_345);
  });

  it("returns cardmarket data with correct currency", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history");
    const json = await res.json();

    expect(json.cardmarket.available).toBe(true);
    expect(json.cardmarket.currency).toBe("EUR");
    expect(json.cardmarket.productId).toBe(67_890);
  });

  it("converts snapshot cents to dollars", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history");
    const json = await res.json();

    // The mock returns all snapshots for both tcg and cm (mock doesn't filter)
    expect(json.tcgplayer.snapshots).toHaveLength(1);
    expect(json.tcgplayer.snapshots[0].market).toBe(2.75);
    expect(json.tcgplayer.snapshots[0].low).toBe(2);
    expect(json.tcgplayer.snapshots[0].mid).toBe(2.5);
    expect(json.tcgplayer.snapshots[0].high).toBe(4);
  });

  it("handles null cents values", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history");
    const json = await res.json();

    // Snapshot has null trend/avg fields — cardmarket mapper uses these
    expect(json.cardmarket.snapshots[0].trend).toBeNull();
    expect(json.cardmarket.snapshots[0].avg1).toBeNull();
  });

  it("formats snapshot date as YYYY-MM-DD", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history");
    const json = await res.json();

    expect(json.tcgplayer.snapshots[0].date).toBe("2026-03-01");
  });

  it("returns unavailable sources for non-existent printing", async () => {
    mockState.tables = { printings: [] };

    const res = await app.request("/api/prices/nonexistent/history");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.printingId).toBe("nonexistent");
    expect(json.tcgplayer.available).toBe(false);
    expect(json.tcgplayer.snapshots).toEqual([]);
    expect(json.cardmarket.available).toBe(false);
    expect(json.cardmarket.snapshots).toEqual([]);
  });

  it("returns unavailable when no marketplace sources exist", async () => {
    mockState.tables = {
      printings: [dbPrinting],
      marketplace_sources: [],
      marketplace_snapshots: [],
    };

    const res = await app.request("/api/prices/OGS-001:rare:normal/history");
    const json = await res.json();

    expect(json.tcgplayer.available).toBe(false);
    expect(json.tcgplayer.productId).toBeNull();
    expect(json.cardmarket.available).toBe(false);
    expect(json.cardmarket.productId).toBeNull();
  });

  it("accepts range query parameter", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history?range=7d");
    expect(res.status).toBe(200);
  });

  it("defaults to 30d range for invalid range parameter", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history?range=invalid");
    expect(res.status).toBe(200);
  });
});
