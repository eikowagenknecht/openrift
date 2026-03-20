import { describe, expect, it } from "vitest";

import { CARD_FURY_UNIT } from "../../test/fixtures/constants.js";
import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Ignored products & staging card overrides
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix IGP- for entities it creates, group_id range 10_400-10499.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0015-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

// Use a seed card for FK references
const cardId = CARD_FURY_UNIT.id;

if (ctx) {
  const { db } = ctx;

  // Seed a marketplace group for the staging row
  await db
    .insertInto("marketplaceGroups")
    .values({
      marketplace: "tcgplayer",
      groupId: 10_400,
      name: "IGP Test Group",
      abbreviation: null,
    })
    .execute();

  // Seed staging row (needed for POST /admin/ignored-products to find product names)
  await db
    .insertInto("marketplaceStaging")
    .values({
      marketplace: "tcgplayer",
      externalId: 10_401,
      groupId: 10_400,
      productName: "IGP Stageable Product",
      finish: "normal",
      recordedAt: new Date(),
      marketCents: 100,
      lowCents: 50,
      midCents: null,
      highCents: null,
      trendCents: null,
      avg1Cents: null,
      avg7Cents: null,
      avg30Cents: null,
    })
    .execute();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Ignored products routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  // ── GET /admin/ignored-products (empty) ─────────────────────────────────
  // Note: other test files may have their own ignored products, but we only
  // care about our IGP- scoped external IDs.

  // ── POST /admin/ignored-products ────────────────────────────────────────

  describe("POST /admin/ignored-products", () => {
    it("ignores a product that exists in staging", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-products", {
          marketplace: "tcgplayer",
          products: [{ externalId: 10_401, finish: "normal" }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ignored).toBe(1);
    });

    it("returns 0 ignored count for non-existent staging ID", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-products", {
          marketplace: "tcgplayer",
          products: [{ externalId: 99_999, finish: "normal" }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ignored).toBe(0);

      // Verify it was not actually inserted
      const rows = await db
        .selectFrom("marketplaceIgnoredProducts")
        .select("externalId")
        .where("externalId", "=", 99_999)
        .execute();
      expect(rows).toHaveLength(0);
    });

    it("returns 400 for invalid source", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-products", {
          marketplace: "invalid",
          products: [{ externalId: 10_401, finish: "normal" }],
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── GET /admin/ignored-products (after ignoring) ────────────────────────

  describe("GET /admin/ignored-products (after ignoring)", () => {
    it("returns the ignored product", async () => {
      const res = await app.fetch(req("GET", "/admin/ignored-products"));
      expect(res.status).toBe(200);

      const json = await res.json();
      const igpProduct = json.products.find((p: { externalId: number }) => p.externalId === 10_401);
      expect(igpProduct).toBeDefined();
      expect(igpProduct.marketplace).toBe("tcgplayer");
      expect(igpProduct.externalId).toBe(10_401);
      expect(igpProduct.finish).toBe("normal");
      expect(igpProduct.productName).toBe("IGP Stageable Product");
      expect(igpProduct.createdAt).toBeString();
    });
  });

  // ── DELETE /admin/ignored-products ──────────────────────────────────────

  describe("DELETE /admin/ignored-products", () => {
    it("un-ignores a product", async () => {
      const res = await app.fetch(
        req("DELETE", "/admin/ignored-products", {
          marketplace: "tcgplayer",
          products: [{ externalId: 10_401, finish: "normal" }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.unignored).toBe(1);
    });

    it("returns empty list for our external_id after un-ignoring", async () => {
      const res = await app.fetch(req("GET", "/admin/ignored-products"));
      expect(res.status).toBe(200);

      const json = await res.json();
      const igpProduct = json.products.find((p: { externalId: number }) => p.externalId === 10_401);
      expect(igpProduct).toBeUndefined();
    });
  });

  // ── POST /admin/staging-card-overrides ──────────────────────────────────

  describe("POST /admin/staging-card-overrides", () => {
    it("creates an override", async () => {
      const res = await app.fetch(
        req("POST", "/admin/staging-card-overrides", {
          marketplace: "tcgplayer",
          externalId: 10_401,
          finish: "normal",
          cardId,
        }),
      );
      expect(res.status).toBe(204);

      // Verify the override exists in the database
      const row = await db
        .selectFrom("marketplaceStagingCardOverrides")
        .select(["marketplace", "externalId", "finish", "cardId"])
        .where("marketplace", "=", "tcgplayer")
        .where("externalId", "=", 10_401)
        .where("finish", "=", "normal")
        .executeTakeFirst();
      expect(row).toBeDefined();
      expect(row?.cardId).toBe(cardId);
    });
  });

  // ── DELETE /admin/staging-card-overrides ─────────────────────────────────

  describe("DELETE /admin/staging-card-overrides", () => {
    it("removes an override", async () => {
      const res = await app.fetch(
        req("DELETE", "/admin/staging-card-overrides", {
          marketplace: "tcgplayer",
          externalId: 10_401,
          finish: "normal",
        }),
      );
      expect(res.status).toBe(204);

      // Verify the override is gone
      const row = await db
        .selectFrom("marketplaceStagingCardOverrides")
        .select("externalId")
        .where("marketplace", "=", "tcgplayer")
        .where("externalId", "=", 10_401)
        .where("finish", "=", "normal")
        .executeTakeFirst();
      expect(row).toBeUndefined();
    });
  });
});
