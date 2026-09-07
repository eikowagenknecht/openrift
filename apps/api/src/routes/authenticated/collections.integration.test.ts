import type { CollectionResponse, CollectionShareResponse } from "@openrift/shared";
import { beforeAll, describe, expect, it } from "vitest";

import { PRINTING_1, PRINTING_2 } from "../../test/fixtures/constants.js";
import { createTestContext, req } from "../../test/integration-context.js";
import { readJson } from "../../test/read-json.js";

const USER_ID = "a0000000-0002-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

describe.skipIf(!ctx)("Collections routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  let collectionId: string;
  let secondCollectionId: string;
  let inboxId: string;

  beforeAll(async () => {
    // Integration users are inserted directly into the users table, bypassing
    // the signup hook that normally creates the inbox, so seed it here.
    await db
      .insertInto("collections")
      .values({ userId: USER_ID, groupId: null, name: "Inbox", isInbox: true, sortOrder: 0 })
      .onConflict((oc) => oc.doNothing())
      .execute();
  });

  describe("POST /collections", () => {
    it("creates a collection and returns full DTO shape", async () => {
      const res = await app.fetch(req("POST", "/collections", { name: "Test Collection" }));
      expect(res.status).toBe(201);

      const json = (await readJson(res)) as CollectionResponse;
      expect(json.id).toBeTypeOf("string");
      expect(json.name).toBe("Test Collection");
      expect(json.description).toBeNull();
      expect(json.isInbox).toBe(false);
      expect(json.availableForDeckbuilding).toBe(true);
      // sortOrder is assigned as max(existing)+1; with the seeded inbox at 0
      // the exact value depends on baseline, so just assert the shape.
      expect(json.sortOrder).toBeTypeOf("number");
      expect(json.createdAt).toBeTypeOf("string");
      expect(json.updatedAt).toBeTypeOf("string");
      collectionId = json.id;
    });

    it("creates a collection with name and description", async () => {
      const res = await app.fetch(
        req("POST", "/collections", { name: "Described", description: "A fine collection" }),
      );
      expect(res.status).toBe(201);

      const json = (await readJson(res)) as CollectionResponse;
      expect(json.name).toBe("Described");
      expect(json.description).toBe("A fine collection");
      secondCollectionId = json.id;
    });

    it("creates a collection with availableForDeckbuilding=false", async () => {
      const res = await app.fetch(
        req("POST", "/collections", { name: "Non-deck", availableForDeckbuilding: false }),
      );
      expect(res.status).toBe(201);

      const json = (await readJson(res)) as CollectionResponse;
      expect(json.availableForDeckbuilding).toBe(false);
    });

    it("rejects creation without a name", async () => {
      const res = await app.fetch(req("POST", "/collections", {}));
      expect(res.status).toBe(400);
    });

    it("rejects creation with empty name", async () => {
      const res = await app.fetch(req("POST", "/collections", { name: "" }));
      expect(res.status).toBe(400);
    });

    it("rejects creation with name exceeding 200 chars", async () => {
      const res = await app.fetch(req("POST", "/collections", { name: "x".repeat(201) }));
      expect(res.status).toBe(400);
    });
  });

  describe("GET /collections", () => {
    it("includes the user's inbox collection", async () => {
      const res = await app.fetch(req("GET", "/collections"));
      expect(res.status).toBe(200);

      const json = (await readJson(res)) as { items: CollectionResponse[] };
      const inbox = json.items.find((c) => c.isInbox);
      expect(inbox).toBeDefined();
      inboxId = (inbox as NonNullable<typeof inbox>).id;
    });

    it("returns all collections for the user", async () => {
      const res = await app.fetch(req("GET", "/collections"));
      expect(res.status).toBe(200);

      const json = (await readJson(res)) as { items: CollectionResponse[] };
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items.length).toBeGreaterThanOrEqual(4);
    });

    it("returns inbox first, then remaining collections sorted", async () => {
      const res = await app.fetch(req("GET", "/collections"));
      const json = (await readJson(res)) as { items: CollectionResponse[] };
      expect(json.items[0].isInbox).toBe(true);
      // Personal collections are ordered by sortOrder (then name as a tiebreak),
      // not by name alone — verify the rest are in ascending sortOrder.
      const rest = json.items.slice(1);
      const bySortOrder = rest.toSorted((a, b) => a.sortOrder - b.sortOrder);
      expect(rest).toEqual(bySortOrder);
    });
  });

  describe("GET /collections/:id", () => {
    it("returns a single collection by ID", async () => {
      const res = await app.fetch(req("GET", `/collections/${collectionId}`));
      expect(res.status).toBe(200);

      const json = (await readJson(res)) as CollectionResponse;
      expect(json.id).toBe(collectionId);
      expect(json.name).toBe("Test Collection");
    });

    it("returns 404 for non-existent collection", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/collections/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /collections/:id", () => {
    it("updates the collection name", async () => {
      const res = await app.fetch(
        req("PATCH", `/collections/${collectionId}`, { name: "Renamed Collection" }),
      );
      expect(res.status).toBe(200);

      const json = (await readJson(res)) as CollectionResponse;
      expect(json.name).toBe("Renamed Collection");
    });

    it("updates the collection description", async () => {
      const res = await app.fetch(
        req("PATCH", `/collections/${collectionId}`, { description: "Updated desc" }),
      );
      expect(res.status).toBe(200);

      const json = (await readJson(res)) as CollectionResponse;
      expect(json.description).toBe("Updated desc");
    });

    it("sets the viewer's deck-building availability via PUT /deckbuilding", async () => {
      const res = await app.fetch(
        req("PUT", `/collections/${collectionId}/deckbuilding`, { available: false }),
      );
      expect(res.status).toBe(204);

      const getRes = await app.fetch(req("GET", `/collections/${collectionId}`));
      const json = (await readJson(getRes)) as CollectionResponse;
      expect(json.availableForDeckbuilding).toBe(false);
    });

    it("sets the viewer's sidebar visibility via PUT /sidebar", async () => {
      const res = await app.fetch(
        req("PUT", `/collections/${collectionId}/sidebar`, { hidden: true }),
      );
      expect(res.status).toBe(204);

      const getRes = await app.fetch(req("GET", `/collections/${collectionId}`));
      const json = (await readJson(getRes)) as CollectionResponse;
      expect(json.sidebarHidden).toBe(true);

      const restore = await app.fetch(
        req("PUT", `/collections/${collectionId}/sidebar`, { hidden: false }),
      );
      expect(restore.status).toBe(204);
      const restored = (await readJson(
        await app.fetch(req("GET", `/collections/${collectionId}`)),
      )) as CollectionResponse;
      expect(restored.sidebarHidden).toBe(false);
    });

    it("updates sortOrder", async () => {
      const res = await app.fetch(req("PATCH", `/collections/${collectionId}`, { sortOrder: 5 }));
      expect(res.status).toBe(200);

      const json = (await readJson(res)) as CollectionResponse;
      expect(json.sortOrder).toBe(5);
    });

    it("returns 404 for non-existent collection", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("PATCH", `/collections/${fakeId}`, { name: "Nope" }));
      expect(res.status).toBe(404);
    });
  });

  describe("GET /collections/:id/copies", () => {
    it("returns empty array for a collection with no copies", async () => {
      const res = await app.fetch(req("GET", `/collections/${collectionId}/copies`));
      expect(res.status).toBe(200);

      const json = (await readJson(res)) as { items: unknown[] };
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items).toHaveLength(0);
    });

    it("returns 404 for non-existent collection", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/collections/${fakeId}/copies`));
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /collections/:id", () => {
    it("rejects deleting the inbox collection", async () => {
      const res = await app.fetch(req("DELETE", `/collections/${inboxId}`));
      expect(res.status).toBe(409);
    });

    // A non-empty shared (group-owned) collection has no inbox to drain into,
    // so deletion is a 409 conflict, not a 400.
    it("returns 409 when deleting a non-empty shared (group) collection", async () => {
      const groupId = "a0000000-0002-4000-a000-0000000000a0";
      const groupCollectionId = "a0000000-0002-4000-a000-0000000000a1";
      await db
        .insertInto("friendGroups")
        .values({ id: groupId, slug: "del-409-grp", name: "Delete 409 Group" })
        .execute();
      await db
        .insertInto("friendGroupMembers")
        .values({ groupId, userId: USER_ID, role: "owner" })
        .execute();
      await db
        .insertInto("collections")
        .values({
          id: groupCollectionId,
          userId: null,
          groupId,
          name: "Group Binder",
          isInbox: false,
          sortOrder: 0,
        })
        .execute();
      await db
        .insertInto("copies")
        .values({ collectionId: groupCollectionId, printingId: PRINTING_1.id })
        .execute();

      const res = await app.fetch(req("DELETE", `/collections/${groupCollectionId}`));
      expect(res.status).toBe(409);

      const stillThere = await db
        .selectFrom("collections")
        .select("id")
        .where("id", "=", groupCollectionId)
        .executeTakeFirst();
      expect(stillThere).toBeDefined();

      await db.deleteFrom("copies").where("collectionId", "=", groupCollectionId).execute();
      await db.deleteFrom("collections").where("id", "=", groupCollectionId).execute();
      await db.deleteFrom("friendGroupMembers").where("groupId", "=", groupId).execute();
      await db.deleteFrom("friendGroups").where("id", "=", groupId).execute();
    });

    it("deletes a collection and auto-moves its copies to inbox", async () => {
      const addRes = await app.fetch(
        req("POST", "/copies", {
          copies: [
            { printingId: PRINTING_1.id, collectionId: secondCollectionId },
            { printingId: PRINTING_2.id, collectionId: secondCollectionId },
          ],
        }),
      );
      expect(addRes.status).toBe(201);
      const added = (await readJson(addRes)) as { items: { id: string }[] };
      const addedIds = new Set(added.items.map((c) => c.id));

      const res = await app.fetch(req("DELETE", `/collections/${secondCollectionId}`));
      expect(res.status).toBe(204);

      const inboxCopiesRes = await app.fetch(req("GET", `/collections/${inboxId}/copies`));
      const inboxCopies = (await readJson(inboxCopiesRes)) as { items: { id: string }[] };
      const inboxIds = new Set(inboxCopies.items.map((c) => c.id));
      for (const id of addedIds) {
        expect(inboxIds.has(id)).toBe(true);
      }
    });

    it("returns 404 after deletion", async () => {
      const res = await app.fetch(req("GET", `/collections/${secondCollectionId}`));
      expect(res.status).toBe(404);
    });

    it("deletes a collection that has prior 'removed' events in its history", async () => {
      // chk_collection_events_collection_presence requires 'removed' events to
      // keep from_collection_id NOT NULL, so FK ON DELETE SET NULL alone would violate it.
      const createRes = await app.fetch(req("POST", "/collections", { name: "Has History" }));
      expect(createRes.status).toBe(201);
      const { id: historyCollectionId } = (await readJson(createRes)) as { id: string };

      const addRes = await app.fetch(
        req("POST", "/copies", {
          copies: [{ printingId: PRINTING_1.id, collectionId: historyCollectionId }],
        }),
      );
      expect(addRes.status).toBe(201);
      const [copy] = ((await readJson(addRes)) as { items: { id: string }[] }).items;

      const disposeRes = await app.fetch(req("POST", "/copies/dispose", { copyIds: [copy.id] }));
      expect(disposeRes.status).toBe(204);

      const res = await app.fetch(req("DELETE", `/collections/${historyCollectionId}`));
      expect(res.status).toBe(204);
    });

    it("deletes a collection that has prior 'moved' events in its history", async () => {
      // Same constraint, for the 'moved' branch: both from_collection_id and
      // to_collection_id must stay NOT NULL.
      const createSrcRes = await app.fetch(req("POST", "/collections", { name: "Move Source" }));
      const { id: srcId } = (await readJson(createSrcRes)) as { id: string };
      const createDstRes = await app.fetch(
        req("POST", "/collections", { name: "Move Destination" }),
      );
      const { id: dstId } = (await readJson(createDstRes)) as { id: string };

      const addRes = await app.fetch(
        req("POST", "/copies", {
          copies: [{ printingId: PRINTING_2.id, collectionId: srcId }],
        }),
      );
      const [copy] = ((await readJson(addRes)) as { items: { id: string }[] }).items;

      const moveRes = await app.fetch(
        req("POST", "/copies/move", { copyIds: [copy.id], toCollectionId: dstId }),
      );
      expect(moveRes.status).toBe(204);

      const delSrcRes = await app.fetch(req("DELETE", `/collections/${srcId}`));
      expect(delSrcRes.status).toBe(204);
      const delDstRes = await app.fetch(req("DELETE", `/collections/${dstId}`));
      expect(delDstRes.status).toBe(204);
    });

    it("returns 404 when deleting non-existent collection", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("DELETE", `/collections/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  describe("POST /collections/:id/clear", () => {
    it("removes every copy but keeps the collection", async () => {
      // The inbox can never be deleted; clear is its delete-equivalent.
      const addRes = await app.fetch(
        req("POST", "/copies", {
          copies: [
            { printingId: PRINTING_1.id, collectionId: inboxId },
            { printingId: PRINTING_2.id, collectionId: inboxId },
          ],
        }),
      );
      expect(addRes.status).toBe(201);

      const res = await app.fetch(req("POST", `/collections/${inboxId}/clear`));
      expect(res.status).toBe(200);
      const json = (await readJson(res)) as { removedCount: number; keptCopyIds: string[] };
      expect(json.removedCount).toBeGreaterThanOrEqual(2);
      expect(json.keptCopyIds).toEqual([]);

      const getRes = await app.fetch(req("GET", `/collections/${inboxId}`));
      expect(getRes.status).toBe(200);
      const inbox = (await readJson(getRes)) as CollectionResponse;
      expect(inbox.isInbox).toBe(true);

      const copiesRes = await app.fetch(req("GET", `/collections/${inboxId}/copies`));
      const copies = (await readJson(copiesRes)) as { items: unknown[] };
      expect(copies.items).toEqual([]);
    });

    it("is a no-op on an already-empty collection", async () => {
      const res = await app.fetch(req("POST", `/collections/${inboxId}/clear`));
      expect(res.status).toBe(200);
      const json = (await readJson(res)) as { removedCount: number; keptCopyIds: string[] };
      expect(json.removedCount).toBe(0);
      expect(json.keptCopyIds).toEqual([]);
    });

    it("logs 'removed' events for the cleared copies", async () => {
      // Disposal nulls copy_id on the event via FK; match by from_collection_id.
      const removedEvents = () =>
        db
          .selectFrom("collectionEvents")
          .select("id")
          .where("fromCollectionId", "=", inboxId)
          .where("action", "=", "removed")
          .execute();
      const eventsBefore = await removedEvents();

      const addRes = await app.fetch(
        req("POST", "/copies", {
          copies: [{ printingId: PRINTING_1.id, collectionId: inboxId }],
        }),
      );
      expect(addRes.status).toBe(201);

      const res = await app.fetch(req("POST", `/collections/${inboxId}/clear`));
      expect(res.status).toBe(200);

      const eventsAfter = await removedEvents();
      expect(eventsAfter.length).toBe(eventsBefore.length + 1);
    });

    it("returns 404 for a non-existent collection", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("POST", `/collections/${fakeId}/clear`));
      expect(res.status).toBe(404);
    });
  });

  describe("collection sharing", () => {
    let shareCollectionId: string;

    async function createShareCollection(name: string): Promise<string> {
      const res = await app.fetch(req("POST", "/collections", { name }));
      expect(res.status).toBe(201);
      const json = (await readJson(res)) as CollectionResponse;
      return json.id;
    }

    it("GET reflects the unshared state without 404ing", async () => {
      shareCollectionId = await createShareCollection("Shareable");

      const res = await app.fetch(req("GET", `/collections/${shareCollectionId}/share`));
      expect(res.status).toBe(200);

      const json = (await readJson(res)) as CollectionShareResponse;
      expect(json.shareToken).toBeNull();
      expect(json.isPublic).toBe(false);
    });

    it("POST shares the collection and returns a token", async () => {
      const res = await app.fetch(req("POST", `/collections/${shareCollectionId}/share`));
      expect(res.status).toBe(200);

      const json = (await readJson(res)) as CollectionShareResponse;
      expect(json.shareToken).toBeTypeOf("string");
      expect(json.shareToken).not.toBe("");
      expect(json.isPublic).toBe(true);
    });

    it("GET reflects the shared state after sharing", async () => {
      // Tests share state; re-fetch the token the previous POST minted so the
      // idempotency assertion below has a stable reference.
      const res = await app.fetch(req("GET", `/collections/${shareCollectionId}/share`));
      expect(res.status).toBe(200);

      const json = (await readJson(res)) as CollectionShareResponse;
      expect(json.shareToken).toBeTypeOf("string");
      expect(json.isPublic).toBe(true);
    });

    it("POST is idempotent — re-sharing returns the same token", async () => {
      const firstRes = await app.fetch(req("GET", `/collections/${shareCollectionId}/share`));
      const first = (await readJson(firstRes)) as CollectionShareResponse;
      expect(first.shareToken).toBeTypeOf("string");

      const secondRes = await app.fetch(req("POST", `/collections/${shareCollectionId}/share`));
      expect(secondRes.status).toBe(200);
      const second = (await readJson(secondRes)) as CollectionShareResponse;

      expect(second.shareToken).toBe(first.shareToken);
      expect(second.isPublic).toBe(true);

      const publicRes = await app.fetch(
        req("GET", `/collections/share/${second.shareToken as string}`),
      );
      expect(publicRes.status).toBe(200);
    });

    it("POST rotate mints a new token and the old one stops resolving", async () => {
      const beforeRes = await app.fetch(req("GET", `/collections/${shareCollectionId}/share`));
      const before = (await readJson(beforeRes)) as CollectionShareResponse;
      const oldToken = before.shareToken as string;
      expect(oldToken).toBeTypeOf("string");

      const oldResolvesRes = await app.fetch(req("GET", `/collections/share/${oldToken}`));
      expect(oldResolvesRes.status).toBe(200);

      const rotateRes = await app.fetch(
        req("POST", `/collections/${shareCollectionId}/share/rotate`),
      );
      expect(rotateRes.status).toBe(200);
      const rotated = (await readJson(rotateRes)) as CollectionShareResponse;

      expect(rotated.shareToken).toBeTypeOf("string");
      expect(rotated.shareToken).not.toBe(oldToken);
      expect(rotated.isPublic).toBe(true);

      const oldNowRes = await app.fetch(req("GET", `/collections/share/${oldToken}`));
      expect(oldNowRes.status).toBe(404);
      const newRes = await app.fetch(
        req("GET", `/collections/share/${rotated.shareToken as string}`),
      );
      expect(newRes.status).toBe(200);

      const stateRes = await app.fetch(req("GET", `/collections/${shareCollectionId}/share`));
      const state = (await readJson(stateRes)) as CollectionShareResponse;
      expect(state.shareToken).toBe(rotated.shareToken);
    });

    it("POST rotate on an unshared collection acts as share-now", async () => {
      const freshId = await createShareCollection("Rotate Fresh");

      const rotateRes = await app.fetch(req("POST", `/collections/${freshId}/share/rotate`));
      expect(rotateRes.status).toBe(200);
      const rotated = (await readJson(rotateRes)) as CollectionShareResponse;

      expect(rotated.shareToken).toBeTypeOf("string");
      expect(rotated.isPublic).toBe(true);

      const publicRes = await app.fetch(
        req("GET", `/collections/share/${rotated.shareToken as string}`),
      );
      expect(publicRes.status).toBe(200);
    });

    it("DELETE unshares and the token stops resolving", async () => {
      const stateRes = await app.fetch(req("GET", `/collections/${shareCollectionId}/share`));
      const state = (await readJson(stateRes)) as CollectionShareResponse;
      const liveToken = state.shareToken as string;
      expect(liveToken).toBeTypeOf("string");

      const delRes = await app.fetch(req("DELETE", `/collections/${shareCollectionId}/share`));
      expect(delRes.status).toBe(204);

      const afterRes = await app.fetch(req("GET", `/collections/${shareCollectionId}/share`));
      const after = (await readJson(afterRes)) as CollectionShareResponse;
      expect(after.shareToken).toBeNull();
      expect(after.isPublic).toBe(false);

      const publicRes = await app.fetch(req("GET", `/collections/share/${liveToken}`));
      expect(publicRes.status).toBe(404);
    });

    it("GET share returns 404 for a non-existent collection", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/collections/${fakeId}/share`));
      expect(res.status).toBe(404);
    });

    it("POST rotate returns 404 for a non-existent collection", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("POST", `/collections/${fakeId}/share/rotate`));
      expect(res.status).toBe(404);
    });
  });
});
