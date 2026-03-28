import { describe, expect, it } from "vitest";

import { CARD_CALM_UNIT, CARD_FURY_UNIT, PRINTING_1 } from "../../test/fixtures/constants.js";
import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Decks routes
//
// Uses the shared integration database with pre-seeded OGS card data.
// Only auth is mocked.
// ---------------------------------------------------------------------------

const ctx = createTestContext("a0000000-0008-4000-a000-000000000001");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Decks routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  let deckId: string;
  let wantedDeckId: string;

  // ── POST /decks ───────────────────────────────────────────────────────────

  describe("POST /decks", () => {
    it("creates a standard deck", async () => {
      const res = await app.fetch(req("POST", "/decks", { name: "My Deck", format: "standard" }));
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.id).toBeTypeOf("string");
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
    it("sets cards for a standard deck (>=40 main)", async () => {
      const res = await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [
            { cardId: CARD_FURY_UNIT.id, zone: "main", quantity: 20 },
            { cardId: CARD_CALM_UNIT.id, zone: "main", quantity: 20 },
          ],
        }),
      );
      expect(res.status).toBe(204);
    });

    it("verifies cards were saved via GET", async () => {
      const res = await app.fetch(req("GET", `/decks/${deckId}`));
      const json = await res.json();
      expect(json.cards.length).toBe(2);
      // Card rows should include card info
      expect(json.cards[0].cardName).toBeTypeOf("string");
      expect(json.cards[0].zone).toBe("main");
    });

    it("rejects standard deck with fewer than 40 main cards", async () => {
      const res = await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [{ cardId: CARD_FURY_UNIT.id, zone: "main", quantity: 10 }],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects standard deck with more than 8 sideboard cards", async () => {
      const res = await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [
            { cardId: CARD_FURY_UNIT.id, zone: "main", quantity: 40 },
            { cardId: CARD_CALM_UNIT.id, zone: "sideboard", quantity: 9 },
          ],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("replaces all cards on subsequent PUT", async () => {
      const res = await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [{ cardId: CARD_FURY_UNIT.id, zone: "main", quantity: 40 }],
        }),
      );
      expect(res.status).toBe(204);

      const getRes = await app.fetch(req("GET", `/decks/${deckId}`));
      const json = await getRes.json();
      expect(json.cards.length).toBe(1);
    });

    it("returns 404 for non-existent deck", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("PUT", `/decks/${fakeId}/cards`, {
          cards: [{ cardId: CARD_FURY_UNIT.id, zone: "main", quantity: 40 }],
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
      await app.fetch(req("POST", "/copies", { copies: [{ printingId: PRINTING_1.id }] }));

      const res = await app.fetch(req("GET", `/decks/${deckId}/availability`));
      expect(res.status).toBe(200);

      const json = (await res.json()) as {
        cardId: string;
        needed: number;
        owned: number;
        shortfall: number;
      }[];
      expect(Array.isArray(json)).toBe(true);
      // Deck has 1 card entry (CARD_FURY_UNIT with quantity 40), should show availability
      expect(json.length).toBe(1);
      expect(json[0].cardId).toBe(CARD_FURY_UNIT.id);
      expect(json[0].needed).toBe(40);
      // We added 1 copy of PRINTING_1 which maps to CARD_FURY_UNIT
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
      expect(res.status).toBe(204);
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
