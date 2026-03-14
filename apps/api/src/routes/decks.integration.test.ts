import { afterAll, describe, expect, it, mock } from "bun:test";

import type { Logger } from "@openrift/shared/logger";
import postgres from "postgres";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type * as AppModule from "../app.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type * as DbModule from "../db.js";

// ---------------------------------------------------------------------------
// Integration tests: Decks routes
//
// Uses a temp database — only auth is mocked. Requires DATABASE_URL.
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

const USER_ID = "a0000000-0000-4000-a000-00000000aa01";
const SET_ID = "b0000000-0000-4000-a000-000000000001";
const CARD_ID = "c0000000-0000-4000-a000-000000000001";
const CARD_2_ID = "c0000000-0000-4000-a000-000000000002";
const PRINTING_1 = "d0000000-0000-4000-a000-000000000001";

// oxlint-disable-next-line no-empty-function -- noop for postgres notice handler and logger
const noop = () => {};

function replaceDbName(url: string, name: string): string {
  return url.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
}

mock.module("../auth.js", () => ({
  auth: {
    handler: () => new Response("ok"),
    api: {
      getSession: async () => ({
        user: { id: USER_ID, email: "a@test.com", name: "User A" },
        session: { id: "sess-a" },
      }),
    },
    $Infer: { Session: { user: null, session: null } },
  },
}));

let app: AppModule["app"];
let db: DbModule["db"];
let tempDbName = "";

if (DATABASE_URL) {
  tempDbName = `openrift_test_decks_${Date.now()}`;
  const adminSql = postgres(replaceDbName(DATABASE_URL, "postgres"), { onnotice: noop });
  await adminSql.unsafe(`DROP DATABASE IF EXISTS "${tempDbName}"`);
  await adminSql.unsafe(`CREATE DATABASE "${tempDbName}"`);
  await adminSql.end();

  process.env.DATABASE_URL = replaceDbName(DATABASE_URL, tempDbName);

  const [appModule, dbModule, migrateModule] = await Promise.all([
    import("../app.js"),
    import("../db.js"),
    import("@openrift/shared/db/migrate"),
  ]);
  app = appModule.app;
  db = dbModule.db;

  const noopLogger = { info: noop, warn: noop, error: noop, debug: noop } as unknown as Logger;
  await migrateModule.migrate(db, noopLogger);

  // Seed test user
  await db
    .insertInto("users")
    .values({ id: USER_ID, email: "a@test.com", name: "User A", email_verified: true, image: null })
    .execute();

  // Seed card data for deck card tests
  await db
    .insertInto("sets")
    .values({
      id: SET_ID,
      slug: "TEST-SET",
      name: "Test Set",
      printed_total: 10,
      sort_order: 0,
      released_at: null,
    })
    .execute();

  await db
    .insertInto("cards")
    .values({
      id: CARD_ID,
      slug: "TST-001",
      name: "Fire Dragon",
      type: "Unit",
      super_types: [],
      domains: ["Fury"],
      might: 3,
      energy: 2,
      power: 4,
      might_bonus: null,
      keywords: [],
      rules_text: "Rules",
      effect_text: "Effect",
      tags: [],
    })
    .execute();

  await db
    .insertInto("cards")
    .values({
      id: CARD_2_ID,
      slug: "TST-002",
      name: "Ice Phoenix",
      type: "Unit",
      super_types: [],
      domains: ["Order"],
      might: 2,
      energy: 3,
      power: 5,
      might_bonus: null,
      keywords: [],
      rules_text: "Rules",
      effect_text: "Effect",
      tags: [],
    })
    .execute();

  await db
    .insertInto("printings")
    .values({
      id: PRINTING_1,
      slug: "TST-001:rare:normal",
      card_id: CARD_ID,
      set_id: SET_ID,
      source_id: "TST-001",
      collector_number: 1,
      rarity: "Rare",
      art_variant: "normal",
      is_signed: false,
      finish: "normal",
      artist: "Artist",
      public_code: "ABCD",
      printed_rules_text: "Rules",
      printed_effect_text: "Effect",
      flavor_text: null,
      comment: null,
    })
    .execute();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function req(method: string, path: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  return new Request(`http://localhost/api${path}`, opts);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!DATABASE_URL)("Decks routes (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    const sql = postgres(replaceDbName(DATABASE_URL, "postgres"), { onnotice: noop });
    await sql.unsafe(`DROP DATABASE IF EXISTS "${tempDbName}"`);
    await sql.end();
  });

  let deckId: string;
  let wantedDeckId: string;

  // ── POST /decks ───────────────────────────────────────────────────────────

  describe("POST /decks", () => {
    it("creates a standard deck", async () => {
      const res = await app.fetch(req("POST", "/decks", { name: "My Deck", format: "standard" }));
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.id).toBeString();
      expect(json.name).toBe("My Deck");
      expect(json.format).toBe("standard");
      expect(json.isWanted).toBe(false);
      expect(json.isPublic).toBe(false);
      deckId = json.id;
    });

    it("creates a freeform deck", async () => {
      const res = await app.fetch(
        req("POST", "/decks", { name: "Freeform Deck", format: "freeform" }),
      );
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.format).toBe("freeform");
    });

    it("creates a wanted deck", async () => {
      const res = await app.fetch(
        req("POST", "/decks", { name: "Want to Build", format: "standard", isWanted: true }),
      );
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.isWanted).toBe(true);
      wantedDeckId = json.id;
    });

    it("rejects creation without name", async () => {
      const res = await app.fetch(req("POST", "/decks", { format: "standard" }));
      expect(res.status).toBe(400);
    });

    it("rejects creation without format", async () => {
      const res = await app.fetch(req("POST", "/decks", { name: "No Format" }));
      expect(res.status).toBe(400);
    });

    it("rejects invalid format", async () => {
      const res = await app.fetch(req("POST", "/decks", { name: "Bad Format", format: "invalid" }));
      expect(res.status).toBe(400);
    });
  });

  // ── GET /decks ────────────────────────────────────────────────────────────

  describe("GET /decks", () => {
    it("returns all decks for the user", async () => {
      const res = await app.fetch(req("GET", "/decks"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBe(3);
    });

    it("filters by wanted=true", async () => {
      const res = await app.fetch(req("GET", "/decks?wanted=true"));
      expect(res.status).toBe(200);

      const json = (await res.json()) as { isWanted: boolean }[];
      expect(json.length).toBe(1);
      expect(json[0].isWanted).toBe(true);
    });
  });

  // ── GET /decks/:id ────────────────────────────────────────────────────────

  describe("GET /decks/:id", () => {
    it("returns deck with nested deck + cards structure", async () => {
      const res = await app.fetch(req("GET", `/decks/${deckId}`));
      expect(res.status).toBe(200);

      const json = await res.json();
      // Custom getOne returns { deck, cards } shape
      expect(json.deck.id).toBe(deckId);
      expect(json.deck.name).toBe("My Deck");
      expect(json.deck.format).toBe("standard");
      expect(json.cards).toBeDefined();
      expect(json.cards).toHaveLength(0);
    });

    it("returns 404 for non-existent deck", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/decks/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /decks/:id ──────────────────────────────────────────────────────

  describe("PATCH /decks/:id", () => {
    it("updates deck name", async () => {
      const res = await app.fetch(req("PATCH", `/decks/${deckId}`, { name: "Renamed Deck" }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.name).toBe("Renamed Deck");
    });

    it("updates deck description", async () => {
      const res = await app.fetch(
        req("PATCH", `/decks/${deckId}`, { description: "A great deck" }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.description).toBe("A great deck");
    });

    it("returns 404 for non-existent deck", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("PATCH", `/decks/${fakeId}`, { name: "Nope" }));
      expect(res.status).toBe(404);
    });
  });

  // ── PUT /decks/:id/cards ──────────────────────────────────────────────────

  describe("PUT /decks/:id/cards", () => {
    it("sets cards for a standard deck (≥40 main)", async () => {
      const res = await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [
            { cardId: CARD_ID, zone: "main", quantity: 20 },
            { cardId: CARD_2_ID, zone: "main", quantity: 20 },
          ],
        }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("verifies cards were saved via GET", async () => {
      const res = await app.fetch(req("GET", `/decks/${deckId}`));
      const json = await res.json();
      expect(json.cards.length).toBe(2);
      // Card rows should include card info
      expect(json.cards[0].cardName).toBeString();
      expect(json.cards[0].zone).toBe("main");
    });

    it("rejects standard deck with fewer than 40 main cards", async () => {
      const res = await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [{ cardId: CARD_ID, zone: "main", quantity: 10 }],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects standard deck with more than 8 sideboard cards", async () => {
      const res = await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [
            { cardId: CARD_ID, zone: "main", quantity: 40 },
            { cardId: CARD_2_ID, zone: "sideboard", quantity: 9 },
          ],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("replaces all cards on subsequent PUT", async () => {
      const res = await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [{ cardId: CARD_ID, zone: "main", quantity: 40 }],
        }),
      );
      expect(res.status).toBe(200);

      const getRes = await app.fetch(req("GET", `/decks/${deckId}`));
      const json = await getRes.json();
      expect(json.cards.length).toBe(1);
    });

    it("returns 404 for non-existent deck", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("PUT", `/decks/${fakeId}/cards`, {
          cards: [{ cardId: CARD_ID, zone: "main", quantity: 40 }],
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── GET /decks/:id/availability ────────────────────────────────────────────

  describe("GET /decks/:id/availability", () => {
    it("returns per-card availability with owned/needed/shortfall", async () => {
      // Add a copy so availability isn't all zeros
      await app.fetch(req("GET", "/collections")); // ensure inbox
      await app.fetch(req("POST", "/copies", { copies: [{ printingId: PRINTING_1 }] }));

      const res = await app.fetch(req("GET", `/decks/${deckId}/availability`));
      expect(res.status).toBe(200);

      const json = (await res.json()) as {
        cardId: string;
        needed: number;
        owned: number;
        shortfall: number;
      }[];
      expect(Array.isArray(json)).toBe(true);
      // Deck has 1 card entry (CARD_ID with quantity 40), should show availability
      expect(json.length).toBe(1);
      expect(json[0].cardId).toBe(CARD_ID);
      expect(json[0].needed).toBe(40);
      // We added 1 copy of PRINTING_1 which maps to CARD_ID
      expect(json[0].owned).toBeGreaterThanOrEqual(1);
      expect(json[0].shortfall).toBe(json[0].needed - json[0].owned);
    });

    it("returns 404 for non-existent deck", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/decks/${fakeId}/availability`));
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /decks/:id ──────────────────────────────────────────────────────

  describe("DELETE /decks/:id", () => {
    it("deletes a deck", async () => {
      const res = await app.fetch(req("DELETE", `/decks/${wantedDeckId}`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("returns 404 after deletion", async () => {
      const res = await app.fetch(req("GET", `/decks/${wantedDeckId}`));
      expect(res.status).toBe(404);
    });

    it("returns 404 when deleting non-existent deck", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("DELETE", `/decks/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });
});
