import { describe, expect, it } from "vitest";

import { CARD_FURY_UNIT, PRINTING_1, PRINTING_2 } from "../../test/fixtures/constants.js";
import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Copies routes
//
// Uses the shared integration database with pre-seeded OGS card data.
// Only auth is mocked.
// ---------------------------------------------------------------------------

const ctx = createTestContext("a0000000-0003-4000-a000-000000000001");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Copies routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  let collectionId: string;
  let secondCollectionId: string;
  let copyIds: string[] = [];

  // ── Setup: create collections ──────────────────────────────────────────────

  it("setup: creates collections for copy tests", async () => {
    // Trigger inbox creation
    await app.fetch(req("GET", "/collections"));

    const res1 = await app.fetch(req("POST", "/collections", { name: "Main Collection" }));
    collectionId = ((await res1.json()) as { id: string }).id;

    const res2 = await app.fetch(req("POST", "/collections", { name: "Second Collection" }));
    secondCollectionId = ((await res2.json()) as { id: string }).id;
  });

  // ── POST /copies ──────────────────────────────────────────────────────────

  describe("POST /copies", () => {
    it("adds copies to a collection", async () => {
      const res = await app.fetch(
        req("POST", "/copies", {
          copies: [
            { printingId: PRINTING_1.id, collectionId },
            { printingId: PRINTING_1.id, collectionId },
            { printingId: PRINTING_2.id, collectionId },
          ],
        }),
      );
      expect(res.status).toBe(201);

      const json = (await res.json()) as { id: string; printingId: string; collectionId: string }[];
      expect(json).toHaveLength(3);
      expect(json[0].id).toBeTypeOf("string");
      expect(json[0].printingId).toBe(PRINTING_1.id);
      expect(json[0].collectionId).toBe(collectionId);
      copyIds = json.map((c) => c.id);
    });

    it("defaults to inbox when collectionId is omitted", async () => {
      const res = await app.fetch(
        req("POST", "/copies", { copies: [{ printingId: PRINTING_2.id }] }),
      );
      expect(res.status).toBe(201);

      const json = (await res.json()) as { collectionId: string }[];
      // Should go to inbox, which is different from our test collection
      expect(json[0].collectionId).not.toBe(collectionId);
    });

    it("rejects with empty copies array", async () => {
      const res = await app.fetch(req("POST", "/copies", { copies: [] }));
      expect(res.status).toBe(400);
    });

    it("rejects without copies field", async () => {
      const res = await app.fetch(req("POST", "/copies", {}));
      expect(res.status).toBe(400);
    });

    it("rejects invalid printingId format", async () => {
      const res = await app.fetch(
        req("POST", "/copies", { copies: [{ printingId: "not-a-uuid" }] }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── GET /copies ───────────────────────────────────────────────────────────

  describe("GET /copies", () => {
    it("returns all copies for the user with card info", async () => {
      const res = await app.fetch(req("GET", "/copies"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
      // 3 from first add + 1 from inbox add = 4
      expect(json.length).toBe(4);

      // Each copy should have denormalized card info
      const copy = json[0];
      expect(copy.id).toBeTypeOf("string");
      expect(copy.printingId).toBeTypeOf("string");
      expect(copy.collectionId).toBeTypeOf("string");
      expect(copy.cardName).toBe(CARD_FURY_UNIT.name);
      expect(copy.cardType).toBe(CARD_FURY_UNIT.type);
    });
  });

  // ── GET /copies/count ─────────────────────────────────────────────────────

  describe("GET /copies/count", () => {
    it("returns counts per printing", async () => {
      const res = await app.fetch(req("GET", "/copies/count"));
      expect(res.status).toBe(200);

      const json = await res.json();
      // 2 of PRINTING_1, 2 of PRINTING_2 (1 explicit + 1 inbox)
      expect(json[PRINTING_1.id]).toBe(2);
      expect(json[PRINTING_2.id]).toBe(2);
    });
  });

  // ── GET /copies/:id ───────────────────────────────────────────────────────

  describe("GET /copies/:id", () => {
    it("returns a single copy by ID", async () => {
      const res = await app.fetch(req("GET", `/copies/${copyIds[0]}`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.id).toBe(copyIds[0]);
      expect(json.collectionId).toBe(collectionId);
      expect(json.cardName).toBe(CARD_FURY_UNIT.name);
      // Should include the same fields as GET /copies
      expect(json.artVariant).toBeTypeOf("string");
      expect(json.isSigned).toBe(false);
      expect(json.finish).toBe("normal");
      expect(json.artist).toBeTypeOf("string");
    });

    it("returns 404 for non-existent copy", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/copies/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── POST /copies/move ─────────────────────────────────────────────────────

  describe("POST /copies/move", () => {
    it("moves copies to another collection", async () => {
      const res = await app.fetch(
        req("POST", "/copies/move", {
          copyIds: [copyIds[0]],
          toCollectionId: secondCollectionId,
        }),
      );
      expect(res.status).toBe(204);

      // Verify the copy is now in the second collection
      const copyRes = await app.fetch(req("GET", `/copies/${copyIds[0]}`));
      const copy = await copyRes.json();
      expect(copy.collectionId).toBe(secondCollectionId);
    });

    it("rejects moving to non-existent collection", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", "/copies/move", { copyIds: [copyIds[1]], toCollectionId: fakeId }),
      );
      expect(res.status).toBe(404);
    });

    it("rejects with empty copyIds", async () => {
      const res = await app.fetch(
        req("POST", "/copies/move", { copyIds: [], toCollectionId: secondCollectionId }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── POST /copies/dispose ──────────────────────────────────────────────────

  describe("POST /copies/dispose", () => {
    it("disposes (hard-deletes) copies", async () => {
      const res = await app.fetch(req("POST", "/copies/dispose", { copyIds: [copyIds[2]] }));
      expect(res.status).toBe(204);

      // Verify the copy is gone
      const copyRes = await app.fetch(req("GET", `/copies/${copyIds[2]}`));
      expect(copyRes.status).toBe(404);
    });

    it("rejects with empty copyIds", async () => {
      const res = await app.fetch(req("POST", "/copies/dispose", { copyIds: [] }));
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent copy IDs", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("POST", "/copies/dispose", { copyIds: [fakeId] }));
      expect(res.status).toBe(404);
    });
  });

  // ── Activity logging ────────────────────────────────────────────────────────

  describe("Activity logging", () => {
    it("created activities for copy operations", async () => {
      const res = await app.fetch(req("GET", "/activities"));
      expect(res.status).toBe(200);

      const json = (await res.json()) as { items: { type: string }[] };
      const types = json.items.map((a) => a.type);
      // Should have: acquisition (x2), reorganization (move), disposal
      expect(types).toContain("acquisition");
      expect(types).toContain("reorganization");
      expect(types).toContain("disposal");
    });
  });
});
