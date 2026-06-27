import { afterAll, describe, expect, it } from "vitest";

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
  const { app, db, userId } = ctx!;

  let collectionId: string;
  let secondCollectionId: string;
  let copyIds: string[] = [];

  // ── Setup: create collections ──────────────────────────────────────────────

  it("setup: creates collections for copy tests", async () => {
    // Trigger inbox creation
    await app.fetch(req("GET", "/collections"));

    const res1 = await app.fetch(
      req("POST", "/collections", { id: crypto.randomUUID(), name: "Main Collection" }),
    );
    collectionId = ((await res1.json()) as { id: string }).id;

    const res2 = await app.fetch(
      req("POST", "/collections", { id: crypto.randomUUID(), name: "Second Collection" }),
    );
    secondCollectionId = ((await res2.json()) as { id: string }).id;
  });

  // ── POST /copies ──────────────────────────────────────────────────────────

  describe("POST /copies", () => {
    it("adds copies to a collection", async () => {
      const res = await app.fetch(
        req("POST", "/copies", {
          copies: [
            { id: crypto.randomUUID(), printingId: PRINTING_1.id, collectionId },
            { id: crypto.randomUUID(), printingId: PRINTING_1.id, collectionId },
            { id: crypto.randomUUID(), printingId: PRINTING_2.id, collectionId },
          ],
        }),
      );
      expect(res.status).toBe(201);

      const json = (await res.json()) as {
        items: {
          id: string;
          printingId: string;
          collectionId: string;
          groupId: string | null;
        }[];
      };
      expect(json.items).toHaveLength(3);
      expect(json.items[0].id).toBeTypeOf("string");
      expect(json.items[0].printingId).toBe(PRINTING_1.id);
      expect(json.items[0].collectionId).toBe(collectionId);
      // The 201 body now carries the full CopyResponse shape including groupId,
      // which is null for a personal collection.
      expect(json.items[0]).toHaveProperty("groupId");
      expect(json.items.every((copy) => copy.groupId === null)).toBe(true);
      copyIds = json.items.map((c) => c.id);
    });

    it("defaults to inbox when collectionId is omitted", async () => {
      const res = await app.fetch(
        req("POST", "/copies", {
          copies: [{ id: crypto.randomUUID(), printingId: PRINTING_2.id }],
        }),
      );
      expect(res.status).toBe(201);

      const json = (await res.json()) as { items: { collectionId: string }[] };
      // Should go to inbox, which is different from our test collection
      expect(json.items[0].collectionId).not.toBe(collectionId);
    });

    // ── groupId derivation for group-owned collections ─────────────────────
    // A copy added to a group-owned collection must come back with groupId set
    // to the owning group (the field the web used to synthesize client-side).

    describe("groupId for a group-owned collection", () => {
      let groupId: string;
      let groupCollectionId: string;
      const groupCopyIds: string[] = [];

      afterAll(async () => {
        if (groupCopyIds.length > 0) {
          await db.deleteFrom("copies").where("id", "in", groupCopyIds).execute();
        }
        if (groupCollectionId) {
          await db.deleteFrom("collections").where("id", "=", groupCollectionId).execute();
        }
        if (groupId) {
          // friend_group_members cascades on group delete.
          await db.deleteFrom("friendGroups").where("id", "=", groupId).execute();
        }
      });

      it("returns the owning groupId for copies added to a group collection", async () => {
        // Slug must match ^[a-z0-9][a-z0-9-]{2,29}$ and be unique per run.
        const group = await db
          .insertInto("friendGroups")
          .values({ slug: `rt-grp-${Date.now()}`, name: "Route Copy Group" })
          .returningAll()
          .executeTakeFirstOrThrow();
        groupId = group.id;

        // The acting user must be a member so the collection is writable.
        await db
          .insertInto("friendGroupMembers")
          .values({ groupId, userId, role: "member" })
          .execute();

        // A group-owned collection (user_id NULL, group_id set).
        const pooled = await db
          .insertInto("collections")
          .values({ groupId, name: "Pooled Box", isInbox: false, sortOrder: 0 })
          .returningAll()
          .executeTakeFirstOrThrow();
        groupCollectionId = pooled.id;

        const res = await app.fetch(
          req("POST", "/copies", {
            copies: [
              { id: crypto.randomUUID(), printingId: PRINTING_1.id, collectionId: pooled.id },
            ],
          }),
        );
        expect(res.status).toBe(201);

        const json = (await res.json()) as {
          items: {
            id: string;
            collectionId: string;
            groupId: string | null;
          }[];
        };
        expect(json.items).toHaveLength(1);
        expect(json.items[0].collectionId).toBe(pooled.id);
        expect(json.items[0].groupId).toBe(groupId);
        groupCopyIds.push(json.items[0].id);
      });
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
        req("POST", "/copies", {
          copies: [{ id: crypto.randomUUID(), printingId: "not-a-uuid" }],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 (not 500) for a valid-format printingId that does not exist (F8)", async () => {
      const res = await app.fetch(
        req("POST", "/copies", {
          copies: [{ id: crypto.randomUUID(), printingId: "00000000-0000-4000-8000-000000000000" }],
        }),
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
      // Mutations carry the Postgres txid for Electric stream matching.
      expect(res.status).toBe(200);
      const moveBody = (await res.json()) as { txid: number };
      expect(moveBody.txid).toEqual(expect.any(Number));

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
      expect(res.status).toBe(200);
      const disposed = (await res.json()) as { txid: number };
      expect(disposed.txid).toEqual(expect.any(Number));

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
