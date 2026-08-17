import { afterAll, describe, expect, it } from "vitest";

import { PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { printingImagesRepo } from "./printing-images.js";

const ctx = createDbContext("a0000000-0034-4000-a000-000000000001");

describe.skipIf(!ctx)("printingImagesRepo (integration)", () => {
  const { db } = ctx!;
  const repo = printingImagesRepo(db);

  // Seed data: first printing from OGS set
  const seedPrintingId = PRINTING_1.id;
  const createdImageIds: string[] = [];

  const DEDUPE_URL = "https://example.com/dedupe-0034.jpg";
  const RACE_URL = "https://example.com/race-0034.jpg";

  afterAll(async () => {
    if (createdImageIds.length > 0) {
      await db.deleteFrom("printingImages").where("id", "in", createdImageIds).execute();
    }
    await db.deleteFrom("imageFiles").where("originalUrl", "in", [DEDUPE_URL, RACE_URL]).execute();
    // Re-activate any deactivated images
    await db
      .updateTable("printingImages")
      .set({ isActive: true })
      .where("printingId", "=", seedPrintingId)
      .where("face", "=", "front")
      .execute();
  });

  it("insertImage creates a front image in main mode", async () => {
    const imageId = await repo.insertImage(
      seedPrintingId,
      "https://example.com/test-img.jpg",
      "main",
    );
    expect(imageId).not.toBeNull();
    createdImageIds.push(imageId!);
  });

  it("insertImage returns null when imageUrl is null", async () => {
    const result = await repo.insertImage(seedPrintingId, null);
    expect(result).toBeNull();
  });

  it("insertImage creates an inactive image in additional mode", async () => {
    const imageId = await repo.insertImage(
      seedPrintingId,
      "https://example.com/additional.jpg",
      "additional",
    );
    expect(imageId).not.toBeNull();
    createdImageIds.push(imageId!);
  });

  it("updateRehostedUrl sets the rehosted URL", async () => {
    const imageId = createdImageIds[0];
    const imageFileId = await repo.getImageFileId(imageId);
    expect(imageFileId).toBeDefined();
    await repo.updateRehostedUrl(imageFileId!, "https://cdn.example.com/rehosted.jpg");

    // Verify via listAllRehosted
    const rehosted = await repo.listAllRehosted();
    const found = rehosted.find((r) => r.imageId === imageFileId);
    expect(found).toBeDefined();
    expect(found!.rehostedUrl).toBe("https://cdn.example.com/rehosted.jpg");
  });

  it("listAllRehosted returns images with rehosted URLs", async () => {
    const imageFileId = await repo.getImageFileId(createdImageIds[0]);
    const result = await repo.listAllRehosted();
    expect(Array.isArray(result)).toBe(true);
    const found = result.find((r) => r.imageId === imageFileId);
    expect(found).toBeDefined();
  });

  it("getImageFileById returns the image_file's urls", async () => {
    const imageFileId = await repo.getImageFileId(createdImageIds[0]);
    expect(imageFileId).toBeDefined();
    const row = await repo.getImageFileById(imageFileId!);
    expect(row).toEqual({
      id: imageFileId,
      originalUrl: "https://example.com/test-img.jpg",
      rehostedUrl: "https://cdn.example.com/rehosted.jpg",
      rotation: 0,
      needsTrim: false,
    });
  });

  it("getImageFileById returns undefined for an unknown id", async () => {
    const row = await repo.getImageFileById("00000000-0000-4000-a000-000000000000");
    expect(row).toBeUndefined();
  });

  it("countOthersByImageFileId returns 0 when no other printing image shares the image file", async () => {
    const imageFileId = await repo.getImageFileId(createdImageIds[0]);
    expect(imageFileId).toBeDefined();
    const count = await repo.countOthersByImageFileId(imageFileId!, createdImageIds[0]);
    expect(count).toBe(0);
  });

  it("listAllRehostedWithContext returns images with card context", async () => {
    const result = await repo.listAllRehostedWithContext();
    expect(Array.isArray(result)).toBe(true);
    const imageFileId = await repo.getImageFileId(createdImageIds[0]);
    const found = result.find((r) => r.imageId === imageFileId);
    if (found) {
      expect(found).toHaveProperty("cardSlug");
      expect(found).toHaveProperty("cardName");
      expect(found).toHaveProperty("printingShortCode");
      expect(found).toHaveProperty("setSlug");
    }
  });

  it("allRehostedUrls returns flat list of URLs", async () => {
    const urls = await repo.allRehostedUrls();
    expect(Array.isArray(urls)).toBe(true);
    expect(urls).toContain("https://cdn.example.com/rehosted.jpg");
  });

  it("insertImage reuses the existing image_files row for a URL it has seen", async () => {
    const first = await repo.insertImage(seedPrintingId, DEDUPE_URL, "additional");
    const second = await repo.insertImage(seedPrintingId, DEDUPE_URL, "additional");
    createdImageIds.push(first!, second!);

    const firstFileId = await repo.getImageFileId(first!);
    expect(firstFileId).toBeDefined();
    expect(await repo.getImageFileId(second!)).toBe(firstFileId);
  });

  it("concurrent insertImage calls for one new URL dedupe instead of throwing", async () => {
    // Regression: findOrCreateImageFile used to select then insert, so two
    // callers racing on a URL neither had seen both found nothing and both
    // inserted. idx_image_files_original_url is UNIQUE, so the loser threw
    // rather than deduping. The insert now leads with ON CONFLICT DO NOTHING
    // and falls back to a select, which resolves to one row either way.
    const [first, second] = await Promise.all([
      repo.insertImage(seedPrintingId, RACE_URL, "additional"),
      repo.insertImage(seedPrintingId, RACE_URL, "additional"),
    ]);
    createdImageIds.push(first!, second!);

    const firstFileId = await repo.getImageFileId(first!);
    expect(firstFileId).toBeDefined();
    expect(await repo.getImageFileId(second!)).toBe(firstFileId);

    const files = await db
      .selectFrom("imageFiles")
      .select("id")
      .where("originalUrl", "=", RACE_URL)
      .execute();
    expect(files).toHaveLength(1);
  });

  it("deleteOrphanedImageFiles removes image_files no printing_images row points at", async () => {
    // The delete is table-wide and every integration file shares one database,
    // so it runs inside a transaction that is rolled back. Committing it would
    // take other files' fixtures with it.
    await expect(
      db.transaction().execute(async (trx) => {
        const orphan = await trx
          .insertInto("imageFiles")
          .values({ originalUrl: "https://example.com/orphan-0034.jpg" })
          .returning("id")
          .executeTakeFirstOrThrow();

        expect(await printingImagesRepo(trx).deleteOrphanedImageFiles()).toBeGreaterThanOrEqual(1);

        const survivor = await trx
          .selectFrom("imageFiles")
          .select("id")
          .where("id", "=", orphan.id)
          .executeTakeFirst();
        expect(survivor).toBeUndefined();

        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
  });
});
