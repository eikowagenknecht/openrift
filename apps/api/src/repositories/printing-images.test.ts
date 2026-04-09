import { describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { createMockDb } from "../test/mock-db.js";
import { printingImagesRepo } from "./printing-images.js";

describe("printingImagesRepo", () => {
  it("getIdAndRehostedUrl returns image data", async () => {
    const db = createMockDb([{ id: "pi-1", rehostedUrl: "https://example.com/img.jpg" }]);
    expect(await printingImagesRepo(db).getIdAndRehostedUrl("pi-1")).toBeDefined();
  });

  it("getIdAndUrls returns image URLs", async () => {
    const db = createMockDb([
      { id: "pi-1", rehostedUrl: null, originalUrl: "https://example.com/orig.jpg" },
    ]);
    expect(await printingImagesRepo(db).getIdAndUrls("pi-1")).toBeDefined();
  });

  it("getForActivate returns image for activation", async () => {
    const db = createMockDb([{ id: "pi-1", printingId: "p-1" }]);
    expect(await printingImagesRepo(db).getForActivate("pi-1")).toBeDefined();
  });

  it("getForRehost returns image with set slug", async () => {
    const db = createMockDb([
      { id: "pi-1", originalUrl: "https://example.com/img.jpg", setSlug: "OGS" },
    ]);
    expect(await printingImagesRepo(db).getForRehost("pi-1")).toBeDefined();
  });

  it("deleteById deletes an image", async () => {
    const db = createMockDb([]);
    await expect(printingImagesRepo(db).deleteById("pi-1")).resolves.toBeUndefined();
  });

  it("updateRehostedUrl updates the URL", async () => {
    const db = createMockDb([]);
    await expect(
      printingImagesRepo(db).updateRehostedUrl("pi-1", "https://new.com/img.jpg"),
    ).resolves.toBeUndefined();
  });

  it("setActive sets the active flag", async () => {
    const db = createMockDb([]);
    await expect(printingImagesRepo(db).setActive("pi-1", true)).resolves.toBeUndefined();
  });

  it("deactivateActiveFront deactivates front image", async () => {
    const db = createMockDb([]);
    await expect(printingImagesRepo(db).deactivateActiveFront("p-1")).resolves.toBeUndefined();
  });

  it("insertImage returns null when no imageUrl", async () => {
    const db = createMockDb([]);
    expect(await printingImagesRepo(db).insertImage("p-1", null, "manual")).toBeNull();
  });

  it("insertImage main mode deactivates and inserts", async () => {
    const db = createMockDb([{ id: "pi-new" }]);
    expect(
      await printingImagesRepo(db).insertImage(
        "p-1",
        "https://example.com/img.jpg",
        "manual",
        "main",
      ),
    ).toBe("pi-new");
  });

  it("insertImage additional mode inserts as inactive", async () => {
    const db = createMockDb([{ id: "pi-new" }]);
    expect(
      await printingImagesRepo(db).insertImage(
        "p-1",
        "https://example.com/img.jpg",
        "manual",
        "additional",
      ),
    ).toBe("pi-new");
  });

  it("insertUploadedImage main mode deactivates and inserts", async () => {
    const db = createMockDb([{ id: "ci-1" }]);
    await expect(
      printingImagesRepo(db).insertUploadedImage({
        id: "pi-new",
        printingId: "p-1",
        provider: "upload",
        rehostedUrl: "https://cdn.example.com/img.jpg",
        mode: "main",
      }),
    ).resolves.toBeUndefined();
  });

  it("insertUploadedImage additional mode inserts without deactivating", async () => {
    const db = createMockDb([{ id: "ci-1" }]);
    await expect(
      printingImagesRepo(db).insertUploadedImage({
        id: "pi-new",
        printingId: "p-1",
        provider: "upload",
        rehostedUrl: "https://cdn.example.com/img.jpg",
        mode: "additional",
      }),
    ).resolves.toBeUndefined();
  });

  it("clearAllRehostedUrls returns count", async () => {
    const db = createMockDb([{ numUpdatedRows: 3n }]);
    expect(await printingImagesRepo(db).clearAllRehostedUrls()).toBe(3);
  });

  it("listUnrehosted returns images needing rehosting", async () => {
    const db = createMockDb([{ imageId: "pi-1" }]);
    expect(await printingImagesRepo(db).listUnrehosted(10)).toHaveLength(1);
  });

  it("rehostStatusBySet returns per-set stats", async () => {
    const db = createMockDb([{ setId: "OGS", setName: "Proving Grounds", total: 10, rehosted: 5 }]);
    expect(await printingImagesRepo(db).rehostStatusBySet()).toHaveLength(1);
  });

  it("restoreFromSources returns affected count", async () => {
    const db = createMockDb({ numAffectedRows: 7n });
    expect(await printingImagesRepo(db).restoreFromSources("test")).toBe(7);
  });

  it("listAllRehosted returns rehosted images", async () => {
    const db = createMockDb([{ imageId: "pi-1", rehostedUrl: "https://cdn.example.com/img.jpg" }]);
    expect(await printingImagesRepo(db).listAllRehosted()).toHaveLength(1);
  });

  it("countOthersByImageFileId returns count", async () => {
    const db = createMockDb([{ count: 2 }]);
    expect(await printingImagesRepo(db).countOthersByImageFileId("ci-1", "pi-1")).toBe(2);
  });

  it("listAllRehostedWithContext returns images with context", async () => {
    const db = createMockDb([{ imageId: "pi-1" }]);
    expect(await printingImagesRepo(db).listAllRehostedWithContext()).toHaveLength(1);
  });

  it("allRehostedUrls returns URL list", async () => {
    const db = createMockDb([{ rehostedUrl: "https://cdn.example.com/img.jpg" }]);
    expect(await printingImagesRepo(db).allRehostedUrls()).toEqual([
      "https://cdn.example.com/img.jpg",
    ]);
  });

  it("getCandidatePrintingById returns a printing", async () => {
    const db = createMockDb([{ id: "cp-1" }]);
    expect(await printingImagesRepo(db).getCandidatePrintingById("cp-1")).toBeDefined();
  });

  it("getCandidateCardProvider returns provider", async () => {
    const db = createMockDb([{ provider: "test" }]);
    expect(await printingImagesRepo(db).getCandidateCardProvider("cc-1")).toEqual({
      provider: "test",
    });
  });

  it("getPrintingById returns id", async () => {
    const db = createMockDb([{ id: "p-1" }]);
    expect(await printingImagesRepo(db).getPrintingById("p-1")).toEqual({ id: "p-1" });
  });

  // ── rehostStatusBySet (lines 233-247 — needs real DB for callback coverage) ──

  it("rehostStatusBySet returns per-set stats via real DB", async () => {
    const ctx = createDbContext("a0000000-0034-4000-a000-000000000001");
    if (!ctx) {
      return; // skip when no DB available
    }
    const repo = printingImagesRepo(ctx.db);
    const result = await repo.rehostStatusBySet();
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("setId");
      expect(result[0]).toHaveProperty("setName");
      expect(result[0]).toHaveProperty("total");
      expect(result[0]).toHaveProperty("rehosted");
    }
  });
});
