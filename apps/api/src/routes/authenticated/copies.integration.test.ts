import { describe, expect, it } from "vitest";

import { PRINTING_1, PRINTING_2 } from "../../test/fixtures/constants.js";
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
    it("returns all copies for the user", async () => {
      const res = await app.fetch(req("GET", "/copies"));
      expect(res.status).toBe(200);

      const json = (await res.json()) as { items: Record<string, unknown>[] };
      expect(Array.isArray(json.items)).toBe(true);
      // 3 from first add + 1 from inbox add = 4
      expect(json.items.length).toBe(4);

      const copy = json.items[0];
      expect(copy.id).toBeTypeOf("string");
      expect(copy.printingId).toBeTypeOf("string");
      expect(copy.collectionId).toBeTypeOf("string");
      expect(copy.createdAt).toBeTypeOf("string");
    });
  });

  // ── GET /copies/count-by-collection ────────────────────────────────────────

  describe("GET /copies/count-by-collection", () => {
    it("returns per-(printing, collection) breakdown", async () => {
      const res = await app.fetch(req("GET", "/copies/count-by-collection"));
      expect(res.status).toBe(200);

      const json = (await res.json()) as {
        items: Record<string, { collectionId: string; collectionName: string; count: number }[]>;
      };
      // 2 of PRINTING_1, 2 of PRINTING_2 (1 explicit + 1 inbox) — summed across collections
      const sumFor = (printingId: string) =>
        (json.items[printingId] ?? []).reduce((total, row) => total + row.count, 0);
      expect(sumFor(PRINTING_1.id)).toBe(2);
      expect(sumFor(PRINTING_2.id)).toBe(2);
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
      const listRes = await app.fetch(req("GET", "/copies"));
      const list = (await listRes.json()) as { items: { id: string; collectionId: string }[] };
      const moved = list.items.find((item) => item.id === copyIds[0]);
      expect(moved?.collectionId).toBe(secondCollectionId);
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
      const listRes = await app.fetch(req("GET", "/copies"));
      const list = (await listRes.json()) as { items: { id: string }[] };
      expect(list.items.find((item) => item.id === copyIds[2])).toBeUndefined();
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

  // ── Event logging ────────────────────────────────────────────────────────────

  describe("Event logging", () => {
    it("created collection events for copy operations", async () => {
      const res = await app.fetch(req("GET", "/collection-events"));
      expect(res.status).toBe(200);

      const json = (await res.json()) as { items: { action: string }[] };
      const actions = json.items.map((e) => e.action);
      // Should have: added (x3 from setup), moved, removed
      expect(actions).toContain("added");
      expect(actions).toContain("moved");
      expect(actions).toContain("removed");
    });
  });
});
