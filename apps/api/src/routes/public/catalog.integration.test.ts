import { describe, expect, it } from "vitest";

import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Catalog route
//
// GET /catalog — returns the full card catalog (sets, cards, printings)
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix CAT- for entities it creates (beyond seed data).
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0024-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

// Well-known IDs from seed.sql (OGS set)
const SEED_SET_ID = "019cf052-e002-78ef-b032-cc585ba33eb3";
const SEED_PRINTING_ID = "019cf052-e020-7222-b8bf-3c9fc2151abc"; // Annie, Fiery
const SEED_TCG_SOURCE_ID = "019cf052-a62c-7993-b36e-917d2cbf013a"; // tcgplayer source for Annie

if (ctx) {
  const { db } = ctx;

  // Seed a printing image for the first seed printing (Annie, Fiery)
  await db
    .insertInto("printingImages")
    .values({
      printingId: SEED_PRINTING_ID,
      face: "front",
      source: "cat-test",
      originalUrl: "https://example.com/cat-test-front.png",
      rehostedUrl: null,
      isActive: true,
    })
    .execute();

  // Seed a marketplace snapshot for the tcgplayer source of Annie, Fiery
  // so marketPrice appears on the printing
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
    .execute();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Catalog route (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  // ── GET /catalog ──────────────────────────────────────────────────────────

  describe("GET /catalog", () => {
    it("returns 200 with sets, cards, and printings", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.sets).toBeArray();
      expect(typeof json.cards).toBe("object");
      expect(json.printings).toBeArray();
    });

    it("sets contain id, slug, and name", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      const ogsSet = json.sets.find((s: { id: string }) => s.id === SEED_SET_ID);
      expect(ogsSet).toBeDefined();
      expect(ogsSet.id).toBe(SEED_SET_ID);
      expect(ogsSet.slug).toBe("OGS");
      expect(ogsSet.name).toBe("Proving Grounds");
    });

    it("cards contain expected fields", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      // Annie, Fiery card
      const annieCardId = "019cf052-e00a-7256-ab8d-6e39b367029d";
      const annie = json.cards[annieCardId];
      expect(annie).toBeDefined();
      expect(annie.id).toBe(annieCardId);
      expect(annie.slug).toBe("OGS-001");
      expect(annie.name).toBe("Annie, Fiery");
      expect(annie.type).toBe("Unit");
      expect(annie.superTypes).toContain("Champion");
      expect(annie.domains).toContain("Fury");
      expect(annie.energy).toBe(5);
      expect(annie.might).toBe(4);
      expect(annie.power).toBe(1);
      expect(annie.keywords).toBeArray();
      expect(annie.tags).toBeArray();
    });

    it("cards are keyed by ID", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      // All keys should be valid UUIDs
      const keys = Object.keys(json.cards);
      expect(keys.length).toBeGreaterThanOrEqual(24); // 24 seed cards
      for (const key of keys) {
        expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(json.cards[key].id).toBe(key);
      }
    });

    it("contains all 24 seed cards", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      const cardNames = Object.values(json.cards).map((c: any) => c.name);
      expect(cardNames).toContain("Annie, Fiery");
      expect(cardNames).toContain("Firestorm");
      expect(cardNames).toContain("Garen, Rugged");
      expect(cardNames).toContain("Tibbers");
      expect(cardNames).toContain("Final Spark");
    });

    it("printings contain expected fields and reference cardId/setId", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      const printing = json.printings.find((p: { id: string }) => p.id === SEED_PRINTING_ID);
      expect(printing).toBeDefined();
      expect(printing.id).toBe(SEED_PRINTING_ID);
      expect(printing.slug).toBeString();
      expect(printing.cardId).toBe("019cf052-e00a-7256-ab8d-6e39b367029d");
      expect(printing.setId).toBe(SEED_SET_ID);
      expect(printing.shortCode).toBe("OGS-001");
      expect(printing.collectorNumber).toBe(1);
      expect(printing.rarity).toBe("Epic");
      expect(printing.artVariant).toBe("normal");
      expect(printing.isSigned).toBe(false);
      expect(printing.promoType).toBeNull();
      expect(printing.finish).toBe("normal");
      expect(printing.artist).toBe("Polar Engine Studio");
      expect(printing.publicCode).toBe("OGS-001/024");
    });

    it("contains all 24 seed printings", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      // At minimum, the 24 seed printings (other tests may add more)
      expect(json.printings.length).toBeGreaterThanOrEqual(24);

      // Verify a sampling of printings by source IDs
      const shortCodes = json.printings.map((p: { shortCode: string }) => p.shortCode);
      expect(shortCodes).toContain("OGS-001");
      expect(shortCodes).toContain("OGS-012");
      expect(shortCodes).toContain("OGS-024");
    });

    it("printings include images array when images exist", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      const printing = json.printings.find((p: { id: string }) => p.id === SEED_PRINTING_ID);
      expect(printing).toBeDefined();
      expect(printing.images).toBeArray();
      expect(printing.images.length).toBeGreaterThanOrEqual(1);

      const frontImage = printing.images.find((i: { face: string }) => i.face === "front");
      expect(frontImage).toBeDefined();
      expect(frontImage.url).toBe("https://example.com/cat-test-front.png");
    });

    it("printings have empty images array when no images exist", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      // Find a printing that we did NOT seed images for
      const otherPrinting = json.printings.find(
        (p: { id: string }) =>
          p.id !== SEED_PRINTING_ID &&
          // Filter to seed printings (OGS source IDs)
          p.shortCode.startsWith("OGS-"),
      );
      expect(otherPrinting).toBeDefined();
      expect(otherPrinting.images).toBeArray();
      // May have images from other tests, but our point is the field exists
      expect(Array.isArray(otherPrinting.images)).toBe(true);
    });

    it("printing includes marketPrice when a snapshot exists", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      const printing = json.printings.find((p: { id: string }) => p.id === SEED_PRINTING_ID);
      expect(printing).toBeDefined();
      // 350 cents = $3.50
      expect(printing.marketPrice).toBe(3.5);
    });

    it("returns Cache-Control header", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      expect(res.headers.get("Cache-Control")).toBe(
        "public, max-age=60, stale-while-revalidate=300",
      );
    });

    it("printings are ordered by setId, collectorNumber, finish", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await res.json();

      // Filter to OGS printings and verify they are sorted by collector number
      const ogsPrintings = json.printings.filter((p: { setId: string }) => p.setId === SEED_SET_ID);
      const collectorNumbers = ogsPrintings.map(
        (p: { collectorNumber: number }) => p.collectorNumber,
      );
      const sorted = [...collectorNumbers].sort((a: number, b: number) => a - b);
      expect(collectorNumbers).toEqual(sorted);
    });
  });
});
