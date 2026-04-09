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

  afterAll(async () => {
    if (createdImageIds.length > 0) {
      await db.deleteFrom("printingImages").where("id", "in", createdImageIds).execute();
    }
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
      "test-provider",
      "main",
    );
    expect(imageId).not.toBeNull();
    createdImageIds.push(imageId!);
  });

  it("insertImage returns null when imageUrl is null", async () => {
    const result = await repo.insertImage(seedPrintingId, null, "test-provider");
    expect(result).toBeNull();
  });

  it("insertImage creates an inactive image in additional mode", async () => {
    const imageId = await repo.insertImage(
      seedPrintingId,
      "https://example.com/additional.jpg",
      "test-additional",
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
});
