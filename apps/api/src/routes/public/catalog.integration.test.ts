import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestContext, req } from "../../test/integration-context.js";

const USER_ID = "a0000000-0024-4000-a000-000000000001";
const ctx = createTestContext(USER_ID);

const SEED_SET_ID = "019cf052-e002-78ef-b032-cc585ba33eb3";
const SEED_PRINTING_ID = "019cf052-e020-7222-b8bf-3c9fc2151abc";
const SEED_TCG_SOURCE_ID = "019cf052-a62c-7993-b36e-917d2cbf013a";

describe.skipIf(!ctx)("Catalog route (integration)", () => {
  const { app, db } = ctx!;

  beforeAll(async () => {
    await db
      .insertInto("printingImages")
      .values({
        printingId: SEED_PRINTING_ID,
        face: "front",
        provider: "cat-test",
        originalUrl: "https://example.com/cat-test-front.png",
        rehostedUrl: null,
        isActive: true,
      })
      .onConflict((oc) => oc.columns(["printingId", "face", "provider"]).doNothing())
      .execute();

    await db
      .insertInto("marketplaceSnapshots")
      .values({
        productId: SEED_TCG_SOURCE_ID,
        recordedAt: new Date("2026-03-15T10:00:00Z"),
        marketCents: 350,
        lowCents: 200,
        midCents: 280,
        highCents: 500,
        trendCents: null,
        avg1Cents: null,
        avg7Cents: null,
        avg30Cents: null,
      })
      .onConflict((oc) => oc.columns(["productId", "recordedAt"]).doNothing())
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom("printingImages").where("provider", "=", "cat-test").execute();
    await db
      .deleteFrom("marketplaceSnapshots")
      .where("productId", "=", SEED_TCG_SOURCE_ID)
      .where("recordedAt", "=", new Date("2026-03-15T10:00:00Z"))
      .execute();
  });

  describe("GET /catalog", () => {
    it("returns 200 with sets, cards, and printings", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(Array.isArray(json.sets)).toBe(true);
      expect(typeof json.cards).toBe("object");
      expect(Array.isArray(json.printings)).toBe(true);
    });

    it("sets contain id, slug, and name", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      const ogsSet = json.sets.find((s: { id: string }) => s.id === SEED_SET_ID);
      expect(ogsSet).toBeDefined();
      expect(ogsSet.slug).toBe("OGS");
      expect(ogsSet.name).toBe("Proving Grounds");
    });

    it("cards contain expected fields", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      const annieCardId = "019cf052-e00a-7256-ab8d-6e39b367029d";
      const annie = json.cards[annieCardId];
      expect(annie).toBeDefined();
      expect(annie.name).toBe("Annie, Fiery");
      expect(annie.type).toBe("Unit");
      expect(annie.superTypes).toContain("Champion");
      expect(annie.domains).toContain("Fury");
    });

    it("printings contain expected fields", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      const printing = json.printings.find((p: { id: string }) => p.id === SEED_PRINTING_ID);
      expect(printing).toBeDefined();
      expect(printing.cardId).toBe("019cf052-e00a-7256-ab8d-6e39b367029d");
      expect(printing.setId).toBe(SEED_SET_ID);
      expect(printing.shortCode).toBe("OGS-001");
      expect(printing.rarity).toBe("Epic");
      expect(printing.promoType).toBeNull();
    });

    it("printing includes marketPrice when a snapshot exists", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      const printing = json.printings.find((p: { id: string }) => p.id === SEED_PRINTING_ID);
      expect(printing.marketPrice).toBe(3.5);
    });

    it("printings include images array", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      const printing = json.printings.find((p: { id: string }) => p.id === SEED_PRINTING_ID);
      expect(Array.isArray(printing.images)).toBe(true);
      expect(printing.images.length).toBeGreaterThanOrEqual(1);
    });

    it("returns Cache-Control header", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      expect(res.headers.get("Cache-Control")).toBe(
        "public, max-age=60, stale-while-revalidate=300",
      );
    });
  });
});
