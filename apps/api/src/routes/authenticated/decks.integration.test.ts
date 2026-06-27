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
      const res = await app.fetch(
        req("POST", "/decks", { name: "My Deck", format: "constructed" }),
      );
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.id).toBeTypeOf("string");
      expect(json.name).toBe("My Deck");
      expect(json.format).toBe("constructed");
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
        req("POST", "/decks", { name: "Want to Build", format: "constructed", isWanted: true }),
      );
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.isWanted).toBe(true);
      wantedDeckId = json.id;
    });

    it("rejects creation without name", async () => {
      const res = await app.fetch(req("POST", "/decks", { format: "constructed" }));
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

      const json = (await res.json()) as { items: unknown[] };
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items.length).toBe(3);
    });

    it("filters by wanted=true", async () => {
      const res = await app.fetch(req("GET", "/decks?wanted=true"));
      expect(res.status).toBe(200);

      // The list item shape is { deck: { id, ... }, isValid, ... } — there is
      // no top-level isWanted field, so verify the filter by identity: only the
      // wanted deck created above comes back.
      const json = (await res.json()) as { items: { deck: { id: string } }[] };
      expect(json.items.length).toBe(1);
      expect(json.items[0].deck.id).toBe(wantedDeckId);
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
      expect(json.deck.format).toBe("constructed");
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
      expect(res.status).toBe(200);
      const json = (await res.json()) as { cards: unknown[] };
      expect(Array.isArray(json.cards)).toBe(true);
    });

    it("verifies cards were saved via GET", async () => {
      const res = await app.fetch(req("GET", `/decks/${deckId}`));
      const json = await res.json();
      expect(json.cards.length).toBe(2);
      // Authenticated deck-card rows carry { cardId, zone, quantity,
      // preferredPrintingId } — no denormalized cardName (that lives on the
      // public deck-share shape).
      expect(json.cards[0].cardId).toBeTypeOf("string");
      expect(json.cards[0].zone).toBe("main");
    });

    // Deck-size rules are advisory, not enforced at save time: PUT /cards saves
    // any composition (so work-in-progress decks persist) and the constructed
    // deck-validation rules surface as the `isValid` flag on GET /decks.
    async function isDeckValid(): Promise<boolean> {
      const listRes = await app.fetch(req("GET", "/decks"));
      const list = (await listRes.json()) as {
        items: { deck: { id: string }; isValid: boolean }[];
      };
      const entry = list.items.find((item) => item.deck.id === deckId);
      expect(entry).toBeDefined();
      return (entry as NonNullable<typeof entry>).isValid;
    }

    it("saves a constructed deck with fewer than 40 main cards but reports it invalid", async () => {
      const res = await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [{ cardId: CARD_FURY_UNIT.id, zone: "main", quantity: 10 }],
        }),
      );
      expect(res.status).toBe(200);
      expect(await isDeckValid()).toBe(false);
    });

    it("saves a constructed deck with more than 8 sideboard cards but reports it invalid", async () => {
      const res = await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [
            { cardId: CARD_FURY_UNIT.id, zone: "main", quantity: 40 },
            { cardId: CARD_CALM_UNIT.id, zone: "sideboard", quantity: 9 },
          ],
        }),
      );
      expect(res.status).toBe(200);
      expect(await isDeckValid()).toBe(false);
    });

    it("replaces all cards on subsequent PUT", async () => {
      const res = await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [{ cardId: CARD_FURY_UNIT.id, zone: "main", quantity: 40 }],
        }),
      );
      expect(res.status).toBe(200);

      const json = (await res.json()) as { cards: unknown[] };
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

    it("carries the Postgres txid in the response (ADR-027)", async () => {
      const res = await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [{ cardId: CARD_FURY_UNIT.id, zone: "main", quantity: 40 }],
        }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { txid: number };
      expect(json.txid).toBeTypeOf("number");
    });
  });

  // ── POST /decks/:id/cards/apply ─────────────────────────────────────────────

  describe("POST /decks/:id/cards/apply", () => {
    const rowId = "b0000000-0001-4000-a000-000000000001";

    async function deckCards(): Promise<{ cardId: string; zone: string; quantity: number }[]> {
      const res = await app.fetch(req("GET", `/decks/${deckId}`));
      const json = (await res.json()) as {
        cards: { cardId: string; zone: string; quantity: number }[];
      };
      return json.cards;
    }

    it("inserts a row with a client-supplied id and returns the txid", async () => {
      // Reset to a known single-card state first.
      await app.fetch(
        req("PUT", `/decks/${deckId}/cards`, {
          cards: [{ cardId: CARD_FURY_UNIT.id, zone: "main", quantity: 2 }],
        }),
      );
      const res = await app.fetch(
        req("POST", `/decks/${deckId}/cards/apply`, {
          upserts: [
            {
              id: rowId,
              cardId: CARD_CALM_UNIT.id,
              zone: "sideboard",
              quantity: 3,
              preferredPrintingId: null,
            },
          ],
          deletes: [],
        }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { txid: number };
      expect(json.txid).toBeTypeOf("number");

      const cards = await deckCards();
      expect(cards).toHaveLength(2);
      expect(cards.find((card) => card.zone === "sideboard")?.quantity).toBe(3);
    });

    it("converges on replay — re-applying the same upsert is a no-op", async () => {
      const res = await app.fetch(
        req("POST", `/decks/${deckId}/cards/apply`, {
          upserts: [
            {
              id: rowId,
              cardId: CARD_CALM_UNIT.id,
              zone: "sideboard",
              quantity: 3,
              preferredPrintingId: null,
            },
          ],
          deletes: [],
        }),
      );
      expect(res.status).toBe(200);
      const cards = await deckCards();
      expect(cards.filter((card) => card.zone === "sideboard")).toHaveLength(1);
      expect(cards.find((card) => card.zone === "sideboard")?.quantity).toBe(3);
    });

    it("updates quantity in place when the content key already exists under another id", async () => {
      const res = await app.fetch(
        req("POST", `/decks/${deckId}/cards/apply`, {
          upserts: [
            {
              // Fresh id, same (card, zone, printing) content key: the server
              // converges on the existing row instead of duplicating it.
              id: "b0000000-0002-4000-a000-000000000001",
              cardId: CARD_CALM_UNIT.id,
              zone: "sideboard",
              quantity: 5,
              preferredPrintingId: null,
            },
          ],
          deletes: [],
        }),
      );
      expect(res.status).toBe(200);
      const cards = await deckCards();
      expect(cards.filter((card) => card.zone === "sideboard")).toHaveLength(1);
      expect(cards.find((card) => card.zone === "sideboard")?.quantity).toBe(5);
    });

    it("deletes rows by id and tolerates already-deleted ids on replay", async () => {
      const first = await app.fetch(
        req("POST", `/decks/${deckId}/cards/apply`, { upserts: [], deletes: [rowId] }),
      );
      expect(first.status).toBe(200);
      // Replay of the same delete: the row is gone — still 200.
      const replay = await app.fetch(
        req("POST", `/decks/${deckId}/cards/apply`, { upserts: [], deletes: [rowId] }),
      );
      expect(replay.status).toBe(200);
      const cards = await deckCards();
      expect(cards.filter((card) => card.zone === "sideboard")).toHaveLength(0);
    });

    it("returns 404 for non-existent deck", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", `/decks/${fakeId}/cards/apply`, { upserts: [], deletes: [rowId] }),
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
        items: {
          cardId: string;
          needed: number;
          owned: number;
          shortfall: number;
        }[];
      };
      expect(Array.isArray(json.items)).toBe(true);
      // Deck has 1 card entry (CARD_FURY_UNIT with quantity 40), should show availability
      expect(json.items.length).toBe(1);
      expect(json.items[0].cardId).toBe(CARD_FURY_UNIT.id);
      expect(json.items[0].needed).toBe(40);
      // We added 1 copy of PRINTING_1 which maps to CARD_FURY_UNIT
      expect(json.items[0].owned).toBeGreaterThanOrEqual(1);
      expect(json.items[0].shortfall).toBe(json.items[0].needed - json.items[0].owned);
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

  // ── POST/DELETE /decks/:id/share + GET /decks/share/:token + clone ───────

  describe("Share deck flow", () => {
    let shareDeckId: string;
    let shareToken: string;

    it("creates a deck to share", async () => {
      const res = await app.fetch(
        req("POST", "/decks", {
          name: "Shareable",
          format: "freeform",
          description: "A friendly deck",
        }),
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      shareDeckId = json.id;
      expect(json.isPublic).toBe(false);
      expect(json.shareToken).toBeNull();
    });

    it("reports an unshared deck as { shareToken: null, isPublic: false } on GET /decks/:id/share", async () => {
      const res = await app.fetch(req("GET", `/decks/${shareDeckId}/share`));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.shareToken).toBeNull();
      expect(json.isPublic).toBe(false);
    });

    it("generates a share token on POST /decks/:id/share", async () => {
      const res = await app.fetch(req("POST", `/decks/${shareDeckId}/share`));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isPublic).toBe(true);
      expect(json.shareToken).toMatch(/^[A-Za-z0-9]{12}$/u);
      shareToken = json.shareToken;
    });

    it("reflects the shared state on GET /decks/:id/share", async () => {
      const res = await app.fetch(req("GET", `/decks/${shareDeckId}/share`));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isPublic).toBe(true);
      expect(json.shareToken).toBe(shareToken);
    });

    it("is idempotent: re-sharing returns the same token", async () => {
      const res = await app.fetch(req("POST", `/decks/${shareDeckId}/share`));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isPublic).toBe(true);
      // Re-share does NOT churn the token — the existing one is returned.
      expect(json.shareToken).toBe(shareToken);

      // And the original URL still resolves.
      const stillResolves = await app.fetch(req("GET", `/decks/share/${shareToken}`));
      expect(stillResolves.status).toBe(200);
    });

    it("rotates the token on POST /decks/:id/share/rotate; old token stops resolving", async () => {
      const oldToken = shareToken;
      const res = await app.fetch(req("POST", `/decks/${shareDeckId}/share/rotate`));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isPublic).toBe(true);
      expect(json.shareToken).toMatch(/^[A-Za-z0-9]{12}$/u);
      expect(json.shareToken).not.toBe(oldToken);

      // Old token is dead, new token resolves.
      const oldTokenGet = await app.fetch(req("GET", `/decks/share/${oldToken}`));
      expect(oldTokenGet.status).toBe(404);
      const newTokenGet = await app.fetch(req("GET", `/decks/share/${json.shareToken}`));
      expect(newTokenGet.status).toBe(200);

      // Track the live token for the remaining tests in this flow.
      shareToken = json.shareToken;
    });

    it("reflects isPublic=true and shareToken on GET /decks/:id", async () => {
      const res = await app.fetch(req("GET", `/decks/${shareDeckId}`));
      const json = await res.json();
      expect(json.deck.isPublic).toBe(true);
      expect(json.deck.shareToken).toBe(shareToken);
    });

    it("returns the deck to anonymous callers via GET /decks/share/:token", async () => {
      const res = await app.fetch(req("GET", `/decks/share/${shareToken}`));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.deck.id).toBe(shareDeckId);
      expect(json.deck.name).toBe("Shareable");
      expect(json.deck.description).toBe("A friendly deck");
      expect(json.owner.displayName).toBeTypeOf("string");
      expect(json.deck).not.toHaveProperty("shareToken");
      expect(json.deck).not.toHaveProperty("isPublic");
    });

    it("clones the shared deck as a second user via POST /decks/share/:token/clone", () => {
      const otherUser = createTestContext("a0000000-0008-4000-a000-000000000002");
      if (!otherUser) {
        return;
      } // guarded by outer skipIf
      return (async () => {
        const res = await otherUser.app.fetch(req("POST", `/decks/share/${shareToken}/clone`));
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.deckId).toBeTypeOf("string");
        expect(json.deckId).not.toBe(shareDeckId);

        // Verify the clone exists under the second user, private, named "Copy of ..."
        const detail = await otherUser.app.fetch(req("GET", `/decks/${json.deckId}`));
        expect(detail.status).toBe(200);
        const detailJson = await detail.json();
        expect(detailJson.deck.name).toBe("Copy of Shareable");
        expect(detailJson.deck.isPublic).toBe(false);
        expect(detailJson.deck.isWanted).toBe(false);
      })();
    });

    it("404s the share URL after DELETE /decks/:id/share", async () => {
      const del = await app.fetch(req("DELETE", `/decks/${shareDeckId}/share`));
      expect(del.status).toBe(204);

      const get = await app.fetch(req("GET", `/decks/share/${shareToken}`));
      expect(get.status).toBe(404);

      // GET /decks/:id/share reflects the now-unshared state (still owner-only,
      // not a 404 for an owned deck).
      const state = await app.fetch(req("GET", `/decks/${shareDeckId}/share`));
      expect(state.status).toBe(200);
      const stateJson = await state.json();
      expect(stateJson.shareToken).toBeNull();
      expect(stateJson.isPublic).toBe(false);
    });

    it("re-sharing after an unshare mints a fresh token; the deleted token stays dead", async () => {
      const deadToken = shareToken;
      const res = await app.fetch(req("POST", `/decks/${shareDeckId}/share`));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isPublic).toBe(true);
      expect(json.shareToken).not.toBe(deadToken);

      const deadTokenGet = await app.fetch(req("GET", `/decks/share/${deadToken}`));
      expect(deadTokenGet.status).toBe(404);

      const newTokenGet = await app.fetch(req("GET", `/decks/share/${json.shareToken}`));
      expect(newTokenGet.status).toBe(200);
    });

    it("404s get-share/share/rotate/unshare/clone for non-existent decks or tokens", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const getShareRes = await app.fetch(req("GET", `/decks/${fakeId}/share`));
      expect(getShareRes.status).toBe(404);

      const shareRes = await app.fetch(req("POST", `/decks/${fakeId}/share`));
      expect(shareRes.status).toBe(404);

      const rotateRes = await app.fetch(req("POST", `/decks/${fakeId}/share/rotate`));
      expect(rotateRes.status).toBe(404);

      const unshareRes = await app.fetch(req("DELETE", `/decks/${fakeId}/share`));
      expect(unshareRes.status).toBe(404);

      const cloneRes = await app.fetch(req("POST", "/decks/share/nonexistent-token/clone"));
      expect(cloneRes.status).toBe(404);
    });
  });
});
