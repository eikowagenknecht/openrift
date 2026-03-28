import type { AcquisitionSourceResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { createTestContext, req } from "../../test/integration-context.js";

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
      const res = await app.fetch(req("POST", "/acquisition-sources", { name: "LGS Pickup" }));
      expect(res.status).toBe(201);

      const json = (await res.json()) as AcquisitionSourceResponse;
      expect(json.id).toBeTypeOf("string");
      expect(json.name).toBe("LGS Pickup");
      expect(json.description).toBeNull();
      expect(json.createdAt).toBeTypeOf("string");
      expect(json.updatedAt).toBeTypeOf("string");
      sourceId = json.id;
    });

    it("creates a source with description", async () => {
      const res = await app.fetch(
        req("POST", "/acquisition-sources", {
          name: "Online Store",
          description: "TCGPlayer order",
        }),
      );
      expect(res.status).toBe(201);

      const json = (await res.json()) as AcquisitionSourceResponse;
      expect(json.description).toBe("TCGPlayer order");
    });

    it("rejects without name", async () => {
      const res = await app.fetch(req("POST", "/acquisition-sources", {}));
      expect(res.status).toBe(400);
    });

    it("rejects empty name", async () => {
      const res = await app.fetch(req("POST", "/acquisition-sources", { name: "" }));
      expect(res.status).toBe(400);
    });
  });

  // ── GET /sources ──────────────────────────────────────────────────────────

  describe("GET /sources", () => {
    it("returns all sources sorted by name", async () => {
      const res = await app.fetch(req("GET", "/acquisition-sources"));
      expect(res.status).toBe(200);

      const json = (await res.json()) as { items: AcquisitionSourceResponse[] };
      expect(json.items.length).toBe(2);
      // Should be sorted alphabetically by name
      expect(json.items[0].name).toBe("LGS Pickup");
      expect(json.items[1].name).toBe("Online Store");
    });
  });

  // ── GET /sources/:id ──────────────────────────────────────────────────────

  describe("GET /sources/:id", () => {
    it("returns a single source", async () => {
      const res = await app.fetch(req("GET", `/acquisition-sources/${sourceId}`));
      expect(res.status).toBe(200);

      const json = (await res.json()) as AcquisitionSourceResponse;
      expect(json.id).toBe(sourceId);
    });

    it("returns 404 for non-existent", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/acquisition-sources/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /sources/:id ────────────────────────────────────────────────────

  describe("PATCH /sources/:id", () => {
    it("updates source name", async () => {
      const res = await app.fetch(
        req("PATCH", `/acquisition-sources/${sourceId}`, { name: "Renamed" }),
      );
      expect(res.status).toBe(200);

      const json = (await res.json()) as AcquisitionSourceResponse;
      expect(json.name).toBe("Renamed");
    });

    it("updates source description", async () => {
      const res = await app.fetch(
        req("PATCH", `/acquisition-sources/${sourceId}`, { description: "New desc" }),
      );
      expect(res.status).toBe(200);

      const json = (await res.json()) as AcquisitionSourceResponse;
      expect(json.description).toBe("New desc");
    });

    it("returns 404 for non-existent", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("PATCH", `/acquisition-sources/${fakeId}`, { name: "Nope" }));
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /sources/:id ───────────────────────────────────────────────────

  describe("DELETE /sources/:id", () => {
    it("deletes a source", async () => {
      const res = await app.fetch(req("DELETE", `/acquisition-sources/${sourceId}`));
      expect(res.status).toBe(204);
    });

    it("returns 404 after deletion", async () => {
      const res = await app.fetch(req("GET", `/acquisition-sources/${sourceId}`));
      expect(res.status).toBe(404);
    });
  });
});
