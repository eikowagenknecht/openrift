import { describe, expect, it } from "vitest";

import { CARD_FURY_UNIT, PRINTING_1 } from "../../test/fixtures/constants.js";
import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Wish Lists routes
//
// Uses the shared integration database with pre-seeded OGS card data.
// Only auth is mocked.
// ---------------------------------------------------------------------------

const ctx = createTestContext("a0000000-0005-4000-a000-000000000001");

describe.skipIf(!ctx)("Wish Lists routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  let wishListId: string;
  let secondWishListId: string;
  let itemId: string;

  // ── POST /wish-lists ──────────────────────────────────────────────────────

  describe("POST /wish-lists", () => {
    it("creates a wish list", async () => {
      const res = await app.fetch(req("POST", "/wish-lists", { name: "My Wish List" }));
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.id).toBeTypeOf("string");
      expect(json.name).toBe("My Wish List");
      expect(json.createdAt).toBeTypeOf("string");
      wishListId = json.id;
    });

    it("creates another wish list for deletion tests", async () => {
      const res = await app.fetch(req("POST", "/wish-lists", { name: "Delete Me" }));
      expect(res.status).toBe(201);
      secondWishListId = ((await res.json()) as { id: string }).id;
    });

    it("rejects without name", async () => {
      const res = await app.fetch(req("POST", "/wish-lists", {}));
      expect(res.status).toBe(400);
    });
  });

  // ── GET /wish-lists ───────────────────────────────────────────────────────

  describe("GET /wish-lists", () => {
    it("returns all wish lists", async () => {
      const res = await app.fetch(req("GET", "/wish-lists"));
      expect(res.status).toBe(200);

      const json = (await res.json()) as { items: unknown[] };
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items.length).toBe(2);
    });
  });

  // ── GET /wish-lists/:id ───────────────────────────────────────────────────

  describe("GET /wish-lists/:id", () => {
    it("returns { wishList, items } shape", async () => {
      const res = await app.fetch(req("GET", `/wish-lists/${wishListId}`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.wishList).toBeDefined();
      expect(json.wishList.id).toBe(wishListId);
      expect(json.wishList.name).toBe("My Wish List");
      expect(json.items).toBeDefined();
      expect(Array.isArray(json.items)).toBe(true);
    });

    it("returns 404 for non-existent", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/wish-lists/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /wish-lists/:id ─────────────────────────────────────────────────

  describe("PATCH /wish-lists/:id", () => {
    it("updates wish list name", async () => {
      const res = await app.fetch(
        req("PATCH", `/wish-lists/${wishListId}`, { name: "Renamed Wish List" }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.name).toBe("Renamed Wish List");
    });

    it("returns 404 for non-existent", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("PATCH", `/wish-lists/${fakeId}`, { name: "Nope" }));
      expect(res.status).toBe(404);
    });
  });

  // ── POST /wish-lists/:id/items ────────────────────────────────────────────

  describe("POST /wish-lists/:id/items", () => {
    it("adds an item by cardId", async () => {
      const res = await app.fetch(
        req("POST", `/wish-lists/${wishListId}/items`, {
          cardId: CARD_FURY_UNIT.id,
          quantityDesired: 3,
        }),
      );
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.id).toBeTypeOf("string");
      itemId = json.id;
    });

    it("adds an item by printingId", async () => {
      const res = await app.fetch(
        req("POST", `/wish-lists/${wishListId}/items`, {
          printingId: PRINTING_1.id,
          quantityDesired: 1,
        }),
      );
      expect(res.status).toBe(201);
    });

    it("rejects adding item with both cardId and printingId", async () => {
      const res = await app.fetch(
        req("POST", `/wish-lists/${wishListId}/items`, {
          cardId: CARD_FURY_UNIT.id,
          printingId: PRINTING_1.id,
          quantityDesired: 1,
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects adding item with neither cardId nor printingId", async () => {
      const res = await app.fetch(
        req("POST", `/wish-lists/${wishListId}/items`, { quantityDesired: 1 }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent wish list", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", `/wish-lists/${fakeId}/items`, {
          cardId: CARD_FURY_UNIT.id,
          quantityDesired: 1,
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /wish-lists/:id/items/:itemId ────────────────────────────────────

  describe("PATCH /wish-lists/:id/items/:itemId", () => {
    it("updates item quantity", async () => {
      const res = await app.fetch(
        req("PATCH", `/wish-lists/${wishListId}/items/${itemId}`, { quantityDesired: 5 }),
      );
      expect(res.status).toBe(200);
    });

    it("returns 404 for non-existent item", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("PATCH", `/wish-lists/${wishListId}/items/${fakeId}`, { quantityDesired: 1 }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /wish-lists/:id/items/:itemId ───────────────────────────────────

  describe("DELETE /wish-lists/:id/items/:itemId", () => {
    it("deletes an item", async () => {
      const res = await app.fetch(req("DELETE", `/wish-lists/${wishListId}/items/${itemId}`));
      expect(res.status).toBe(204);
    });

    it("returns 404 for non-existent item", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("DELETE", `/wish-lists/${wishListId}/items/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /wish-lists/:id ────────────────────────────────────────────────

  describe("DELETE /wish-lists/:id", () => {
    it("deletes a wish list", async () => {
      const res = await app.fetch(req("DELETE", `/wish-lists/${secondWishListId}`));
      expect(res.status).toBe(204);
    });

    it("returns 404 after deletion", async () => {
      const res = await app.fetch(req("GET", `/wish-lists/${secondWishListId}`));
      expect(res.status).toBe(404);
    });
  });
});
