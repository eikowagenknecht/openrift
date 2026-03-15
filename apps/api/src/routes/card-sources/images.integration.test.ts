import { afterAll, describe, expect, it, mock } from "bun:test";

import {
  createTempDb,
  dropTempDb,
  noopLogger,
  replaceDbName,
} from "@openrift/shared/test/integration-setup";

import type * as AppModule from "../../app.js";
import type * as DbModule from "../../db.js";
import { req } from "../../test/integration-helper.js";

// ---------------------------------------------------------------------------
// Integration tests: Card-sources image management routes
//
// Uses a temp database — auth and image-rehost are mocked. Requires DATABASE_URL.
// Excluded from `bun run test` by filename convention (.integration.test.ts).
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

const USER_ID = "a0000000-0000-4000-a000-00000000aa01";

// Mock image rehost service (filesystem operations)
mock.module("../../services/image-rehost.js", () => ({
  CARD_IMAGES_DIR: "/tmp/test-card-images",
  downloadImage: async () => ({ buffer: Buffer.from("fake-image-data"), ext: ".png" }),
  printingIdToFileBase: (id: string) => id.replaceAll(":", "-"),
  // oxlint-disable-next-line no-empty-function -- noop mock
  processAndSave: async () => {},
  // oxlint-disable-next-line no-empty-function -- noop mock
  deleteRehostFiles: async () => {},
  // oxlint-disable-next-line no-empty-function -- noop mock
  renameRehostFiles: async () => {},
  rehostImages: async () => ({ total: 0, rehosted: 0, skipped: 0, failed: 0, errors: [] }),
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
    total: 0,
    rehosted: 0,
    external: 0,
    sets: [],
    disk: { totalBytes: 0, sets: [] },
  }),
}));

mock.module("../../auth.js", () => ({
  auth: {
    handler: () => new Response("ok"),
    api: {
      getSession: async () => ({
        user: { id: USER_ID, email: "a@test.com", name: "User A" },
        session: { id: "sess-a" },
      }),
    },
    $Infer: { Session: { user: null, session: null } },
  },
}));

let app: AppModule["app"];
let db: DbModule["db"];
let tempDbName = "";

// Seed data IDs (populated during setup)
let printingId = "";
const printingSlug = "TEST-001:common:normal:";
let psId = ""; // printing source with image + linked
let psNoImageId = ""; // printing source without image
let psUnlinkedId = ""; // printing source not linked to a printing

if (DATABASE_URL) {
  tempDbName = await createTempDb(DATABASE_URL, "cs_images");
  process.env.DATABASE_URL = replaceDbName(DATABASE_URL, tempDbName);

  const [appModule, dbModule, migrateModule] = await Promise.all([
    import("../../app.js"),
    import("../../db.js"),
    import("@openrift/shared/db/migrate"),
  ]);
  app = appModule.app;
  db = dbModule.db;
  await migrateModule.migrate(db, noopLogger);

  // Seed test user + admin
  await db
    .insertInto("users")
    .values({ id: USER_ID, email: "a@test.com", name: "User A", email_verified: true, image: null })
    .execute();
  await db.insertInto("admins").values({ user_id: USER_ID }).execute();

  // Seed set
  const [set] = await db
    .insertInto("sets")
    .values({ slug: "TEST", name: "Test Set", printed_total: 1, sort_order: 1 })
    .returning("id")
    .execute();

  // Seed card
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

  // Seed printing
  const [printing] = await db
    .insertInto("printings")
    .values({
      slug: printingSlug,
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

  // Seed card source
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

  // Printing source WITH image and linked to printing
  const [ps] = await db
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
      source_entity_id: null,
      extra_data: null,
    })
    .returning("id")
    .execute();
  psId = ps.id;

  // Second card source (needed for unique constraint on card_source_id + printing_id)
  const [cs2] = await db
    .insertInto("card_sources")
    .values({
      source: "test-source-2",
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

  // Printing source WITHOUT image (for 400 test)
  const [psNoImage] = await db
    .insertInto("printing_sources")
    .values({
      card_source_id: cs2.id,
      printing_id: printingId,
      source_id: "TEST-001b",
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
      image_url: null,
      flavor_text: null,
      source_entity_id: null,
      extra_data: null,
    })
    .returning("id")
    .execute();
  psNoImageId = psNoImage.id;

  // Printing source NOT linked to a printing (for 400 test)
  const [psUnlinked] = await db
    .insertInto("printing_sources")
    .values({
      card_source_id: cs.id,
      printing_id: null,
      source_id: "TEST-002",
      set_id: "TEST",
      set_name: "Test Set",
      collector_number: 2,
      rarity: "Rare",
      art_variant: "normal",
      is_signed: false,
      is_promo: false,
      finish: "normal",
      artist: "Test Artist",
      public_code: "TST",
      printed_rules_text: null,
      printed_effect_text: null,
      image_url: "https://example.com/test2.png",
      flavor_text: null,
      source_entity_id: null,
      extra_data: null,
    })
    .returning("id")
    .execute();
  psUnlinkedId = psUnlinked.id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!DATABASE_URL)("Card-sources images routes (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    await dropTempDb(DATABASE_URL, tempDbName);
  });

  // Track printing_image IDs created during tests
  let mainImageId = "";
  let additionalImageId = "";

  // ── POST /printing-sources/:id/set-image ─────────────────────────────────

  describe("POST /admin/card-sources/printing-sources/:id/set-image", () => {
    it("sets image as main for a linked printing source", async () => {
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-sources/${psId}/set-image`, { mode: "main" }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ ok: true });

      // Verify printing_image was created
      const images = await db
        .selectFrom("printing_images")
        .selectAll()
        .where("printing_id", "=", printingId)
        .execute();
      expect(images.length).toBeGreaterThanOrEqual(1);

      const active = images.find((i) => i.is_active);
      expect(active).toBeDefined();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(active!.original_url).toBe("https://example.com/test.png");
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(active!.source).toBe("test-source");
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      mainImageId = active!.id;
    });

    it("sets image as additional for a linked printing source", async () => {
      // Use a different source to avoid upsert conflict
      const [cs2] = await db
        .insertInto("card_sources")
        .values({
          source: "alt-source",
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
          source_id: "TEST-001-ALT",
          source_entity_id: null,
          extra_data: null,
        })
        .returning("id")
        .execute();

      const [psAlt] = await db
        .insertInto("printing_sources")
        .values({
          card_source_id: cs2.id,
          printing_id: printingId,
          source_id: "TEST-001-ALT",
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
          image_url: "https://example.com/test-alt.png",
          flavor_text: null,
          source_entity_id: null,
          extra_data: null,
        })
        .returning("id")
        .execute();

      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-sources/${psAlt.id}/set-image`, {
          mode: "additional",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ ok: true });

      // Verify additional image was created as inactive
      const images = await db
        .selectFrom("printing_images")
        .selectAll()
        .where("printing_id", "=", printingId)
        .where("source", "=", "alt-source")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].is_active).toBe(false);
      additionalImageId = images[0].id;
    });

    it("returns 404 for non-existent printing source", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-sources/${fakeId}/set-image`, { mode: "main" }),
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 when printing source is not linked to a printing", async () => {
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-sources/${psUnlinkedId}/set-image`, {
          mode: "main",
        }),
      );
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Printing source not linked to a printing");
    });

    it("returns 400 when printing source has no image URL", async () => {
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-sources/${psNoImageId}/set-image`, {
          mode: "main",
        }),
      );
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Printing source has no image URL");
    });
  });

  // ── POST /printing-images/:imageId/activate ──────────────────────────────

  describe("POST /admin/card-sources/printing-images/:imageId/activate", () => {
    it("activates an inactive image", async () => {
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-images/${additionalImageId}/activate`, {
          active: true,
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ ok: true });

      // Verify the image is now active
      const image = await db
        .selectFrom("printing_images")
        .select("is_active")
        .where("id", "=", additionalImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(image!.is_active).toBe(true);

      // The previously active image should be deactivated
      const prev = await db
        .selectFrom("printing_images")
        .select("is_active")
        .where("id", "=", mainImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(prev!.is_active).toBe(false);
    });

    it("deactivates an active image", async () => {
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-images/${additionalImageId}/activate`, {
          active: false,
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ ok: true });

      // Verify the image is now inactive
      const image = await db
        .selectFrom("printing_images")
        .select("is_active")
        .where("id", "=", additionalImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(image!.is_active).toBe(false);
    });

    it("returns 404 for non-existent image", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-images/${fakeId}/activate`, { active: true }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── POST /printing-images/:imageId/rehost ────────────────────────────────

  describe("POST /admin/card-sources/printing-images/:imageId/rehost", () => {
    it("rehosts an image with original_url", async () => {
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-images/${mainImageId}/rehost`),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.rehostedUrl).toBeString();

      // Verify rehosted_url was set in DB
      const image = await db
        .selectFrom("printing_images")
        .select("rehosted_url")
        .where("id", "=", mainImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(image!.rehosted_url).toBeString();
    });

    it("returns 400 when image has no original_url", async () => {
      // Insert a printing_image with no original_url (rehosted_url satisfies the DB constraint)
      const [noUrlImage] = await db
        .insertInto("printing_images")
        .values({
          printing_id: printingId,
          face: "front",
          source: "no-url-source",
          original_url: null,
          rehosted_url: "/card-images/TEST/placeholder",
          is_active: false,
        })
        .returning("id")
        .execute();

      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-images/${noUrlImage.id}/rehost`),
      );
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Image has no original URL to rehost");

      // Clean up
      await db.deleteFrom("printing_images").where("id", "=", noUrlImage.id).execute();
    });

    it("returns 404 for non-existent image", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-images/${fakeId}/rehost`),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── POST /printing-images/:imageId/unrehost ──────────────────────────────

  describe("POST /admin/card-sources/printing-images/:imageId/unrehost", () => {
    it("unrehosts a rehosted image", async () => {
      // mainImageId was rehosted in the previous describe block
      const before = await db
        .selectFrom("printing_images")
        .select("rehosted_url")
        .where("id", "=", mainImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(before!.rehosted_url).toBeString();

      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-images/${mainImageId}/unrehost`),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ ok: true });

      // Verify rehosted_url was cleared
      const after = await db
        .selectFrom("printing_images")
        .select("rehosted_url")
        .where("id", "=", mainImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(after!.rehosted_url).toBeNull();
    });

    it("returns 400 when image is not rehosted", async () => {
      // mainImageId was just unrehosted, so rehosted_url is null
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-images/${mainImageId}/unrehost`),
      );
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Image is not rehosted");
    });

    it("returns 404 for non-existent image", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-images/${fakeId}/unrehost`),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /printing-images/:imageId ──────────────────────────────────────

  describe("DELETE /admin/card-sources/printing-images/:imageId", () => {
    it("deletes a printing image", async () => {
      const res = await app.fetch(
        req("DELETE", `/admin/card-sources/printing-images/${additionalImageId}`),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ ok: true });

      // Verify it's gone
      const image = await db
        .selectFrom("printing_images")
        .select("id")
        .where("id", "=", additionalImageId)
        .executeTakeFirst();
      expect(image).toBeUndefined();
    });

    it("deletes a printing image that has a rehosted_url", async () => {
      // Set rehosted_url on mainImageId to test the deleteRehostFiles path
      await db
        .updateTable("printing_images")
        .set({ rehosted_url: "/card-images/TEST/test-rehosted" })
        .where("id", "=", mainImageId)
        .execute();

      const res = await app.fetch(
        req("DELETE", `/admin/card-sources/printing-images/${mainImageId}`),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ ok: true });

      // Verify it's gone
      const image = await db
        .selectFrom("printing_images")
        .select("id")
        .where("id", "=", mainImageId)
        .executeTakeFirst();
      expect(image).toBeUndefined();
    });

    it("returns 404 for non-existent image", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("DELETE", `/admin/card-sources/printing-images/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── POST /printing/:printingId/add-image-url ─────────────────────────────

  describe("POST /admin/card-sources/printing/:printingId/add-image-url", () => {
    it("adds an image URL to a printing", async () => {
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing/${printingSlug}/add-image-url`, {
          url: "https://example.com/new-image.png",
          source: "manual-test",
          mode: "main",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ ok: true });

      // Verify printing_image was created
      const images = await db
        .selectFrom("printing_images")
        .selectAll()
        .where("printing_id", "=", printingId)
        .where("source", "=", "manual-test")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].original_url).toBe("https://example.com/new-image.png");
      expect(images[0].is_active).toBe(true);
    });

    it("adds an image URL with default mode and source", async () => {
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing/${printingSlug}/add-image-url`, {
          url: "https://example.com/another-image.png",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ ok: true });

      // The default source is "manual" and default mode is "main"
      const images = await db
        .selectFrom("printing_images")
        .selectAll()
        .where("printing_id", "=", printingId)
        .where("source", "=", "manual")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].is_active).toBe(true);
    });

    it("returns 400 when url is empty", async () => {
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing/${printingSlug}/add-image-url`, {
          url: "",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when url is whitespace only", async () => {
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing/${printingSlug}/add-image-url`, {
          url: "   ",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent printing", async () => {
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing/FAKE-SLUG:rare:foil:/add-image-url`, {
          url: "https://example.com/nope.png",
        }),
      );
      expect(res.status).toBe(404);
    });
  });
});
