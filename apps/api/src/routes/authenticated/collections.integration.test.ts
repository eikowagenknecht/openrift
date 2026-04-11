import type { CollectionResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { PRINTING_1, PRINTING_2 } from "../../test/fixtures/constants.js";
import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Collections routes
//
// Uses the shared integration database. Only auth is mocked.
// ---------------------------------------------------------------------------

const ctx = createTestContext("a0000000-0002-4000-a000-000000000001");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Collections routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  // Track IDs created during tests
  let collectionId: string;
  let secondCollectionId: string;
  let inboxId: string;

  // ── POST /collections ─────────────────────────────────────────────────────

  describe("POST /collections", () => {
    it("creates a collection and returns full DTO shape", async () => {
      const res = await app.fetch(req("POST", "/collections", { name: "Test Collection" }));
      expect(res.status).toBe(201);

      const json = (await res.json()) as CollectionResponse;
      expect(json.id).toBeTypeOf("string");
      expect(json.name).toBe("Test Collection");
      expect(json.description).toBeNull();
      expect(json.isInbox).toBe(false);
      expect(json.availableForDeckbuilding).toBe(true);
      expect(json.sortOrder).toBe(0);
      expect(json.createdAt).toBeTypeOf("string");
      expect(json.updatedAt).toBeTypeOf("string");
      collectionId = json.id;
    });

    it("creates a collection with name and description", async () => {
      const res = await app.fetch(
        req("POST", "/collections", { name: "Described", description: "A fine collection" }),
      );
      expect(res.status).toBe(201);

      const json = (await res.json()) as CollectionResponse;
      expect(json.name).toBe("Described");
      expect(json.description).toBe("A fine collection");
      secondCollectionId = json.id;
    });

    it("creates a collection with availableForDeckbuilding=false", async () => {
      const res = await app.fetch(
        req("POST", "/collections", { name: "Non-deck", availableForDeckbuilding: false }),
      );
      expect(res.status).toBe(201);

      const json = (await res.json()) as CollectionResponse;
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

  // ── GET /collections ──────────────────────────────────────────────────────

  describe("GET /collections", () => {
    it("auto-creates an inbox on first list", async () => {
      const res = await app.fetch(req("GET", "/collections"));
      expect(res.status).toBe(200);

      const json = (await res.json()) as { items: CollectionResponse[] };
      const inbox = json.items.find((c) => c.isInbox);
      expect(inbox).toBeDefined();
      // The expect above guarantees inbox is defined
      inboxId = (inbox as NonNullable<typeof inbox>).id;
    });

    it("returns all collections for the user", async () => {
      const res = await app.fetch(req("GET", "/collections"));
      expect(res.status).toBe(200);

      const json = (await res.json()) as { items: CollectionResponse[] };
      expect(Array.isArray(json.items)).toBe(true);
      // 3 created + 1 auto-inbox = 4
      expect(json.items.length).toBeGreaterThanOrEqual(4);
    });

    it("returns inbox first, then remaining collections sorted", async () => {
      const res = await app.fetch(req("GET", "/collections"));
      const json = (await res.json()) as { items: CollectionResponse[] };
      // Inbox should always come first
      expect(json.items[0].isInbox).toBe(true);
      // The rest should be sorted by sortOrder then name
      const rest = json.items.slice(1).map((c) => c.name);
      const sorted = rest.toSorted((a, b) => a.localeCompare(b));
      expect(rest).toEqual(sorted);
    });
  });

  // ── GET /collections/:id ──────────────────────────────────────────────────

  describe("GET /collections/:id", () => {
    it("returns a single collection by ID", async () => {
      const res = await app.fetch(req("GET", `/collections/${collectionId}`));
      expect(res.status).toBe(200);

      const json = (await res.json()) as CollectionResponse;
      expect(json.id).toBe(collectionId);
      expect(json.name).toBe("Test Collection");
    });

    it("returns 404 for non-existent collection", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/collections/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /collections/:id ────────────────────────────────────────────────

  describe("PATCH /collections/:id", () => {
    it("updates the collection name", async () => {
      const res = await app.fetch(
        req("PATCH", `/collections/${collectionId}`, { name: "Renamed Collection" }),
      );
      expect(res.status).toBe(200);

      const json = (await res.json()) as CollectionResponse;
      expect(json.name).toBe("Renamed Collection");
    });

    it("updates the collection description", async () => {
      const res = await app.fetch(
        req("PATCH", `/collections/${collectionId}`, { description: "Updated desc" }),
      );
      expect(res.status).toBe(200);

      const json = (await res.json()) as CollectionResponse;
      expect(json.description).toBe("Updated desc");
    });

    it("updates availableForDeckbuilding", async () => {
      const res = await app.fetch(
        req("PATCH", `/collections/${collectionId}`, { availableForDeckbuilding: false }),
      );
      expect(res.status).toBe(200);

      const json = (await res.json()) as CollectionResponse;
      expect(json.availableForDeckbuilding).toBe(false);
    });

    it("updates sortOrder", async () => {
      const res = await app.fetch(req("PATCH", `/collections/${collectionId}`, { sortOrder: 5 }));
      expect(res.status).toBe(200);

      const json = (await res.json()) as CollectionResponse;
      expect(json.sortOrder).toBe(5);
    });

    it("returns 404 for non-existent collection", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("PATCH", `/collections/${fakeId}`, { name: "Nope" }));
      expect(res.status).toBe(404);
    });
  });

  // ── GET /collections/:id/copies ───────────────────────────────────────────

  describe("GET /collections/:id/copies", () => {
    it("returns empty array for a collection with no copies", async () => {
      const res = await app.fetch(req("GET", `/collections/${collectionId}/copies`));
      expect(res.status).toBe(200);

      const json = (await res.json()) as { items: unknown[] };
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items).toHaveLength(0);
    });

    it("returns 404 for non-existent collection", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/collections/${fakeId}/copies`));
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /collections/:id ───────────────────────────────────────────────

  describe("DELETE /collections/:id", () => {
    it("rejects deleting the inbox collection", async () => {
      const res = await app.fetch(req("DELETE", `/collections/${inboxId}`));
      expect(res.status).toBe(400);
    });

    it("deletes a collection and auto-moves its copies to inbox", async () => {
      // Populate `secondCollectionId` with two copies so the auto-move path
      // is actually exercised (without copies the test passes trivially).
      const addRes = await app.fetch(
        req("POST", "/copies", {
          copies: [
            { printingId: PRINTING_1.id, collectionId: secondCollectionId },
            { printingId: PRINTING_2.id, collectionId: secondCollectionId },
          ],
        }),
      );
      expect(addRes.status).toBe(201);
      const added = (await addRes.json()) as { id: string }[];
      const addedIds = new Set(added.map((c) => c.id));

      const res = await app.fetch(req("DELETE", `/collections/${secondCollectionId}`));
      expect(res.status).toBe(204);

      // Both copies should now live in the inbox.
      const inboxCopiesRes = await app.fetch(req("GET", `/collections/${inboxId}/copies`));
      const inboxCopies = (await inboxCopiesRes.json()) as { items: { id: string }[] };
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
      // Reproduces the bug where deleting a collection fails with 500 because
      // the FK ON DELETE SET NULL on collection_events.from_collection_id
      // violates chk_collection_events_collection_presence (which requires
      // 'removed' events to keep from_collection_id NOT NULL).
      const createRes = await app.fetch(req("POST", "/collections", { name: "Has History" }));
      expect(createRes.status).toBe(201);
      const { id: historyCollectionId } = (await createRes.json()) as { id: string };

      // Add a copy, then dispose it — this writes a 'removed' event with
      // from_collection_id = historyCollectionId.
      const addRes = await app.fetch(
        req("POST", "/copies", {
          copies: [{ printingId: PRINTING_1.id, collectionId: historyCollectionId }],
        }),
      );
      expect(addRes.status).toBe(201);
      const [copy] = (await addRes.json()) as { id: string }[];

      const disposeRes = await app.fetch(req("POST", "/copies/dispose", { copyIds: [copy.id] }));
      expect(disposeRes.status).toBe(204);

      // Collection is now empty but has a 'removed' event referencing it.
      const res = await app.fetch(req("DELETE", `/collections/${historyCollectionId}`));
      expect(res.status).toBe(204);
    });

    it("deletes a collection that has prior 'moved' events in its history", async () => {
      // Same root cause as above but for the 'moved' branch of the check
      // constraint, which requires both from_collection_id and to_collection_id
      // to remain NOT NULL.
      const createSrcRes = await app.fetch(req("POST", "/collections", { name: "Move Source" }));
      const { id: srcId } = (await createSrcRes.json()) as { id: string };
      const createDstRes = await app.fetch(
        req("POST", "/collections", { name: "Move Destination" }),
      );
      const { id: dstId } = (await createDstRes.json()) as { id: string };

      const addRes = await app.fetch(
        req("POST", "/copies", {
          copies: [{ printingId: PRINTING_2.id, collectionId: srcId }],
        }),
      );
      const [copy] = (await addRes.json()) as { id: string }[];

      const moveRes = await app.fetch(
        req("POST", "/copies/move", { copyIds: [copy.id], toCollectionId: dstId }),
      );
      expect(moveRes.status).toBe(204);

      // Deleting either endpoint of the historical 'moved' event should work.
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
});
