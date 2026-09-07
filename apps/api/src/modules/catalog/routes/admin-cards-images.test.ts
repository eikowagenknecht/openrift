import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import {
  deleteRehostFiles,
  downloadImage,
  imageRehostedUrl,
  processAndSave,
  regenerateFromOrig,
  rehostImageFile,
  rehostSingleImage,
} from "../services/images/index.js";
import { adminCardImagesRouter } from "./admin-cards-images";

vi.mock("../services/images/index.js", () => ({
  CARD_MEDIA_DIR: "/mock/media/cards",
  rehostSingleImage: vi.fn(),
  rehostImageFile: vi.fn(),
  deleteRehostFiles: vi.fn(),
  downloadImage: vi.fn(),
  processAndSave: vi.fn(),
  regenerateFromOrig: vi.fn(),
  imageRehostedUrl: vi.fn(),
}));

vi.mock("uuid", () => ({
  v7: vi.fn(() => "mock-uuid-v7"),
}));

const mockRehostSingleImage = vi.mocked(rehostSingleImage);
const mockRehostImageFile = vi.mocked(rehostImageFile);
const mockDeleteRehostFiles = vi.mocked(deleteRehostFiles);
const mockDownloadImage = vi.mocked(downloadImage);
const mockProcessAndSave = vi.mocked(processAndSave);
const mockRegenerateFromOrig = vi.mocked(regenerateFromOrig);
const mockImageRehostedUrl = vi.mocked(imageRehostedUrl);

const mockPrintingImages = {
  getCandidatePrintingById: vi.fn(),
  getIdAndRehostedUrl: vi.fn(),
  getImageFileId: vi.fn(),
  countOthersByImageFileId: vi.fn(),
  countPinsByImageFileId: vi.fn(),
  getFallbackArt: vi.fn(),
  setFallbackArt: vi.fn(),
  imageFileForUrl: vi.fn(),
  insertUnattachedImageFile: vi.fn(),
  getImageFileForRehost: vi.fn(),
  deleteById: vi.fn(),
  deleteOrphanedImageFiles: vi.fn(),
  getForActivate: vi.fn(),
  getIdAndUrls: vi.fn(),
  updateRehostedUrl: vi.fn(),
  getForRehost: vi.fn(),
  getPrintingById: vi.fn(),
  setRotation: vi.fn(),
  setNeedsTrim: vi.fn(),
};

const mockTrxPrintingImages = {
  insertImage: vi.fn(),
  deactivateActiveFront: vi.fn(),
  setActive: vi.fn(),
  insertUploadedImage: vi.fn(),
  insertUnattachedImageFile: vi.fn(),
  setFallbackArt: vi.fn(),
};

const mockTransact = vi.fn(
  async (callback: (repos: { printingImages: typeof mockTrxPrintingImages }) => Promise<unknown>) =>
    callback({ printingImages: mockTrxPrintingImages }),
);

// AppErrors thrown by handlers are bridged to ORPCErrors, so the error body is `{ message, code }`.
const USER_ID = "a0000000-0001-4000-a000-000000000001";
const mockIo = { fetch: vi.fn() };

const mockAdminEvents = { insert: vi.fn() };

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("adminAccess", { isAdmin: true, sections: [] });
  c.set("io", mockIo as never);
  c.set("transact", mockTransact as never);
  c.set("repos", { printingImages: mockPrintingImages, adminEvents: mockAdminEvents } as never);
  await next();
});
registerRouterForTest(app, adminCardImagesRouter);

const SET_IMAGE =
  "/api/admin/v1/cards/candidate-printings/00000000-0000-4000-a000-000000000001/set-image";
const IMAGE_ID = "00000000-0000-4000-a000-000000000002";
const PRINTING_ID = "00000000-0000-4000-a000-000000000003";

describe("POST /candidate-printings/:id/set-image", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTransact.mockImplementation(async (cb) => cb({ printingImages: mockTrxPrintingImages }));
  });

  it("returns 204 and rehosts image on success", async () => {
    mockPrintingImages.getCandidatePrintingById.mockResolvedValue({
      printingId: "printing-1",
      imageUrl: "https://example.com/img.png",
      candidateCardId: "cc-1",
    });
    mockTrxPrintingImages.insertImage.mockResolvedValue("image-id-1");
    mockRehostSingleImage.mockResolvedValue(undefined);

    const res = await app.request(SET_IMAGE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "main" }),
    });
    expect(res.status).toBe(204);
    expect(mockTrxPrintingImages.insertImage).toHaveBeenCalledWith(
      "printing-1",
      "https://example.com/img.png",
      "main",
    );
    expect(mockRehostSingleImage).toHaveBeenCalledWith(mockIo, mockPrintingImages, "image-id-1");
  });

  it("inserts in additional mode", async () => {
    mockPrintingImages.getCandidatePrintingById.mockResolvedValue({
      printingId: "printing-1",
      imageUrl: "https://example.com/img.png",
      candidateCardId: "cc-1",
    });
    mockTrxPrintingImages.insertImage.mockResolvedValue("image-id-1");
    mockRehostSingleImage.mockResolvedValue(undefined);

    const res = await app.request(SET_IMAGE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "additional" }),
    });
    expect(res.status).toBe(204);
    expect(mockTrxPrintingImages.insertImage).toHaveBeenCalledWith(
      "printing-1",
      "https://example.com/img.png",
      "additional",
    );
  });

  it("skips rehost when insertImage returns null", async () => {
    mockPrintingImages.getCandidatePrintingById.mockResolvedValue({
      printingId: "printing-1",
      imageUrl: "https://example.com/img.png",
      candidateCardId: "cc-1",
    });
    mockTrxPrintingImages.insertImage.mockResolvedValue(null);

    const res = await app.request(SET_IMAGE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "main" }),
    });
    expect(res.status).toBe(204);
    expect(mockRehostSingleImage).not.toHaveBeenCalled();
  });

  it("returns 404 when candidate printing not found", async () => {
    mockPrintingImages.getCandidatePrintingById.mockResolvedValue(null);

    const res = await app.request(SET_IMAGE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "main" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when candidate printing has no printingId", async () => {
    mockPrintingImages.getCandidatePrintingById.mockResolvedValue({
      printingId: null,
      imageUrl: "https://example.com/img.png",
      candidateCardId: "cc-1",
    });

    const res = await app.request(SET_IMAGE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "main" }),
    });
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.message).toContain("not linked");
  });

  it("returns 400 when candidate printing has no imageUrl", async () => {
    mockPrintingImages.getCandidatePrintingById.mockResolvedValue({
      printingId: "printing-1",
      imageUrl: null,
      candidateCardId: "cc-1",
    });

    const res = await app.request(SET_IMAGE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "main" }),
    });
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.message).toContain("no image URL");
  });
});

describe("DELETE /printing-images/:imageId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and deletes rehost files when no others share them", async () => {
    mockPrintingImages.getIdAndRehostedUrl.mockResolvedValue({
      rehostedUrl: "/cards/origin/img-1.avif",
    });
    mockPrintingImages.getImageFileId.mockResolvedValue("ci-1");
    mockPrintingImages.countOthersByImageFileId.mockResolvedValue(0);
    mockPrintingImages.countPinsByImageFileId.mockResolvedValue(0);
    mockPrintingImages.deleteById.mockResolvedValue(undefined);
    mockPrintingImages.deleteOrphanedImageFiles.mockResolvedValue(0);
    mockDeleteRehostFiles.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/printing-images/${IMAGE_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockPrintingImages.deleteById).toHaveBeenCalledWith(IMAGE_ID);
    expect(mockDeleteRehostFiles).toHaveBeenCalledWith(mockIo, "/cards/origin/img-1.avif");
  });

  it("skips file deletion when other images share image_file", async () => {
    mockPrintingImages.getIdAndRehostedUrl.mockResolvedValue({
      rehostedUrl: "/cards/origin/img-1.avif",
    });
    mockPrintingImages.getImageFileId.mockResolvedValue("ci-1");
    mockPrintingImages.countOthersByImageFileId.mockResolvedValue(2);
    mockPrintingImages.countPinsByImageFileId.mockResolvedValue(0);
    mockPrintingImages.deleteById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/printing-images/${IMAGE_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockDeleteRehostFiles).not.toHaveBeenCalled();
  });

  it("skips file deletion when image has no rehostedUrl", async () => {
    mockPrintingImages.getIdAndRehostedUrl.mockResolvedValue({ rehostedUrl: null });
    mockPrintingImages.getImageFileId.mockResolvedValue(null);
    mockPrintingImages.deleteById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/printing-images/${IMAGE_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockDeleteRehostFiles).not.toHaveBeenCalled();
  });

  it("returns 404 when image not found", async () => {
    mockPrintingImages.getIdAndRehostedUrl.mockResolvedValue(null);

    const res = await app.request(
      "/api/admin/v1/cards/printing-images/00000000-0000-4000-a000-000000000099",
      {
        method: "DELETE",
      },
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /printing-images/:imageId/activate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTransact.mockImplementation(async (cb) => cb({ printingImages: mockTrxPrintingImages }));
  });

  it("returns 204 and deactivates current active when activating", async () => {
    mockPrintingImages.getForActivate.mockResolvedValue({ printingId: "printing-1" });

    const res = await app.request(`/api/admin/v1/cards/printing-images/${IMAGE_ID}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    expect(res.status).toBe(204);
    expect(mockTrxPrintingImages.deactivateActiveFront).toHaveBeenCalledWith("printing-1");
    expect(mockTrxPrintingImages.setActive).toHaveBeenCalledWith(IMAGE_ID, true);
  });

  it("returns 204 without deactivating when setting inactive", async () => {
    mockPrintingImages.getForActivate.mockResolvedValue({ printingId: "printing-1" });

    const res = await app.request(`/api/admin/v1/cards/printing-images/${IMAGE_ID}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    expect(res.status).toBe(204);
    expect(mockTrxPrintingImages.deactivateActiveFront).not.toHaveBeenCalled();
    expect(mockTrxPrintingImages.setActive).toHaveBeenCalledWith(IMAGE_ID, false);
  });

  it("returns 404 when image not found", async () => {
    mockPrintingImages.getForActivate.mockResolvedValue(null);

    const res = await app.request(
      "/api/admin/v1/cards/printing-images/00000000-0000-4000-a000-000000000099/activate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      },
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /printing-images/:imageId/unrehost", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and deletes files when no others share them", async () => {
    mockPrintingImages.getIdAndUrls.mockResolvedValue({
      rehostedUrl: "/cards/origin/img-1.avif",
      originalUrl: "https://example.com/img.png",
    });
    mockPrintingImages.getImageFileId.mockResolvedValue("ci-1");
    mockPrintingImages.countOthersByImageFileId.mockResolvedValue(0);
    mockDeleteRehostFiles.mockResolvedValue(undefined);
    mockPrintingImages.updateRehostedUrl.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/printing-images/${IMAGE_ID}/unrehost`, {
      method: "POST",
    });
    expect(res.status).toBe(204);
    expect(mockDeleteRehostFiles).toHaveBeenCalledWith(mockIo, "/cards/origin/img-1.avif");
    expect(mockPrintingImages.updateRehostedUrl).toHaveBeenCalledWith("ci-1", null);
  });

  it("skips file deletion when others share image_file", async () => {
    mockPrintingImages.getIdAndUrls.mockResolvedValue({
      rehostedUrl: "/cards/origin/img-1.avif",
      originalUrl: "https://example.com/img.png",
    });
    mockPrintingImages.getImageFileId.mockResolvedValue("ci-1");
    mockPrintingImages.countOthersByImageFileId.mockResolvedValue(1);
    mockPrintingImages.updateRehostedUrl.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/printing-images/${IMAGE_ID}/unrehost`, {
      method: "POST",
    });
    expect(res.status).toBe(204);
    expect(mockDeleteRehostFiles).not.toHaveBeenCalled();
    expect(mockPrintingImages.updateRehostedUrl).toHaveBeenCalledWith("ci-1", null);
  });

  it("returns 404 when image not found", async () => {
    mockPrintingImages.getIdAndUrls.mockResolvedValue(null);

    const res = await app.request(
      "/api/admin/v1/cards/printing-images/00000000-0000-4000-a000-000000000099/unrehost",
      {
        method: "POST",
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when image is not rehosted", async () => {
    mockPrintingImages.getIdAndUrls.mockResolvedValue({
      rehostedUrl: null,
      originalUrl: "https://example.com/img.png",
    });

    const res = await app.request(`/api/admin/v1/cards/printing-images/${IMAGE_ID}/unrehost`, {
      method: "POST",
    });
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.message).toContain("not rehosted");
  });

  it("returns 400 when image has no original URL to fall back to", async () => {
    mockPrintingImages.getIdAndUrls.mockResolvedValue({
      rehostedUrl: "/cards/origin/img-1.avif",
      originalUrl: null,
    });

    const res = await app.request(`/api/admin/v1/cards/printing-images/${IMAGE_ID}/unrehost`, {
      method: "POST",
    });
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.message).toContain("no original URL");
  });
});

describe("POST /printing-images/:imageId/rehost", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with rehosted url on success", async () => {
    mockPrintingImages.getForRehost.mockResolvedValue({
      originalUrl: "https://example.com/img.png",
      imageFileId: "00594247-a18a-4efd-8998-105449a4c1ab",
      rotation: 0,
      needsTrim: false,
    });
    mockDownloadImage.mockResolvedValue({ buffer: Buffer.from("image"), ext: ".png" });
    mockProcessAndSave.mockResolvedValue(undefined);
    mockImageRehostedUrl.mockReturnValue("/media/cards/ab/00594247-a18a-4efd-8998-105449a4c1ab");
    mockPrintingImages.updateRehostedUrl.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/printing-images/${IMAGE_ID}/rehost`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ rehostedUrl: "/media/cards/ab/00594247-a18a-4efd-8998-105449a4c1ab" });
    expect(mockDownloadImage).toHaveBeenCalledWith(mockIo, "https://example.com/img.png");
    expect(mockProcessAndSave).toHaveBeenCalledWith(
      mockIo,
      expect.any(Buffer),
      ".png",
      "/mock/media/cards/ab",
      "00594247-a18a-4efd-8998-105449a4c1ab",
      0,
      false,
      // allowOverwrite=true: the background auto-rehost already wrote these files on accept.
      true,
    );
    expect(mockPrintingImages.updateRehostedUrl).toHaveBeenCalledWith(
      "00594247-a18a-4efd-8998-105449a4c1ab",
      "/media/cards/ab/00594247-a18a-4efd-8998-105449a4c1ab",
    );
  });

  it("passes allowOverwrite=true so re-hosting already-rehosted images succeeds", async () => {
    mockPrintingImages.getForRehost.mockResolvedValue({
      originalUrl: "https://example.com/img.png",
      imageFileId: "00594247-a18a-4efd-8998-105449a4c1ab",
      rotation: 0,
      needsTrim: false,
    });
    mockDownloadImage.mockResolvedValue({ buffer: Buffer.from("image"), ext: ".png" });
    mockProcessAndSave.mockResolvedValue(undefined);
    mockImageRehostedUrl.mockReturnValue("/media/cards/ab/00594247-a18a-4efd-8998-105449a4c1ab");
    mockPrintingImages.updateRehostedUrl.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/printing-images/${IMAGE_ID}/rehost`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const allowOverwrite = mockProcessAndSave.mock.calls[0]?.at(-1);
    expect(allowOverwrite).toBe(true);
  });

  it("returns 404 when image not found", async () => {
    mockPrintingImages.getForRehost.mockResolvedValue(null);

    const res = await app.request(
      "/api/admin/v1/cards/printing-images/00000000-0000-4000-a000-000000000099/rehost",
      {
        method: "POST",
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when image has no original URL", async () => {
    mockPrintingImages.getForRehost.mockResolvedValue({ originalUrl: null, imageFileId: "ci-1" });

    const res = await app.request(`/api/admin/v1/cards/printing-images/${IMAGE_ID}/rehost`, {
      method: "POST",
    });
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.message).toContain("no original URL");
  });
});

describe("POST /printing-images/:imageId/rotate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets the rotation and regenerates variants", async () => {
    mockPrintingImages.getForRehost.mockResolvedValue({
      imageFileId: "ci-1",
      rotation: 0,
      needsTrim: true,
      originalUrl: "https://example.com/img.png",
    });

    const res = await app.request(`/api/admin/v1/cards/printing-images/${IMAGE_ID}/rotate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotation: 90 }),
    });
    expect(res.status).toBe(204);
    expect(mockPrintingImages.setRotation).toHaveBeenCalledWith("ci-1", 90);
    expect(mockRegenerateFromOrig).toHaveBeenCalledWith(
      mockIo,
      "ci-1",
      90,
      true,
      "https://example.com/img.png",
    );
  });

  it("returns 404 when image not found", async () => {
    mockPrintingImages.getForRehost.mockResolvedValue(null);

    const res = await app.request(
      "/api/admin/v1/cards/printing-images/00000000-0000-4000-a000-000000000099/rotate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotation: 180 }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("rejects an invalid rotation value", async () => {
    const res = await app.request(`/api/admin/v1/cards/printing-images/${IMAGE_ID}/rotate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotation: 45 }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /printing-images/:imageId/set-needs-trim", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets needs-trim and regenerates variants", async () => {
    mockPrintingImages.getForRehost.mockResolvedValue({
      imageFileId: "ci-1",
      rotation: 90,
      needsTrim: false,
      originalUrl: "https://example.com/img.png",
    });

    const res = await app.request(
      `/api/admin/v1/cards/printing-images/${IMAGE_ID}/set-needs-trim`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needsTrim: true }),
      },
    );
    expect(res.status).toBe(204);
    expect(mockPrintingImages.setNeedsTrim).toHaveBeenCalledWith("ci-1", true);
    expect(mockRegenerateFromOrig).toHaveBeenCalledWith(
      mockIo,
      "ci-1",
      90,
      true,
      "https://example.com/img.png",
    );
  });

  it("returns 404 when image not found", async () => {
    mockPrintingImages.getForRehost.mockResolvedValue(null);

    const res = await app.request(
      "/api/admin/v1/cards/printing-images/00000000-0000-4000-a000-000000000099/set-needs-trim",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needsTrim: true }),
      },
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /printing/:printingId/add-image-url", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTransact.mockImplementation(async (cb) => cb({ printingImages: mockTrxPrintingImages }));
  });

  it("inserts with default mode", async () => {
    mockPrintingImages.getPrintingById.mockResolvedValue({ id: "printing-1" });

    const res = await app.request(`/api/admin/v1/cards/printing/${PRINTING_ID}/add-image-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://i.imgur.com/img.png" }),
    });
    expect(res.status).toBe(204);
    expect(mockTrxPrintingImages.insertImage).toHaveBeenCalledWith(
      "printing-1",
      "https://i.imgur.com/img.png",
      "main",
    );
  });

  it("respects explicit mode", async () => {
    mockPrintingImages.getPrintingById.mockResolvedValue({ id: "printing-1" });

    const res = await app.request(`/api/admin/v1/cards/printing/${PRINTING_ID}/add-image-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://images.tcgplayer.com/img.png", mode: "additional" }),
    });
    expect(res.status).toBe(204);
    expect(mockTrxPrintingImages.insertImage).toHaveBeenCalledWith(
      "printing-1",
      "https://images.tcgplayer.com/img.png",
      "additional",
    );
  });

  it("returns 400 when url is empty", async () => {
    const res = await app.request(`/api/admin/v1/cards/printing/${PRINTING_ID}/add-image-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "  " }),
    });
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.message).toContain("url is required");
  });

  it("returns 404 when printing not found", async () => {
    mockPrintingImages.getPrintingById.mockResolvedValue(null);

    const res = await app.request(
      "/api/admin/v1/cards/printing/00000000-0000-4000-a000-000000000099/add-image-url",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/img.png" }),
      },
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /printing/:printingId/upload-image", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTransact.mockImplementation(async (cb) => cb({ printingImages: mockTrxPrintingImages }));
  });

  it("returns 200 with rehosted url on success", async () => {
    mockPrintingImages.getPrintingById.mockResolvedValue({ id: "printing-1" });
    mockProcessAndSave.mockResolvedValue(undefined);
    mockImageRehostedUrl.mockReturnValue("/media/cards/v7/mock-uuid-v7");
    mockTrxPrintingImages.insertUploadedImage.mockResolvedValue(undefined);

    const formData = new FormData();
    formData.append("file", new File(["image-data"], "card.png", { type: "image/png" }));

    const res = await app.request(`/api/admin/v1/cards/printing/${PRINTING_ID}/upload-image`, {
      method: "POST",
      body: formData,
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ rehostedUrl: "/media/cards/v7/mock-uuid-v7" });
    expect(mockTrxPrintingImages.insertUploadedImage).toHaveBeenCalledWith({
      id: "mock-uuid-v7",
      printingId: "printing-1",
      rehostedUrl: "/media/cards/v7/mock-uuid-v7",
      mode: "main",
    });
  });

  it("respects explicit mode", async () => {
    mockPrintingImages.getPrintingById.mockResolvedValue({ id: "printing-1" });
    mockProcessAndSave.mockResolvedValue(undefined);
    mockImageRehostedUrl.mockReturnValue("/media/cards/v7/mock-uuid-v7");
    mockTrxPrintingImages.insertUploadedImage.mockResolvedValue(undefined);

    const formData = new FormData();
    formData.append("file", new File(["image-data"], "card.jpg", { type: "image/jpeg" }));
    formData.append("mode", "additional");

    const res = await app.request(`/api/admin/v1/cards/printing/${PRINTING_ID}/upload-image`, {
      method: "POST",
      body: formData,
    });
    expect(res.status).toBe(200);
    expect(mockTrxPrintingImages.insertUploadedImage).toHaveBeenCalledWith({
      id: "mock-uuid-v7",
      printingId: "printing-1",
      rehostedUrl: "/media/cards/v7/mock-uuid-v7",
      mode: "additional",
    });
  });

  it("returns 404 when printing not found", async () => {
    mockPrintingImages.getPrintingById.mockResolvedValue(null);

    const formData = new FormData();
    formData.append("file", new File(["data"], "card.png", { type: "image/png" }));

    const res = await app.request(
      "/api/admin/v1/cards/printing/00000000-0000-4000-a000-000000000099/upload-image",
      {
        method: "POST",
        body: formData,
      },
    );
    expect(res.status).toBe(404);
  });
});

describe("audit events", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTransact.mockImplementation(async (cb) => cb({ printingImages: mockTrxPrintingImages }));
  });

  it("set-image records the candidate source and mode", async () => {
    mockPrintingImages.getCandidatePrintingById.mockResolvedValue({
      printingId: "printing-1",
      imageUrl: "https://example.com/img.png",
      candidateCardId: "cc-1",
      shortCode: "OGN-001",
    });
    mockTrxPrintingImages.insertImage.mockResolvedValue("image-id-1");
    mockRehostSingleImage.mockResolvedValue(undefined);

    const res = await app.request(SET_IMAGE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "main" }),
    });
    expect(res.status).toBe(204);
    expect(mockAdminEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "image.set-from-candidate",
        entityType: "image",
        entityId: "image-id-1",
        newValues: expect.objectContaining({
          printingId: "printing-1",
          imageUrl: "https://example.com/img.png",
          mode: "main",
        }),
      }),
    );
  });
});

const FALLBACK_ART = `/api/admin/v1/cards/printing/${PRINTING_ID}/fallback-art`;
const IMAGE_FILE_ID = "00000000-0000-4000-a000-000000000004";

function mockPrintingWithAutoFallback(): void {
  mockPrintingImages.getFallbackArt.mockResolvedValue({
    id: "printing-1",
    shortCode: "OGN-001",
    fallbackArtMode: "auto",
    fallbackImageFileId: null,
  });
}

describe("POST /printing/:printingId/fallback-art", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTransact.mockImplementation(async (cb) => cb({ printingImages: mockTrxPrintingImages }));
    mockPrintingWithAutoFallback();
  });

  it("pins an image file", async () => {
    mockPrintingImages.getImageFileForRehost.mockResolvedValue({ id: IMAGE_FILE_ID });

    const res = await app.request(FALLBACK_ART, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "pinned", imageFileId: IMAGE_FILE_ID }),
    });

    expect(res.status).toBe(204);
    expect(mockPrintingImages.setFallbackArt).toHaveBeenCalledWith(
      PRINTING_ID,
      "pinned",
      IMAGE_FILE_ID,
    );
  });

  it("clears the pin when switching back to auto", async () => {
    const res = await app.request(FALLBACK_ART, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "auto" }),
    });

    expect(res.status).toBe(204);
    expect(mockPrintingImages.setFallbackArt).toHaveBeenCalledWith(PRINTING_ID, "auto", null);
  });

  it("suppresses the substitute in none mode", async () => {
    const res = await app.request(FALLBACK_ART, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "none" }),
    });

    expect(res.status).toBe(204);
    expect(mockPrintingImages.setFallbackArt).toHaveBeenCalledWith(PRINTING_ID, "none", null);
  });

  it("returns 400 when pinning without an image file", async () => {
    const res = await app.request(FALLBACK_ART, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "pinned" }),
    });

    expect(res.status).toBe(400);
    expect(mockPrintingImages.setFallbackArt).not.toHaveBeenCalled();
  });

  it("returns 400 when a non-pinned mode carries an image file", async () => {
    const res = await app.request(FALLBACK_ART, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "auto", imageFileId: IMAGE_FILE_ID }),
    });

    expect(res.status).toBe(400);
    expect(mockPrintingImages.setFallbackArt).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown image file", async () => {
    mockPrintingImages.getImageFileForRehost.mockResolvedValue(undefined);

    const res = await app.request(FALLBACK_ART, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "pinned", imageFileId: IMAGE_FILE_ID }),
    });

    expect(res.status).toBe(404);
    expect(mockPrintingImages.setFallbackArt).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown printing", async () => {
    mockPrintingImages.getFallbackArt.mockResolvedValue(undefined);

    const res = await app.request(FALLBACK_ART, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "auto" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("POST /printing/:printingId/fallback-art/from-url", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTransact.mockImplementation(async (cb) => cb({ printingImages: mockTrxPrintingImages }));
    mockPrintingWithAutoFallback();
  });

  it("ingests the URL, pins it, and rehosts the file", async () => {
    mockPrintingImages.imageFileForUrl.mockResolvedValue(IMAGE_FILE_ID);
    mockRehostImageFile.mockResolvedValue(undefined);

    const res = await app.request(`${FALLBACK_ART}/from-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "  https://example.com/art.png  " }),
    });

    expect(res.status).toBe(204);
    expect(mockPrintingImages.imageFileForUrl).toHaveBeenCalledWith("https://example.com/art.png");
    expect(mockPrintingImages.setFallbackArt).toHaveBeenCalledWith(
      PRINTING_ID,
      "pinned",
      IMAGE_FILE_ID,
    );
    expect(mockRehostImageFile).toHaveBeenCalledWith(mockIo, mockPrintingImages, IMAGE_FILE_ID);
  });

  it("returns 400 when the url is blank", async () => {
    const res = await app.request(`${FALLBACK_ART}/from-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "   " }),
    });

    expect(res.status).toBe(400);
    expect(mockPrintingImages.setFallbackArt).not.toHaveBeenCalled();
  });
});

describe("POST /printing/:printingId/fallback-art/upload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTransact.mockImplementation(async (cb) => cb({ printingImages: mockTrxPrintingImages }));
    mockPrintingWithAutoFallback();
  });

  it("stores the file without attaching it as a printing image", async () => {
    mockProcessAndSave.mockResolvedValue(undefined);
    mockImageRehostedUrl.mockReturnValue("/media/cards/v7/mock-uuid-v7");

    const formData = new FormData();
    formData.append("file", new File(["art-data"], "art.png", { type: "image/png" }));

    const res = await app.request(`${FALLBACK_ART}/upload`, { method: "POST", body: formData });

    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ rehostedUrl: "/media/cards/v7/mock-uuid-v7" });
    expect(mockTrxPrintingImages.insertUnattachedImageFile).toHaveBeenCalledWith({
      id: "mock-uuid-v7",
      rehostedUrl: "/media/cards/v7/mock-uuid-v7",
    });
    expect(mockTrxPrintingImages.insertUploadedImage).not.toHaveBeenCalled();
    expect(mockTrxPrintingImages.setFallbackArt).toHaveBeenCalledWith(
      PRINTING_ID,
      "pinned",
      "mock-uuid-v7",
    );
  });
});
