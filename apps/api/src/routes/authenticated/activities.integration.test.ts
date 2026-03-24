import { describe, expect, it } from "vitest";

import { CARD_FURY_UNIT, PRINTING_1 } from "../../test/fixtures/constants.js";
import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Activities routes
//
// Uses the shared integration database with pre-seeded OGS card data.
// Only auth is mocked.
// ---------------------------------------------------------------------------

const ctx = createTestContext("a0000000-0004-4000-a000-000000000001");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Activities routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  let activityId: string;

  // ── Setup: create some activities by adding/moving/disposing copies ─────

  it("setup: generates activities via copy operations", async () => {
    // Ensure inbox
    await app.fetch(req("GET", "/collections"));

    // Create a collection
    const colRes = await app.fetch(req("POST", "/collections", { name: "Activity Test" }));
    const col = (await colRes.json()) as { id: string };

    // Add copies → creates acquisition activity
    const addRes = await app.fetch(
      req("POST", "/copies", { copies: [{ printingId: PRINTING_1.id, collectionId: col.id }] }),
    );
    const copies = (await addRes.json()) as { id: string }[];

    // Dispose → creates disposal activity
    await app.fetch(req("POST", "/copies/dispose", { copyIds: [copies[0].id] }));
  });

  // ── GET /activities ────────────────────────────────────────────────────────

  describe("GET /activities", () => {
    it("returns paginated activities", async () => {
      const res = await app.fetch(req("GET", "/activities"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.items).toBeDefined();
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items.length).toBeGreaterThanOrEqual(2);

      // Each activity should have expected fields
      const activity = json.items[0];
      expect(activity.id).toBeString();
      expect(activity.type).toBeString();
      activityId = activity.id;
    });

    it("supports pagination with cursor (ISO date)", async () => {
      // Use a far-past cursor — all activities are after this
      const res = await app.fetch(req("GET", "/activities?cursor=2020-01-01T00:00:00.000Z"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.items).toHaveLength(0);
    });

    it("supports limit parameter", async () => {
      const res = await app.fetch(req("GET", "/activities?limit=1"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.items).toHaveLength(1);
      // Should provide nextCursor when more items exist
      expect(json.nextCursor).toBeString();
    });
  });

  // ── GET /activities/:id ────────────────────────────────────────────────────

  describe("GET /activities/:id", () => {
    it("returns activity + items with card info", async () => {
      const res = await app.fetch(req("GET", `/activities/${activityId}`));
      expect(res.status).toBe(200);

      const json = await res.json();
      // Response shape is { activity, items }
      expect(json.activity.id).toBe(activityId);
      expect(json.activity.type).toBeString();
      expect(json.activity.isAuto).toBe(true);
      expect(json.activity.createdAt).toBeString();

      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items.length).toBeGreaterThanOrEqual(1);
      // Items should have enriched card info
      const item = json.items[0];
      expect(item.printingId).toBeString();
      expect(item.action).toBeString();
      expect(item.cardName).toBe(CARD_FURY_UNIT.name);
    });

    it("returns 404 for non-existent activity", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/activities/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });
});
