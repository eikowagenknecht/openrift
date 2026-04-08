import { describe, expect, it } from "vitest";

import type { Io } from "../../../io.js";
import { createTestContext, req } from "../../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Card-sources image management routes
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

const USER_ID = "a0000000-0021-4000-a000-000000000001";

const ctx = createTestContext(USER_ID, { io: mockIo });

// Seed data IDs (populated during setup)
let printingId = "";
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

  // Seed printing
  const [printing] = await db
    .insertInto("printings")
    .values({
      cardId: card.id,
      setId: set.id,
      shortCode: "CSI-001",
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
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
    .insertInto("candidateCards")
    .values({
      provider: "csi-source",
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
      shortCode: "CSI-001",
      externalId: "CSI-001",
      extraData: null,
    })
    .returning("id")
    .execute();

  // Printing source WITH image and linked to printing
  const [ps] = await db
    .insertInto("candidatePrintings")
    .values({
      candidateCardId: cs.id,
      printingId: printingId,
      shortCode: "CSI-001",
      setId: "CSI",
      setName: "CSI Test Set",
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "CSI",
      printedRulesText: null,
      printedEffectText: null,
      imageUrl: "https://example.com/csi-test.png",
      flavorText: null,
      externalId: "CSI-001",
      extraData: null,
    })
    .returning("id")
    .execute();
  psId = ps.id;

  // Second card source (needed for unique constraint on card_source_id + printing_id)
  const [cs2] = await db
    .insertInto("candidateCards")
    .values({
      provider: "csi-source-2",
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
      shortCode: "CSI-001",
      externalId: "CSI-001",
      extraData: null,
    })
    .returning("id")
    .execute();

  // Printing source WITHOUT image (for 400 test)
  const [psNoImage] = await db
    .insertInto("candidatePrintings")
    .values({
      candidateCardId: cs2.id,
      printingId: printingId,
      shortCode: "CSI-001b",
      setId: "CSI",
      setName: "CSI Test Set",
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "CSI",
      printedRulesText: null,
      printedEffectText: null,
      imageUrl: null,
      flavorText: null,
      externalId: "CSI-001b",
      extraData: null,
    })
    .returning("id")
    .execute();
  psNoImageId = psNoImage.id;

  // Printing source NOT linked to a printing (for 400 test)
  const [psUnlinked] = await db
    .insertInto("candidatePrintings")
    .values({
      candidateCardId: cs.id,
      printingId: null,
      shortCode: "CSI-002",
      setId: "CSI",
      setName: "CSI Test Set",
      rarity: "Rare",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "CSI",
      printedRulesText: null,
      printedEffectText: null,
      imageUrl: "https://example.com/csi-test2.png",
      flavorText: null,
      externalId: "CSI-002",
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

  // ── POST /candidate-printings/:id/set-image ─────────────────────────────────

  describe("POST /admin/cards/candidate-printings/:id/set-image", () => {
    it("sets image as main for a linked printing source", async () => {
      const res = await app.fetch(
        req("POST", `/admin/cards/candidate-printings/${psId}/set-image`, { mode: "main" }),
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
      expect(active!.provider).toBe("csi-source");
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      mainImageId = active!.id;
    });

    it("sets image as additional for a linked printing source", async () => {
      // Use a different source to avoid upsert conflict
      const [cs2] = await db
        .insertInto("candidateCards")
        .values({
          provider: "csi-alt-source",
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
          shortCode: "CSI-001-ALT",
          externalId: "CSI-001-ALT",
          extraData: null,
        })
        .returning("id")
        .execute();

      const [psAlt] = await db
        .insertInto("candidatePrintings")
        .values({
          candidateCardId: cs2.id,
          printingId: printingId,
          shortCode: "CSI-001-ALT",
          setId: "CSI",
          setName: "CSI Test Set",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          promoTypeId: null,
          finish: "normal",
          artist: "Test Artist",
          publicCode: "CSI",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: "https://example.com/csi-test-alt.png",
          flavorText: null,
          externalId: "CSI-001-ALT",
          extraData: null,
        })
        .returning("id")
        .execute();

      const res = await app.fetch(
        req("POST", `/admin/cards/candidate-printings/${psAlt.id}/set-image`, {
          mode: "additional",
        }),
      );
      expect(res.status).toBe(204);

      // Verify additional image was created as inactive
      const images = await db
        .selectFrom("printingImages")
        .selectAll()
        .where("printingId", "=", printingId)
        .where("provider", "=", "csi-alt-source")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].isActive).toBe(false);
      additionalImageId = images[0].id;
    });

    it("returns 404 for non-existent printing source", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", `/admin/cards/candidate-printings/${fakeId}/set-image`, { mode: "main" }),
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 when printing source is not linked to a printing", async () => {
      const res = await app.fetch(
        req("POST", `/admin/cards/candidate-printings/${psUnlinkedId}/set-image`, {
          mode: "main",
        }),
      );
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Candidate printing not linked to a printing");
    });

    it("returns 400 when printing source has no image URL", async () => {
      const res = await app.fetch(
        req("POST", `/admin/cards/candidate-printings/${psNoImageId}/set-image`, {
          mode: "main",
        }),
      );
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Candidate printing has no image URL");
    });
  });

  // ── POST /printing-images/:imageId/activate ──────────────────────────────

  describe("POST /admin/cards/printing-images/:imageId/activate", () => {
    it("activates an inactive image", async () => {
      const res = await app.fetch(
        req("POST", `/admin/cards/printing-images/${additionalImageId}/activate`, {
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
        req("POST", `/admin/cards/printing-images/${additionalImageId}/activate`, {
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
        req("POST", `/admin/cards/printing-images/${fakeId}/activate`, { active: true }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── POST /printing-images/:imageId/activate (rehosted paths) ────────────

  describe("POST /admin/cards/printing-images/:imageId/activate (rehosted)", () => {
    it("does not change rehostedUrls when swapping active images", async () => {
      // Give both images a rehostedUrl (UUID-based paths)
      const mainUrl = `/card-images/CSI/${mainImageId}`;
      const additionalUrl = `/card-images/CSI/${additionalImageId}`;
      await db
        .updateTable("printingImages")
        .set({ rehostedUrl: mainUrl, isActive: true })
        .where("id", "=", mainImageId)
        .execute();
      await db
        .updateTable("printingImages")
        .set({ rehostedUrl: additionalUrl, isActive: false })
        .where("id", "=", additionalImageId)
        .execute();

      // Activate the additional image → should deactivate main, leave URLs unchanged
      const res = await app.fetch(
        req("POST", `/admin/cards/printing-images/${additionalImageId}/activate`, {
          active: true,
        }),
      );
      expect(res.status).toBe(204);

      // The newly active image keeps its own URL
      const newActive = await db
        .selectFrom("printingImages")
        .select(["isActive", "rehostedUrl"])
        .where("id", "=", additionalImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted by skipIf
      expect(newActive!.isActive).toBe(true);
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted by skipIf
      expect(newActive!.rehostedUrl).toBe(additionalUrl);

      // The demoted image also keeps its own URL
      const demoted = await db
        .selectFrom("printingImages")
        .select(["isActive", "rehostedUrl"])
        .where("id", "=", mainImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted by skipIf
      expect(demoted!.isActive).toBe(false);
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted by skipIf
      expect(demoted!.rehostedUrl).toBe(mainUrl);
    });

    it("does not change rehostedUrl when deactivating an image", async () => {
      const additionalUrl = `/card-images/CSI/${additionalImageId}`;
      // additionalImageId is currently active from the previous test
      const res = await app.fetch(
        req("POST", `/admin/cards/printing-images/${additionalImageId}/activate`, {
          active: false,
        }),
      );
      expect(res.status).toBe(204);

      // The deactivated image keeps its own URL
      const image = await db
        .selectFrom("printingImages")
        .select(["isActive", "rehostedUrl"])
        .where("id", "=", additionalImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted by skipIf
      expect(image!.isActive).toBe(false);
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted by skipIf
      expect(image!.rehostedUrl).toBe(additionalUrl);
    });

    it("activates an image without rehostedUrl", async () => {
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
        req("POST", `/admin/cards/printing-images/${mainImageId}/activate`, {
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
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted by skipIf
      expect(image!.rehostedUrl).toBeNull();
    });
  });

  // ── POST /printing-images/:imageId/rehost ────────────────────────────────

  describe("POST /admin/cards/printing-images/:imageId/rehost", () => {
    it("rehosts an image with originalUrl", async () => {
      const res = await app.fetch(
        req("POST", `/admin/cards/printing-images/${mainImageId}/rehost`),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.rehostedUrl).toBeTypeOf("string");

      // Verify rehostedUrl was set in DB
      const image = await db
        .selectFrom("printingImages")
        .select("rehostedUrl")
        .where("id", "=", mainImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(image!.rehostedUrl).toBeTypeOf("string");
    });

    it("returns 400 when image has no originalUrl", async () => {
      // Insert a printing_image with no originalUrl (rehostedUrl satisfies the DB constraint)
      const [noUrlImage] = await db
        .insertInto("printingImages")
        .values({
          printingId: printingId,
          face: "front",
          provider: "csi-no-url-source",
          originalUrl: null,
          rehostedUrl: "/card-images/CSI/placeholder",
          isActive: false,
        })
        .returning("id")
        .execute();

      const res = await app.fetch(
        req("POST", `/admin/cards/printing-images/${noUrlImage.id}/rehost`),
      );
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Image has no original URL to rehost");

      // Clean up
      await db.deleteFrom("printingImages").where("id", "=", noUrlImage.id).execute();
    });

    it("returns 404 for non-existent image", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("POST", `/admin/cards/printing-images/${fakeId}/rehost`));
      expect(res.status).toBe(404);
    });
  });

  // ── POST /printing-images/:imageId/unrehost ──────────────────────────────

  describe("POST /admin/cards/printing-images/:imageId/unrehost", () => {
    it("unrehosts a rehosted image", async () => {
      // mainImageId was rehosted in the previous describe block
      const before = await db
        .selectFrom("printingImages")
        .select("rehostedUrl")
        .where("id", "=", mainImageId)
        .executeTakeFirst();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(before!.rehostedUrl).toBeTypeOf("string");

      const res = await app.fetch(
        req("POST", `/admin/cards/printing-images/${mainImageId}/unrehost`),
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
        req("POST", `/admin/cards/printing-images/${mainImageId}/unrehost`),
      );
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Image is not rehosted");
    });

    it("returns 404 for non-existent image", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("POST", `/admin/cards/printing-images/${fakeId}/unrehost`));
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /printing-images/:imageId ──────────────────────────────────────

  describe("DELETE /admin/cards/printing-images/:imageId", () => {
    it("deletes a printing image", async () => {
      const res = await app.fetch(
        req("DELETE", `/admin/cards/printing-images/${additionalImageId}`),
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

      const res = await app.fetch(req("DELETE", `/admin/cards/printing-images/${mainImageId}`));
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
      const res = await app.fetch(req("DELETE", `/admin/cards/printing-images/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── POST /printing/:printingId/add-image-url ─────────────────────────────

  describe("POST /admin/cards/printing/:printingId/add-image-url", () => {
    it("adds an image URL to a printing", async () => {
      const res = await app.fetch(
        req("POST", `/admin/cards/printing/${printingId}/add-image-url`, {
          url: "https://example.com/csi-new-image.png",
          provider: "csi-manual-test",
          mode: "main",
        }),
      );
      expect(res.status).toBe(204);

      // Verify printing_image was created
      const images = await db
        .selectFrom("printingImages")
        .selectAll()
        .where("printingId", "=", printingId)
        .where("provider", "=", "csi-manual-test")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].originalUrl).toBe("https://example.com/csi-new-image.png");
      expect(images[0].isActive).toBe(true);
    });

    it("adds an image URL with default mode and source", async () => {
      const res = await app.fetch(
        req("POST", `/admin/cards/printing/${printingId}/add-image-url`, {
          url: "https://example.com/csi-another-image.png",
        }),
      );
      expect(res.status).toBe(204);

      // The default source is "manual" and default mode is "main"
      const images = await db
        .selectFrom("printingImages")
        .selectAll()
        .where("printingId", "=", printingId)
        .where("provider", "=", "manual")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].isActive).toBe(true);
    });

    it("returns 400 when url is empty", async () => {
      const res = await app.fetch(
        req("POST", `/admin/cards/printing/${printingId}/add-image-url`, {
          url: "",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when url is whitespace only", async () => {
      const res = await app.fetch(
        req("POST", `/admin/cards/printing/${printingId}/add-image-url`, {
          url: "   ",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("adds an image URL in additional mode", async () => {
      const res = await app.fetch(
        req("POST", `/admin/cards/printing/${printingId}/add-image-url`, {
          url: "https://example.com/csi-additional-image.png",
          provider: "csi-additional-test",
          mode: "additional",
        }),
      );
      expect(res.status).toBe(204);

      // Verify the image was created as inactive
      const images = await db
        .selectFrom("printingImages")
        .selectAll()
        .where("printingId", "=", printingId)
        .where("provider", "=", "csi-additional-test")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].originalUrl).toBe("https://example.com/csi-additional-image.png");
      expect(images[0].isActive).toBe(false);
    });

    it("returns 404 for non-existent printing", async () => {
      const res = await app.fetch(
        req("POST", `/admin/cards/printing/00000000-0000-4000-a000-ffffffffffff/add-image-url`, {
          url: "https://example.com/nope.png",
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── POST /printing/:printingId/upload-image ─────────────────────────────

  describe("POST /admin/cards/printing/:printingId/upload-image", () => {
    it("uploads an image as main", async () => {
      const formData = new FormData();
      formData.append("file", new File([FAKE_BUFFER], "test.png", { type: "image/png" }));
      formData.append("provider", "csi-upload-test");
      formData.append("mode", "main");

      const request = new Request(
        `http://localhost/api/v1/admin/cards/printing/${printingId}/upload-image`,
        { method: "POST", body: formData },
      );
      const res = await app.fetch(request);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.rehostedUrl).toBeTypeOf("string");
      expect(json.rehostedUrl).toContain("/card-images/CSI/");

      // Verify DB state: should be active with rehostedUrl
      const images = await db
        .selectFrom("printingImages")
        .selectAll()
        .where("printingId", "=", printingId)
        .where("provider", "=", "csi-upload-test")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].isActive).toBe(true);
      expect(images[0].rehostedUrl).toBe(json.rehostedUrl);
    });

    it("uploads an image as additional", async () => {
      const formData = new FormData();
      formData.append("file", new File([FAKE_BUFFER], "extra.png", { type: "image/png" }));
      formData.append("provider", "csi-upload-additional");
      formData.append("mode", "additional");

      const request = new Request(
        `http://localhost/api/v1/admin/cards/printing/${printingId}/upload-image`,
        { method: "POST", body: formData },
      );
      const res = await app.fetch(request);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.rehostedUrl).toBeTypeOf("string");

      // Verify DB state: should be inactive
      const images = await db
        .selectFrom("printingImages")
        .selectAll()
        .where("printingId", "=", printingId)
        .where("provider", "=", "csi-upload-additional")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].isActive).toBe(false);
      expect(images[0].rehostedUrl).toBe(json.rehostedUrl);
      // The rehostedUrl for additional should include the image ID suffix
      expect(json.rehostedUrl).toContain(images[0].id);
    });

    it("uploads with default mode (main) and source (upload)", async () => {
      const formData = new FormData();
      formData.append("file", new File([FAKE_BUFFER], "default.png", { type: "image/png" }));

      const request = new Request(
        `http://localhost/api/v1/admin/cards/printing/${printingId}/upload-image`,
        { method: "POST", body: formData },
      );
      const res = await app.fetch(request);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.rehostedUrl).toBeTypeOf("string");

      // Verify default source is "upload" and default mode is "main" (active)
      const images = await db
        .selectFrom("printingImages")
        .selectAll()
        .where("printingId", "=", printingId)
        .where("provider", "=", "upload")
        .execute();
      expect(images.length).toBe(1);
      expect(images[0].isActive).toBe(true);
    });

    it("returns 404 for non-existent printing", async () => {
      const formData = new FormData();
      formData.append("file", new File([FAKE_BUFFER], "nope.png", { type: "image/png" }));

      const request = new Request(
        `http://localhost/api/v1/admin/cards/printing/00000000-0000-4000-a000-ffffffffffff/upload-image`,
        { method: "POST", body: formData },
      );
      const res = await app.fetch(request);
      expect(res.status).toBe(404);
    });
  });
});
