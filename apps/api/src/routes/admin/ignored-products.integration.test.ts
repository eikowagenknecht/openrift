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

  // Seed product + price row (needed for POST /admin/ignored-products to find product names)
  await db
    .insertInto("marketplaceProducts")
    .values({
      marketplace: "tcgplayer",
      externalId: 10_401,
      groupId: 10_400,
      productName: "IGP Stageable Product",
      finish: "normal",
      language: "EN",
    })
    .onConflict((oc) => oc.columns(["marketplace", "externalId", "finish", "language"]).doNothing())
    .execute();

  const igpProductRow = await db
    .selectFrom("marketplaceProducts")
    .select("id")
    .where("marketplace", "=", "tcgplayer")
    .where("externalId", "=", 10_401)
    .where("finish", "=", "normal")
    .where("language", "=", "EN")
    .executeTakeFirstOrThrow();

  await db
    .insertInto("marketplaceProductPrices")
    .values({
      marketplaceProductId: igpProductRow.id,
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
    .onConflict((oc) => oc.columns(["marketplaceProductId", "recordedAt"]).doNothing())
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
    it("ignores a product that exists in staging (L2)", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-products", {
          level: "product",
          marketplace: "tcgplayer",
          products: [{ externalId: 10_401 }],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ignored).toBe(1);
    });

    it("returns 0 ignored count for non-existent staging ID", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-products", {
          level: "product",
          marketplace: "tcgplayer",
          products: [{ externalId: 99_999 }],
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
          level: "product",
          marketplace: "invalid",
          products: [{ externalId: 10_401 }],
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
      expect(igpProduct.level).toBe("product");
      expect(igpProduct.marketplace).toBe("tcgplayer");
      expect(igpProduct.externalId).toBe(10_401);
      expect(igpProduct.productName).toBe("IGP Stageable Product");
      expect(igpProduct.createdAt).toBeTypeOf("string");
    });
  });

  // ── DELETE /admin/ignored-products ──────────────────────────────────────

  describe("DELETE /admin/ignored-products", () => {
    it("un-ignores a product", async () => {
      const res = await app.fetch(
        req("DELETE", "/admin/ignored-products", {
          level: "product",
          marketplace: "tcgplayer",
          products: [{ externalId: 10_401 }],
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
          language: "EN",
          cardId,
        }),
      );
      expect(res.status).toBe(204);

      // Verify the override exists in the database (joined to the product row).
      const row = await db
        .selectFrom("marketplaceProductCardOverrides as ov")
        .innerJoin("marketplaceProducts as mp", "mp.id", "ov.marketplaceProductId")
        .select(["mp.marketplace", "mp.externalId", "mp.finish", "ov.cardId"])
        .where("mp.marketplace", "=", "tcgplayer")
        .where("mp.externalId", "=", 10_401)
        .where("mp.finish", "=", "normal")
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
          language: "EN",
        }),
      );
      expect(res.status).toBe(204);

      // Verify the override is gone (joined to the product row).
      const row = await db
        .selectFrom("marketplaceProductCardOverrides as ov")
        .innerJoin("marketplaceProducts as mp", "mp.id", "ov.marketplaceProductId")
        .select("mp.externalId")
        .where("mp.marketplace", "=", "tcgplayer")
        .where("mp.externalId", "=", 10_401)
        .where("mp.finish", "=", "normal")
        .executeTakeFirst();
      expect(row).toBeUndefined();
    });
  });
});
