import { describe, expect, it, mock } from "bun:test";

// Mock the image rehost service BEFORE the app is created
mock.module("../../services/image-rehost.js", () => ({
  rehostImages: async () => ({
    total: 0,
    rehosted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }),
  regenerateImages: async () => ({
    total: 0,
    regenerated: 0,
    failed: 0,
    errors: [],
    hasMore: false,
    totalFiles: 0,
  }),
  clearAllRehosted: async () => ({ cleared: 0 }),
  getRehostStatus: async () => ({
    total: 5,
    rehosted: 2,
    external: 3,
    sets: [
      {
        setId: "IMG",
        setName: "IMG Test Set",
        total: 5,
        rehosted: 2,
        external: 3,
      },
    ],
    disk: { totalBytes: 1024, sets: [] },
  }),
  CARD_IMAGES_DIR: "/tmp/test-card-images",
  downloadImage: async () => ({ buffer: Buffer.from("fake"), ext: ".png" }),
  printingIdToFileBase: (id: string) => id.replaceAll(":", "-"),
  // oxlint-disable-next-line no-empty-function -- noop mock
  processAndSave: async () => {},
  // oxlint-disable-next-line no-empty-function -- noop mock
  deleteRehostFiles: async () => {},
  // oxlint-disable-next-line no-empty-function -- noop mock
  renameRehostFiles: async () => {},
}));

// oxlint-disable-next-line import/first -- mock.module must run before this import
import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Admin image management routes
//
// Uses the shared integration database. Auth and image-rehost service are mocked.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0020-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

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
      superTypes: [],
      domains: ["Mind"],
      might: null,
      energy: 2,
      power: null,
      mightBonus: null,
      keywords: [],
      rulesText: null,
      effectText: null,
      tags: [],
    })
    .returning("id")
    .execute();

  const [printing] = await db
    .insertInto("printings")
    .values({
      slug: "IMG-001:common:normal:",
      cardId: card.id,
      setId: set.id,
      sourceId: "IMG-001",
      collectorNumber: 1,
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      isPromo: false,
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
    .insertInto("cardSources")
    .values({
      source: "img-source",
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
      sourceId: "IMG-001",
      sourceEntityId: null,
      extraData: null,
    })
    .returning("id")
    .execute();

  await db
    .insertInto("printingSources")
    .values({
      cardSourceId: cs.id,
      printingId: printingId,
      sourceId: "IMG-001",
      setId: "IMG",
      setName: "IMG Test Set",
      collectorNumber: 1,
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      isPromo: false,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "IMG",
      printedRulesText: null,
      printedEffectText: null,
      imageUrl: "https://example.com/img-test.png",
      flavorText: null,
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
    it("returns mocked result with default limit", async () => {
      const res = await app.fetch(req("POST", "/admin/rehost-images"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.result).toEqual({
        total: 0,
        rehosted: 0,
        skipped: 0,
        failed: 0,
        errors: [],
      });
    });

    it("accepts a custom limit query param", async () => {
      const res = await app.fetch(req("POST", "/admin/rehost-images?limit=5"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.result.total).toBe(0);
    });
  });

  // ── POST /admin/regenerate-images ──────────────────────────────────────

  describe("POST /admin/regenerate-images", () => {
    it("returns mocked result with default offset", async () => {
      const res = await app.fetch(req("POST", "/admin/regenerate-images"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.result).toEqual({
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
      expect(json.status).toBe("ok");
      expect(json.result.total).toBe(0);
    });
  });

  // ── POST /admin/clear-rehosted ─────────────────────────────────────────

  describe("POST /admin/clear-rehosted", () => {
    it("returns mocked result", async () => {
      const res = await app.fetch(req("POST", "/admin/clear-rehosted"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.result).toEqual({ cleared: 0 });
    });
  });

  // ── GET /admin/rehost-status ───────────────────────────────────────────

  describe("GET /admin/rehost-status", () => {
    it("returns status shape from mock", async () => {
      const res = await app.fetch(req("GET", "/admin/rehost-status"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.total).toBe(5);
      expect(json.rehosted).toBe(2);
      expect(json.external).toBe(3);
      expect(json.sets).toBeArray();
      expect(json.sets).toHaveLength(1);
      expect(json.sets[0].setId).toBe("IMG");
      expect(json.disk).toBeDefined();
      expect(json.disk.totalBytes).toBe(1024);
    });
  });

  // ── POST /admin/restore-image-urls ─────────────────────────────────────

  describe("POST /admin/restore-image-urls", () => {
    it("restores image URLs from printing sources and returns count", async () => {
      const res = await app.fetch(
        req("POST", "/admin/restore-image-urls", { source: "img-source" }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.result.source).toBe("img-source");
      expect(json.result.updated).toBeNumber();

      // Verify a printing_images row was created
      const images = await db
        .selectFrom("printingImages")
        .select(["printingId", "face", "source", "originalUrl", "isActive"])
        .where("printingId", "=", printingId)
        .where("source", "=", "img-source")
        .execute();
      expect(images).toHaveLength(1);
      expect(images[0].face).toBe("front");
      expect(images[0].originalUrl).toBe("https://example.com/img-test.png");
      expect(images[0].isActive).toBe(true);
    });

    it("returns 400 with empty source", async () => {
      const res = await app.fetch(req("POST", "/admin/restore-image-urls", { source: "" }));
      expect(res.status).toBe(400);
    });
  });
});
