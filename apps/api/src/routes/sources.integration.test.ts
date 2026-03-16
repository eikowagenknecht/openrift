import { describe, expect, it } from "bun:test";

import type { SourceResponse } from "@openrift/shared";

import { createTestContext, req } from "../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Sources routes (pure CRUD)
//
// Uses the shared integration database. Only auth is mocked.
// ---------------------------------------------------------------------------

const ctx = createTestContext("a0000000-0009-4000-a000-000000000001");

describe.skipIf(!ctx)("Sources routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  let sourceId: string;

  // ── POST /sources ─────────────────────────────────────────────────────────

  describe("POST /sources", () => {
    it("creates a source with full DTO shape", async () => {
      const res = await app.fetch(req("POST", "/sources", { name: "LGS Pickup" }));
      expect(res.status).toBe(201);

      const json = (await res.json()) as SourceResponse;
      expect(json.id).toBeString();
      expect(json.name).toBe("LGS Pickup");
      expect(json.description).toBeNull();
      expect(json.createdAt).toBeString();
      expect(json.updatedAt).toBeString();
      sourceId = json.id;
    });

    it("creates a source with description", async () => {
      const res = await app.fetch(
        req("POST", "/sources", { name: "Online Store", description: "TCGPlayer order" }),
      );
      expect(res.status).toBe(201);

      const json = (await res.json()) as SourceResponse;
      expect(json.description).toBe("TCGPlayer order");
    });

    it("rejects without name", async () => {
      const res = await app.fetch(req("POST", "/sources", {}));
      expect(res.status).toBe(400);
    });

    it("rejects empty name", async () => {
      const res = await app.fetch(req("POST", "/sources", { name: "" }));
      expect(res.status).toBe(400);
    });
  });

  // ── GET /sources ──────────────────────────────────────────────────────────

  describe("GET /sources", () => {
    it("returns all sources sorted by name", async () => {
      const res = await app.fetch(req("GET", "/sources"));
      expect(res.status).toBe(200);

      const json = (await res.json()) as SourceResponse[];
      expect(json.length).toBe(2);
      // Should be sorted alphabetically by name
      expect(json[0].name).toBe("LGS Pickup");
      expect(json[1].name).toBe("Online Store");
    });
  });

  // ── GET /sources/:id ──────────────────────────────────────────────────────

  describe("GET /sources/:id", () => {
    it("returns a single source", async () => {
      const res = await app.fetch(req("GET", `/sources/${sourceId}`));
      expect(res.status).toBe(200);

      const json = (await res.json()) as SourceResponse;
      expect(json.id).toBe(sourceId);
    });

    it("returns 404 for non-existent", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/sources/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /sources/:id ────────────────────────────────────────────────────

  describe("PATCH /sources/:id", () => {
    it("updates source name", async () => {
      const res = await app.fetch(req("PATCH", `/sources/${sourceId}`, { name: "Renamed" }));
      expect(res.status).toBe(200);

      const json = (await res.json()) as SourceResponse;
      expect(json.name).toBe("Renamed");
    });

    it("updates source description", async () => {
      const res = await app.fetch(
        req("PATCH", `/sources/${sourceId}`, { description: "New desc" }),
      );
      expect(res.status).toBe(200);

      const json = (await res.json()) as SourceResponse;
      expect(json.description).toBe("New desc");
    });

    it("returns 404 for non-existent", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("PATCH", `/sources/${fakeId}`, { name: "Nope" }));
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /sources/:id ───────────────────────────────────────────────────

  describe("DELETE /sources/:id", () => {
    it("deletes a source", async () => {
      const res = await app.fetch(req("DELETE", `/sources/${sourceId}`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("returns 404 after deletion", async () => {
      const res = await app.fetch(req("GET", `/sources/${sourceId}`));
      expect(res.status).toBe(404);
    });
  });
});
