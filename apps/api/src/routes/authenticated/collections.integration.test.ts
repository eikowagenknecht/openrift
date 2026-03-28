import type { CollectionResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

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

      const json = (await res.json()) as CollectionResponse[];
      const inbox = json.find((c) => c.isInbox);
      expect(inbox).toBeDefined();
      // The expect above guarantees inbox is defined
      inboxId = (inbox as NonNullable<typeof inbox>).id;
    });

    it("returns all collections for the user", async () => {
      const res = await app.fetch(req("GET", "/collections"));
      expect(res.status).toBe(200);

      const json = (await res.json()) as CollectionResponse[];
      expect(Array.isArray(json)).toBe(true);
      // 3 created + 1 auto-inbox = 4
      expect(json.length).toBeGreaterThanOrEqual(4);
    });

    it("returns inbox first, then remaining collections sorted", async () => {
      const res = await app.fetch(req("GET", "/collections"));
      const json = (await res.json()) as CollectionResponse[];
      // Inbox should always come first
      expect(json[0].isInbox).toBe(true);
      // The rest should be sorted by sortOrder then name
      const rest = json.slice(1).map((c) => c.name);
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

      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json).toHaveLength(0);
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
      const res = await app.fetch(
        req("DELETE", `/collections/${inboxId}?move_copies_to=${collectionId}`),
      );
      expect(res.status).toBe(400);
    });

    it("rejects deleting without move_copies_to param", async () => {
      const res = await app.fetch(req("DELETE", `/collections/${secondCollectionId}`));
      expect(res.status).toBe(400);
    });

    it("rejects moving copies to the same collection being deleted", async () => {
      const res = await app.fetch(
        req("DELETE", `/collections/${secondCollectionId}?move_copies_to=${secondCollectionId}`),
      );
      expect(res.status).toBe(400);
    });

    it("rejects moving copies to a non-existent target", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("DELETE", `/collections/${secondCollectionId}?move_copies_to=${fakeId}`),
      );
      expect(res.status).toBe(404);
    });

    it("deletes a collection and moves copies to inbox", async () => {
      const res = await app.fetch(
        req("DELETE", `/collections/${secondCollectionId}?move_copies_to=${inboxId}`),
      );
      expect(res.status).toBe(204);
    });

    it("returns 404 after deletion", async () => {
      const res = await app.fetch(req("GET", `/collections/${secondCollectionId}`));
      expect(res.status).toBe(404);
    });

    it("returns 404 when deleting non-existent collection", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("DELETE", `/collections/${fakeId}?move_copies_to=${inboxId}`),
      );
      expect(res.status).toBe(404);
    });
  });
});
