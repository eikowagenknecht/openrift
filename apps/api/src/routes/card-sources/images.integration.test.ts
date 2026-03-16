import { describe, expect, it, mock } from "bun:test";

// Mock image rehost service (filesystem operations)
mock.module("../../services/image-rehost.js", () => ({
  CARD_IMAGES_DIR: "/tmp/test-card-images",
  downloadImage: async () => ({ buffer: Buffer.from("fake-image-data"), ext: ".png" }),
  printingIdToFileBase: (id: string) => {
    const [sourceId, rarity, finish, promo] = id.split(":");
    return `${sourceId}-${rarity}-${finish}-${promo ? "y" : "n"}`;
  },
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

// oxlint-disable-next-line import/first -- mock.module must run before this import
import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Card-sources image management routes
//
// Uses the shared integration database. Auth and image-rehost are mocked.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0021-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

// Seed data IDs (populated during setup)
let printingId = "";
const printingSlug = "CSI-001:common:normal:";
let psId = ""; // printing source with image + linked
let psNoImageId = ""; // printing source without image
let psUnlinkedId = ""; // printing source not linked to a printing

// Seed test-specific data (CSI- prefix to avoid collisions)
if (ctx) {
  const { db } = ctx;

  // Ensure user is an admin
  await db
    .insertInto("admins")
    .values({ userId: USER_ID })
    .onConflict((oc) => oc.column("userId").doNothing())
    .execute();

  // Seed set
  const [set] = await db
    .insertInto("sets")
    .values({ slug: "CSI", name: "CSI Test Set", printedTotal: 1, sortOrder: 930 })
    .returning("id")
    .execute();

  // Seed card
  const [card] = await db
    .insertInto("cards")
    .values({
      slug: "CSI-001",
      name: "CSI Test Card",
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

  // Seed printing
  const [printing] = await db
    .insertInto("printings")
    .values({
      slug: printingSlug,
      cardId: card.id,
      setId: set.id,
      sourceId: "CSI-001",
      collectorNumber: 1,
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      isPromo: false,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "CSI",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
    })
    .returning("id")
    .execute();
  printingId = printing.id;

  // Seed card source
  const [cs] = await db
    .insertInto("cardSources")
    .values({
      source: "csi-source",
      name: "CSI Test Card",
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
      sourceId: "CSI-001",
      sourceEntityId: null,
      extraData: null,
    })
    .returning("id")
    .execute();

  // Printing source WITH image and linked to printing
  const [ps] = await db
    .insertInto("printingSources")
    .values({
      cardSourceId: cs.id,
      printingId: printingId,
      sourceId: "CSI-001",
      setId: "CSI",
      setName: "CSI Test Set",
      collectorNumber: 1,
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      isPromo: false,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "CSI",
      printedRulesText: null,
      printedEffectText: null,
      imageUrl: "https://example.com/csi-test.png",
      flavorText: null,
      sourceEntityId: null,
      extraData: null,
    })
    .returning("id")
    .execute();
  psId = ps.id;

  // Second card source (needed for unique constraint on card_source_id + printing_id)
  const [cs2] = await db
    .insertInto("cardSources")
    .values({
      source: "csi-source-2",
      name: "CSI Test Card",
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
      sourceId: "CSI-001",
      sourceEntityId: null,
      extraData: null,
    })
    .returning("id")
    .execute();

  // Printing source WITHOUT image (for 400 test)
  const [psNoImage] = await db
    .insertInto("printingSources")
    .values({
      cardSourceId: cs2.id,
      printingId: printingId,
      sourceId: "CSI-001b",
      setId: "CSI",
      setName: "CSI Test Set",
      collectorNumber: 1,
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      isPromo: false,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "CSI",
      printedRulesText: null,
      printedEffectText: null,
      imageUrl: null,
      flavorText: null,
      sourceEntityId: null,
      extraData: null,
    })
    .returning("id")
    .execute();
  psNoImageId = psNoImage.id;

  // Printing source NOT linked to a printing (for 400 test)
  const [psUnlinked] = await db
    .insertInto("printingSources")
    .values({
      cardSourceId: cs.id,
      printingId: null,
      sourceId: "CSI-002",
      setId: "CSI",
      setName: "CSI Test Set",
      collectorNumber: 2,
      rarity: "Rare",
      artVariant: "normal",
      isSigned: false,
      isPromo: false,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "CSI",
      printedRulesText: null,
      printedEffectText: null,
      imageUrl: "https://example.com/csi-test2.png",
      flavorText: null,
      sourceEntityId: null,
      extraData: null,
    })
    .returning("id")
    .execute();
  psUnlinkedId = psUnlinked.id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Card-sources images routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  // Track printing_image IDs created during tests
  let mainImageId = "";
  let additionalImageId = "";

  // ── POST /printing-sources/:id/set-image ─────────────────────────────────

  describe("POST /admin/card-sources/printing-sources/:id/set-image", () => {
    it("sets image as main for a linked printing source", async () => {
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-sources/${psId}/set-image`, { mode: "main" }),
      );
      expect(res.status).toBe(204);

      // Verify printing_image was created
      const images = await db
        .selectFrom("printingImages")
        .selectAll()
        .where("printingId", "=", printingId)
        .execute();
      expect(images.length).toBeGreaterThanOrEqual(1);

      const active = images.find((i) => i.isActive);
      expect(active).toBeDefined();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(active!.originalUrl).toBe("https://example.com/csi-test.png");
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(active!.source).toBe("csi-source");
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      mainImageId = active!.id;
    });

    it("sets image as additional for a linked printing source", async () => {
      // Use a different source to avoid upsert conflict
      const [cs2] = await db
        .insertInto("cardSources")
        .values({
          source: "csi-alt-source",
          name: "CSI Test Card",
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
          sourceId: "CSI-001-ALT",
          sourceEntityId: null,
          extraData: null,
        })
        .returning("id")
        .execute();

      const [psAlt] = await db
        .insertInto("printingSources")
        .values({
          cardSourceId: cs2.id,
          printingId: printingId,
          sourceId: "CSI-001-ALT",
          setId: "CSI",
          setName: "CSI Test Set",
          collectorNumber: 1,
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          isPromo: false,
          finish: "normal",
          artist: "Test Artist",
          publicCode: "CSI",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: "https://example.com/csi-test-alt.png",
          flavorText: null,
          sourceEntityId: null,
          extraData: null,
        })
        .returning("id")
        .execute();

      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-sources/${psAlt.id}/set-image`, {
          mode: "additional",
        }),
      );
      expect(res.status).toBe(204);

      // Verify additional image was created as inactive
      const images = await db
        .selectFrom("printingImages")
        .selectAll()
        .where("printingId", "=", printingId)
        .where("source", "=", "csi-alt-source")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].isActive).toBe(false);
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
      expect(res.status).toBe(204);

      // Verify the image is now active
      const image = await db
        .selectFrom("printingImages")
        .select("isActive")
        .where("id", "=", additionalImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(image!.isActive).toBe(true);

      // The previously active image should be deactivated
      const prev = await db
        .selectFrom("printingImages")
        .select("isActive")
        .where("id", "=", mainImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(prev!.isActive).toBe(false);
    });

    it("deactivates an active image", async () => {
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-images/${additionalImageId}/activate`, {
          active: false,
        }),
      );
      expect(res.status).toBe(204);

      // Verify the image is now inactive
      const image = await db
        .selectFrom("printingImages")
        .select("isActive")
        .where("id", "=", additionalImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(image!.isActive).toBe(false);
    });

    it("returns 404 for non-existent image", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-images/${fakeId}/activate`, { active: true }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── POST /printing-images/:imageId/activate (rehosted paths) ────────────

  describe("POST /admin/card-sources/printing-images/:imageId/activate (rehosted)", () => {
    it("renames rehosted files when swapping active images", async () => {
      // Give both images a rehostedUrl to exercise the rename branches
      await db
        .updateTable("printingImages")
        .set({ rehostedUrl: "/card-images/CSI/CSI-001-common-normal-n", isActive: true })
        .where("id", "=", mainImageId)
        .execute();
      await db
        .updateTable("printingImages")
        .set({
          rehostedUrl: `/card-images/CSI/CSI-001-common-normal-n-${additionalImageId}`,
          isActive: false,
        })
        .where("id", "=", additionalImageId)
        .execute();

      // Activate the additional image → should deactivate main and rename files
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-images/${additionalImageId}/activate`, {
          active: true,
        }),
      );
      expect(res.status).toBe(204);

      // The newly active image should get the main path
      const newActive = await db
        .selectFrom("printingImages")
        .select(["isActive", "rehostedUrl"])
        .where("id", "=", additionalImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted by skipIf
      expect(newActive!.isActive).toBe(true);
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted by skipIf
      expect(newActive!.rehostedUrl).toBe("/card-images/CSI/CSI-001-common-normal-n");

      // The demoted image should get an ID-suffixed path
      const demoted = await db
        .selectFrom("printingImages")
        .select(["isActive", "rehostedUrl"])
        .where("id", "=", mainImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted by skipIf
      expect(demoted!.isActive).toBe(false);
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted by skipIf
      expect(demoted!.rehostedUrl).toBe(`/card-images/CSI/CSI-001-common-normal-n-${mainImageId}`);
    });

    it("renames rehosted files when deactivating an image", async () => {
      // additionalImageId is currently active with the main path from the previous test
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-images/${additionalImageId}/activate`, {
          active: false,
        }),
      );
      expect(res.status).toBe(204);

      // The deactivated image should get an ID-suffixed path
      const image = await db
        .selectFrom("printingImages")
        .select(["isActive", "rehostedUrl"])
        .where("id", "=", additionalImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted by skipIf
      expect(image!.isActive).toBe(false);
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted by skipIf
      expect(image!.rehostedUrl).toBe(
        `/card-images/CSI/CSI-001-common-normal-n-${additionalImageId}`,
      );
    });

    it("activates an image without rehostedUrl (no rename)", async () => {
      // Clear rehostedUrl on mainImageId to test the non-rehosted activation path
      await db
        .updateTable("printingImages")
        .set({ rehostedUrl: null, originalUrl: "https://example.com/csi-test.png" })
        .where("id", "=", mainImageId)
        .execute();

      // Also ensure no currently-active image for this face
      await db
        .updateTable("printingImages")
        .set({ isActive: false })
        .where("printingId", "=", printingId)
        .where("face", "=", "front")
        .execute();

      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-images/${mainImageId}/activate`, {
          active: true,
        }),
      );
      expect(res.status).toBe(204);

      const image = await db
        .selectFrom("printingImages")
        .select(["isActive", "rehostedUrl"])
        .where("id", "=", mainImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted by skipIf
      expect(image!.isActive).toBe(true);
      // rehostedUrl should remain null (no rename happened)
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted by skipIf
      expect(image!.rehostedUrl).toBeNull();
    });
  });

  // ── POST /printing-images/:imageId/rehost ────────────────────────────────

  describe("POST /admin/card-sources/printing-images/:imageId/rehost", () => {
    it("rehosts an image with originalUrl", async () => {
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-images/${mainImageId}/rehost`),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.rehostedUrl).toBeString();

      // Verify rehostedUrl was set in DB
      const image = await db
        .selectFrom("printingImages")
        .select("rehostedUrl")
        .where("id", "=", mainImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(image!.rehostedUrl).toBeString();
    });

    it("returns 400 when image has no originalUrl", async () => {
      // Insert a printing_image with no originalUrl (rehostedUrl satisfies the DB constraint)
      const [noUrlImage] = await db
        .insertInto("printingImages")
        .values({
          printingId: printingId,
          face: "front",
          source: "csi-no-url-source",
          originalUrl: null,
          rehostedUrl: "/card-images/CSI/placeholder",
          isActive: false,
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
      await db.deleteFrom("printingImages").where("id", "=", noUrlImage.id).execute();
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
        .selectFrom("printingImages")
        .select("rehostedUrl")
        .where("id", "=", mainImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(before!.rehostedUrl).toBeString();

      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing-images/${mainImageId}/unrehost`),
      );
      expect(res.status).toBe(204);

      // Verify rehostedUrl was cleared
      const after = await db
        .selectFrom("printingImages")
        .select("rehostedUrl")
        .where("id", "=", mainImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(after!.rehostedUrl).toBeNull();
    });

    it("returns 400 when image is not rehosted", async () => {
      // mainImageId was just unrehosted, so rehostedUrl is null
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
      expect(res.status).toBe(204);

      // Verify it's gone
      const image = await db
        .selectFrom("printingImages")
        .select("id")
        .where("id", "=", additionalImageId)
        .executeTakeFirst();
      expect(image).toBeUndefined();
    });

    it("deletes a printing image that has a rehostedUrl", async () => {
      // Set rehostedUrl on mainImageId to test the deleteRehostFiles path
      await db
        .updateTable("printingImages")
        .set({ rehostedUrl: "/card-images/CSI/csi-test-rehosted" })
        .where("id", "=", mainImageId)
        .execute();

      const res = await app.fetch(
        req("DELETE", `/admin/card-sources/printing-images/${mainImageId}`),
      );
      expect(res.status).toBe(204);

      // Verify it's gone
      const image = await db
        .selectFrom("printingImages")
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
          url: "https://example.com/csi-new-image.png",
          source: "csi-manual-test",
          mode: "main",
        }),
      );
      expect(res.status).toBe(204);

      // Verify printing_image was created
      const images = await db
        .selectFrom("printingImages")
        .selectAll()
        .where("printingId", "=", printingId)
        .where("source", "=", "csi-manual-test")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].originalUrl).toBe("https://example.com/csi-new-image.png");
      expect(images[0].isActive).toBe(true);
    });

    it("adds an image URL with default mode and source", async () => {
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing/${printingSlug}/add-image-url`, {
          url: "https://example.com/csi-another-image.png",
        }),
      );
      expect(res.status).toBe(204);

      // The default source is "manual" and default mode is "main"
      const images = await db
        .selectFrom("printingImages")
        .selectAll()
        .where("printingId", "=", printingId)
        .where("source", "=", "manual")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].isActive).toBe(true);
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

    it("adds an image URL in additional mode", async () => {
      const res = await app.fetch(
        req("POST", `/admin/card-sources/printing/${printingSlug}/add-image-url`, {
          url: "https://example.com/csi-additional-image.png",
          source: "csi-additional-test",
          mode: "additional",
        }),
      );
      expect(res.status).toBe(204);

      // Verify the image was created as inactive
      const images = await db
        .selectFrom("printingImages")
        .selectAll()
        .where("printingId", "=", printingId)
        .where("source", "=", "csi-additional-test")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].originalUrl).toBe("https://example.com/csi-additional-image.png");
      expect(images[0].isActive).toBe(false);
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

  // ── POST /printing/:printingId/upload-image ─────────────────────────────

  describe("POST /admin/card-sources/printing/:printingId/upload-image", () => {
    it("uploads an image as main", async () => {
      const formData = new FormData();
      formData.append(
        "file",
        new File([new Uint8Array([137, 80, 78, 71])], "test.png", { type: "image/png" }),
      );
      formData.append("source", "csi-upload-test");
      formData.append("mode", "main");

      const request = new Request(
        `http://localhost/api/admin/card-sources/printing/${printingSlug}/upload-image`,
        { method: "POST", body: formData },
      );
      const res = await app.fetch(request);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.rehostedUrl).toBeString();
      expect(json.rehostedUrl).toContain("/card-images/CSI/");

      // Verify DB state: should be active with rehostedUrl
      const images = await db
        .selectFrom("printingImages")
        .selectAll()
        .where("printingId", "=", printingId)
        .where("source", "=", "csi-upload-test")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].isActive).toBe(true);
      expect(images[0].rehostedUrl).toBe(json.rehostedUrl);
    });

    it("uploads an image as additional", async () => {
      const formData = new FormData();
      formData.append(
        "file",
        new File([new Uint8Array([137, 80, 78, 71])], "extra.png", { type: "image/png" }),
      );
      formData.append("source", "csi-upload-additional");
      formData.append("mode", "additional");

      const request = new Request(
        `http://localhost/api/admin/card-sources/printing/${printingSlug}/upload-image`,
        { method: "POST", body: formData },
      );
      const res = await app.fetch(request);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.rehostedUrl).toBeString();

      // Verify DB state: should be inactive
      const images = await db
        .selectFrom("printingImages")
        .selectAll()
        .where("printingId", "=", printingId)
        .where("source", "=", "csi-upload-additional")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].isActive).toBe(false);
      expect(images[0].rehostedUrl).toBe(json.rehostedUrl);
      // The rehostedUrl for additional should include the image ID suffix
      expect(json.rehostedUrl).toContain(images[0].id);
    });

    it("uploads with default mode (main) and source (upload)", async () => {
      const formData = new FormData();
      formData.append(
        "file",
        new File([new Uint8Array([137, 80, 78, 71])], "default.png", { type: "image/png" }),
      );

      const request = new Request(
        `http://localhost/api/admin/card-sources/printing/${printingSlug}/upload-image`,
        { method: "POST", body: formData },
      );
      const res = await app.fetch(request);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.rehostedUrl).toBeString();

      // Verify default source is "upload" and default mode is "main" (active)
      const images = await db
        .selectFrom("printingImages")
        .selectAll()
        .where("printingId", "=", printingId)
        .where("source", "=", "upload")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].isActive).toBe(true);
    });

    it("returns 404 for non-existent printing", async () => {
      const formData = new FormData();
      formData.append(
        "file",
        new File([new Uint8Array([137, 80, 78, 71])], "nope.png", { type: "image/png" }),
      );

      const request = new Request(
        `http://localhost/api/admin/card-sources/printing/FAKE-SLUG:rare:foil:/upload-image`,
        { method: "POST", body: formData },
      );
      const res = await app.fetch(request);
      expect(res.status).toBe(404);
    });
  });
});
