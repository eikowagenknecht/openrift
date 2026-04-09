import { describe, expect, it } from "vitest";

import type { Io } from "../../io.js";
import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Admin image management routes
//
// Uses the shared integration database. A mock io object is injected so
// image-rehost functions don't hit the real filesystem or network.
// ---------------------------------------------------------------------------

const FAKE_BUFFER = Buffer.from("img");

const mockSharpPipeline = {
  resize: () => mockSharpPipeline,
  webp: () => mockSharpPipeline,
  toBuffer: async () => FAKE_BUFFER,
};

/* oxlint-disable no-empty-function -- noop mocks for io operations */
const mockIo: Io = {
  fs: {
    mkdir: async () => undefined as any,
    writeFile: async () => undefined as any,
    readFile: async () => FAKE_BUFFER as any,
    readdir: async () => [] as any,
    rename: async () => undefined as any,
    unlink: async () => undefined as any,
    stat: async () => ({ size: 1024 }) as any,
  },
  fetch: async () => new Response(FAKE_BUFFER, { headers: { "content-type": "image/png" } }),
  sharp: (() => mockSharpPipeline) as any,
};
/* oxlint-enable no-empty-function */

const USER_ID = "a0000000-0020-4000-a000-000000000001";

const ctx = createTestContext(USER_ID, { io: mockIo });

let printingId = "";

// Seed test-specific data (IMG- prefix to avoid collisions)
if (ctx) {
  const { db } = ctx;

  // Ensure user is an admin
  await db
    .insertInto("admins")
    .values({ userId: USER_ID })
    .onConflict((oc) => oc.column("userId").doNothing())
    .execute();

  // Seed set + card + printing (needed for restore-image-urls test)
  const [set] = await db
    .insertInto("sets")
    .values({
      slug: "IMG",
      name: "IMG Test Set",
      printedTotal: 1,
      sortOrder: 920,
    })
    .returning("id")
    .execute();

  const [card] = await db
    .insertInto("cards")
    .values({
      slug: "IMG-001",
      name: "IMG Test Card",
      type: "Unit",
      might: null,
      energy: 2,
      power: null,
      mightBonus: null,
      keywords: [],
      tags: [],
    })
    .returning("id")
    .execute();

  await db
    .insertInto("cardDomains")
    .values({ cardId: card.id, domainSlug: "Mind", ordinal: 0 })
    .execute();

  const [printing] = await db
    .insertInto("printings")
    .values({
      cardId: card.id,
      setId: set.id,
      shortCode: "IMG-001",
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "IMG",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
    })
    .returning("id")
    .execute();
  printingId = printing.id;

  // Seed card_sources + printing_sources with image URLs
  const [cs] = await db
    .insertInto("candidateCards")
    .values({
      provider: "img-source",
      name: "IMG Test Card",
      type: "Unit",
      superTypes: [],
      domains: ["Mind"],
      might: null,
      energy: 2,
      power: null,
      mightBonus: null,
      rulesText: null,
      effectText: null,
      tags: [],
      shortCode: "IMG-001",
      externalId: "IMG-001",
      extraData: null,
    })
    .returning("id")
    .execute();

  await db
    .insertInto("candidatePrintings")
    .values({
      candidateCardId: cs.id,
      printingId,
      shortCode: "IMG-001",
      setId: "IMG",
      setName: "IMG Test Set",
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "IMG",
      printedRulesText: null,
      printedEffectText: null,
      imageUrl: "https://example.com/img-test.png",
      flavorText: null,
      externalId: "IMG-001",
    })
    .execute();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Admin image routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  // ── POST /admin/rehost-images ──────────────────────────────────────────

  describe("POST /admin/rehost-images", () => {
    it("returns 200 with rehost result shape", async () => {
      const res = await app.fetch(req("POST", "/admin/rehost-images"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty("total");
      expect(json).toHaveProperty("rehosted");
      expect(json).toHaveProperty("skipped");
      expect(json).toHaveProperty("failed");
      expect(json).toHaveProperty("errors");
    });

    it("accepts a custom limit query param", async () => {
      const res = await app.fetch(req("POST", "/admin/rehost-images?limit=5"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(typeof json.total).toBe("number");
    });
  });

  // ── POST /admin/regenerate-images ──────────────────────────────────────

  describe("POST /admin/regenerate-images", () => {
    it("returns mocked result with default offset", async () => {
      const res = await app.fetch(req("POST", "/admin/regenerate-images"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({
        total: 0,
        regenerated: 0,
        failed: 0,
        errors: [],
        hasMore: false,
        totalFiles: 0,
      });
    });

    it("accepts a custom offset query param", async () => {
      const res = await app.fetch(req("POST", "/admin/regenerate-images?offset=10"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.total).toBe(0);
    });
  });

  // ── POST /admin/clear-rehosted ─────────────────────────────────────────

  describe("POST /admin/clear-rehosted", () => {
    it("returns 200 with cleared count", async () => {
      // Ensure no card_images have rehostedUrl without originalUrl (would violate chk_image_files_has_url)
      await db
        .updateTable("imageFiles")
        .set({ originalUrl: "https://example.com/placeholder.png" })
        .where("rehostedUrl", "is not", null)
        .where("originalUrl", "is", null)
        .execute();

      const res = await app.fetch(req("POST", "/admin/clear-rehosted"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(typeof json.cleared).toBe("number");
    });
  });

  // ── GET /admin/rehost-status ───────────────────────────────────────────

  describe("GET /admin/rehost-status", () => {
    it("returns status shape", async () => {
      const res = await app.fetch(req("GET", "/admin/rehost-status"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.total).toBeTypeOf("number");
      expect(json.rehosted).toBeTypeOf("number");
      expect(json.external).toBeTypeOf("number");
      expect(json.sets).toEqual(expect.any(Array));
      expect(json.disk).toBeDefined();
      expect(json.disk.totalBytes).toBeTypeOf("number");
      expect(json.disk.sets).toEqual(expect.any(Array));
    });
  });

  // ── POST /admin/cleanup-orphaned ──────────────────────────────────────

  describe("POST /admin/cleanup-orphaned", () => {
    it("returns cleanup result shape", async () => {
      const res = await app.fetch(req("POST", "/admin/cleanup-orphaned"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(typeof json.scanned).toBe("number");
      expect(typeof json.deleted).toBe("number");
      expect(json.errors).toEqual(expect.any(Array));
    });
  });

  // ── GET /admin/broken-images ──────────────────────────────────────────

  describe("GET /admin/broken-images", () => {
    it("returns broken images result shape", async () => {
      const res = await app.fetch(req("GET", "/admin/broken-images"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(typeof json.total).toBe("number");
      expect(json.broken).toEqual(expect.any(Array));
    });
  });

  // ── GET /admin/low-res-images ─────────────────────────────────────────

  describe("GET /admin/low-res-images", () => {
    it("returns low-res images result shape", async () => {
      const res = await app.fetch(req("GET", "/admin/low-res-images"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(typeof json.total).toBe("number");
      expect(json.lowRes).toEqual(expect.any(Array));
    });
  });

  // ── GET /admin/missing-images ─────────────────────────────────────────

  describe("GET /admin/missing-images", () => {
    it("returns cards with missing images", async () => {
      const res = await app.fetch(req("GET", "/admin/missing-images"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual(expect.any(Array));
    });
  });

  // ── POST /admin/restore-image-urls ─────────────────────────────────────

  describe("POST /admin/restore-image-urls", () => {
    it("restores image URLs from printing sources and returns count", async () => {
      const res = await app.fetch(
        req("POST", "/admin/restore-image-urls", { provider: "img-source" }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.provider).toBe("img-source");
      expect(json.updated).toBeTypeOf("number");

      // Verify a printing_images row was created with its card_image
      const images = await db
        .selectFrom("printingImages")
        .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
        .select([
          "printingImages.printingId",
          "printingImages.face",
          "printingImages.provider",
          "ci.originalUrl",
          "printingImages.isActive",
        ])
        .where("printingImages.printingId", "=", printingId)
        .where("printingImages.provider", "=", "img-source")
        .execute();
      expect(images).toHaveLength(1);
      expect(images[0].face).toBe("front");
      expect(images[0].originalUrl).toBe("https://example.com/img-test.png");
      expect(images[0].isActive).toBe(true);
    });

    it("returns 400 with empty provider", async () => {
      const res = await app.fetch(req("POST", "/admin/restore-image-urls", { provider: "" }));
      expect(res.status).toBe(400);
    });
  });
});
