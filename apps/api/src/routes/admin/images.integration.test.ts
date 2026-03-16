import { afterAll, describe, expect, it, mock } from "bun:test";

import { createApp } from "../../app.js";
import { createDb } from "../../db/connect.js";
import { migrate } from "../../db/migrate.js";
import { req } from "../../test/integration-helper.js";
import {
  createTempDb,
  dropTempDb,
  noopLogger,
  replaceDbName,
} from "../../test/integration-setup.js";

// ---------------------------------------------------------------------------
// Integration tests: Admin image management routes
//
// Uses a temp database — auth and image-rehost service are mocked.
// Requires DATABASE_URL.
// Excluded from `bun run test` by filename convention (.integration.test.ts).
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

const USER_ID = "a0000000-0000-4000-a000-00000000aa01";

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
        setId: "TEST",
        setName: "Test Set",
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

const mockAuth = {
  handler: () => new Response("ok"),
  api: {
    getSession: async () => ({
      user: { id: USER_ID, email: "a@test.com", name: "User A" },
      session: { id: "sess-a" },
    }),
  },
  $Infer: { Session: { user: null, session: null } },
} as any;

const mockConfig = {
  port: 3000,
  databaseUrl: "",
  corsOrigin: undefined,
  auth: { secret: "test", adminEmail: undefined, google: undefined, discord: undefined },
  smtp: { configured: false },
  cron: { enabled: false, tcgplayerSchedule: "", cardmarketSchedule: "" },
} as any;

let app: ReturnType<typeof createApp>;
let db: ReturnType<typeof createDb>["db"];
let tempDbName = "";
let printingId: string;

if (DATABASE_URL) {
  tempDbName = await createTempDb(DATABASE_URL, "images");
  const testUrl = replaceDbName(DATABASE_URL, tempDbName);
  ({ db } = createDb(testUrl));
  await migrate(db, noopLogger);

  app = createApp({ db, auth: mockAuth, config: mockConfig });

  // Seed test user + admin
  await db
    .insertInto("users")
    .values({
      id: USER_ID,
      email: "a@test.com",
      name: "User A",
      email_verified: true,
      image: null,
    })
    .execute();
  await db.insertInto("admins").values({ user_id: USER_ID }).execute();

  // Seed set + card + printing (needed for restore-image-urls test)
  const [set] = await db
    .insertInto("sets")
    .values({
      slug: "TEST",
      name: "Test Set",
      printed_total: 1,
      sort_order: 1,
    })
    .returning("id")
    .execute();

  const [card] = await db
    .insertInto("cards")
    .values({
      slug: "TEST-001",
      name: "Test Card",
      type: "Unit",
      super_types: [],
      domains: ["Arcane"],
      might: null,
      energy: 2,
      power: null,
      might_bonus: null,
      keywords: [],
      rules_text: null,
      effect_text: null,
      tags: [],
    })
    .returning("id")
    .execute();

  const [printing] = await db
    .insertInto("printings")
    .values({
      slug: "TEST-001:common:normal:",
      card_id: card.id,
      set_id: set.id,
      source_id: "TEST-001",
      collector_number: 1,
      rarity: "Common",
      art_variant: "normal",
      is_signed: false,
      is_promo: false,
      finish: "normal",
      artist: "Test Artist",
      public_code: "TST",
      printed_rules_text: null,
      printed_effect_text: null,
      flavor_text: null,
      comment: null,
    })
    .returning("id")
    .execute();
  printingId = printing.id;

  // Seed card_sources + printing_sources with image URLs
  const [cs] = await db
    .insertInto("card_sources")
    .values({
      source: "test-source",
      name: "Test Card",
      type: "Unit",
      super_types: [],
      domains: ["Arcane"],
      might: null,
      energy: 2,
      power: null,
      might_bonus: null,
      rules_text: null,
      effect_text: null,
      tags: [],
      source_id: "TEST-001",
      source_entity_id: null,
      extra_data: null,
    })
    .returning("id")
    .execute();

  await db
    .insertInto("printing_sources")
    .values({
      card_source_id: cs.id,
      printing_id: printingId,
      source_id: "TEST-001",
      set_id: "TEST",
      set_name: "Test Set",
      collector_number: 1,
      rarity: "Common",
      art_variant: "normal",
      is_signed: false,
      is_promo: false,
      finish: "normal",
      artist: "Test Artist",
      public_code: "TST",
      printed_rules_text: null,
      printed_effect_text: null,
      image_url: "https://example.com/test.png",
      flavor_text: null,
    })
    .execute();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!DATABASE_URL)("Admin image routes (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    await dropTempDb(DATABASE_URL, tempDbName);
  });

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
      expect(json.sets[0].setId).toBe("TEST");
      expect(json.disk).toBeDefined();
      expect(json.disk.totalBytes).toBe(1024);
    });
  });

  // ── POST /admin/restore-image-urls ─────────────────────────────────────

  describe("POST /admin/restore-image-urls", () => {
    it("restores image URLs from printing sources and returns count", async () => {
      const res = await app.fetch(
        req("POST", "/admin/restore-image-urls", { source: "test-source" }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.result.source).toBe("test-source");
      expect(json.result.updated).toBeNumber();

      // Verify a printing_images row was created
      const images = await db
        .selectFrom("printing_images")
        .select(["printing_id", "face", "source", "original_url", "is_active"])
        .where("printing_id", "=", printingId)
        .where("source", "=", "test-source")
        .execute();
      expect(images).toHaveLength(1);
      expect(images[0].face).toBe("front");
      expect(images[0].original_url).toBe("https://example.com/test.png");
      expect(images[0].is_active).toBe(true);
    });

    it("returns 400 with empty source", async () => {
      const res = await app.fetch(req("POST", "/admin/restore-image-urls", { source: "" }));
      expect(res.status).toBe(400);
    });
  });
});
