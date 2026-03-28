import { describe, expect, it } from "vitest";

import { PRINTING_1 } from "../../test/fixtures/constants.js";
import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Trade Lists routes
//
// Uses the shared integration database with pre-seeded OGS card data.
// Only auth is mocked.
// ---------------------------------------------------------------------------

const ctx = createTestContext("a0000000-0006-4000-a000-000000000001");

describe.skipIf(!ctx)("Trade Lists routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  let tradeListId: string;
  let secondTradeListId: string;
  let itemId: string;
  let copyId: string;

  // ── Setup: create a copy to add to trade list ──────────────────────────────

  it("setup: creates a copy for trade list tests", async () => {
    await app.fetch(req("GET", "/collections")); // ensure inbox
    const colRes = await app.fetch(req("POST", "/collections", { name: "Trade Source" }));
    const col = (await colRes.json()) as { id: string };

    const copyRes = await app.fetch(
      req("POST", "/copies", { copies: [{ printingId: PRINTING_1.id, collectionId: col.id }] }),
    );
    const copies = (await copyRes.json()) as { id: string }[];
    copyId = copies[0].id;
  });

  // ── POST /trade-lists ─────────────────────────────────────────────────────

  describe("POST /trade-lists", () => {
    it("creates a trade list", async () => {
      const res = await app.fetch(req("POST", "/trade-lists", { name: "My Trades" }));
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.id).toBeTypeOf("string");
      expect(json.name).toBe("My Trades");
      tradeListId = json.id;
    });

    it("creates another for deletion tests", async () => {
      const res = await app.fetch(req("POST", "/trade-lists", { name: "Delete Me" }));
      expect(res.status).toBe(201);
      secondTradeListId = ((await res.json()) as { id: string }).id;
    });

    it("rejects without name", async () => {
      const res = await app.fetch(req("POST", "/trade-lists", {}));
      expect(res.status).toBe(400);
    });
  });

  // ── GET /trade-lists ──────────────────────────────────────────────────────

  describe("GET /trade-lists", () => {
    it("returns all trade lists", async () => {
      const res = await app.fetch(req("GET", "/trade-lists"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBe(2);
    });
  });

  // ── GET /trade-lists/:id ──────────────────────────────────────────────────

  describe("GET /trade-lists/:id", () => {
    it("returns { tradeList, items } shape", async () => {
      const res = await app.fetch(req("GET", `/trade-lists/${tradeListId}`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.tradeList).toBeDefined();
      expect(json.tradeList.id).toBe(tradeListId);
      expect(json.tradeList.name).toBe("My Trades");
      expect(json.items).toBeDefined();
      expect(Array.isArray(json.items)).toBe(true);
    });

    it("returns 404 for non-existent", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/trade-lists/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /trade-lists/:id ────────────────────────────────────────────────

  describe("PATCH /trade-lists/:id", () => {
    it("updates trade list name", async () => {
      const res = await app.fetch(
        req("PATCH", `/trade-lists/${tradeListId}`, { name: "Renamed Trades" }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.name).toBe("Renamed Trades");
    });
  });

  // ── POST /trade-lists/:id/items ───────────────────────────────────────────

  describe("POST /trade-lists/:id/items", () => {
    it("adds a copy to the trade list", async () => {
      const res = await app.fetch(req("POST", `/trade-lists/${tradeListId}/items`, { copyId }));
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.id).toBeTypeOf("string");
      itemId = json.id;
    });

    it("returns 404 for non-existent trade list", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("POST", `/trade-lists/${fakeId}/items`, { copyId }));
      expect(res.status).toBe(404);
    });

    it("returns 404 for non-existent copy", async () => {
      const fakeCopyId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", `/trade-lists/${tradeListId}/items`, { copyId: fakeCopyId }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /trade-lists/:id/items/:itemId ──────────────────────────────────

  describe("DELETE /trade-lists/:id/items/:itemId", () => {
    it("removes an item from the trade list", async () => {
      const res = await app.fetch(req("DELETE", `/trade-lists/${tradeListId}/items/${itemId}`));
      expect(res.status).toBe(204);
    });

    it("returns 404 for non-existent item", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("DELETE", `/trade-lists/${tradeListId}/items/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /trade-lists/:id ───────────────────────────────────────────────

  describe("DELETE /trade-lists/:id", () => {
    it("deletes a trade list", async () => {
      const res = await app.fetch(req("DELETE", `/trade-lists/${secondTradeListId}`));
      expect(res.status).toBe(204);
    });

    it("returns 404 after deletion", async () => {
      const res = await app.fetch(req("GET", `/trade-lists/${secondTradeListId}`));
      expect(res.status).toBe(404);
    });
  });
});
