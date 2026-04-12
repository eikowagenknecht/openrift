import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../../errors.js";
import {
  deleteRehostFiles,
  downloadImage,
  imageRehostedUrl,
  processAndSave,
  rehostSingleImage,
} from "../../../services/image-rehost.js";
import { imagesRoute } from "./images";

// ---------------------------------------------------------------------------
// Mock service modules — vitest hoists vi.mock() automatically
// ---------------------------------------------------------------------------

vi.mock("../../../services/image-rehost.js", () => ({
  CARD_MEDIA_DIR: "/mock/media/cards",
  rehostSingleImage: vi.fn(),
  deleteRehostFiles: vi.fn(),
  downloadImage: vi.fn(),
  processAndSave: vi.fn(),
  imageRehostedUrl: vi.fn(),
}));

vi.mock("uuid", () => ({
  v7: vi.fn(() => "mock-uuid-v7"),
}));

const mockRehostSingleImage = vi.mocked(rehostSingleImage);
const mockDeleteRehostFiles = vi.mocked(deleteRehostFiles);
const mockDownloadImage = vi.mocked(downloadImage);
const mockProcessAndSave = vi.mocked(processAndSave);
const mockImageRehostedUrl = vi.mocked(imageRehostedUrl);

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockPrintingImages = {
  getCandidatePrintingById: vi.fn(),
  getCandidateCardProvider: vi.fn(),
  getIdAndRehostedUrl: vi.fn(),
  getImageFileId: vi.fn(),
  countOthersByImageFileId: vi.fn(),
  deleteById: vi.fn(),
  deleteOrphanedImageFiles: vi.fn(),
  getForActivate: vi.fn(),
  getIdAndUrls: vi.fn(),
  updateRehostedUrl: vi.fn(),
  getForRehost: vi.fn(),
  getPrintingById: vi.fn(),
};

const mockTrxPrintingImages = {
  insertImage: vi.fn(),
  deactivateActiveFront: vi.fn(),
  setActive: vi.fn(),
  insertUploadedImage: vi.fn(),
};

const mockTransact = vi.fn(
  async (callback: (repos: { printingImages: typeof mockTrxPrintingImages }) => Promise<unknown>) =>
    callback({ printingImages: mockTrxPrintingImages }),
);

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const mockIo = { fetch: vi.fn() };

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("io", mockIo as never);
    c.set("transact", mockTransact as never);
    c.set("repos", { printingImages: mockPrintingImages } as never);
    await next();
  })
  .route("/api/v1", imagesRoute)
  .onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/v1/candidate-printings/:id/set-image", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and rehosts image on success", async () => {
    mockPrintingImages.getCandidatePrintingById.mockResolvedValue({
      printingId: "printing-1",
      imageUrl: "https://example.com/img.png",
      candidateCardId: "cc-1",
    });
    mockPrintingImages.getCandidateCardProvider.mockResolvedValue({ provider: "tcgplayer" });
    mockTrxPrintingImages.insertImage.mockResolvedValue("image-id-1");
    mockRehostSingleImage.mockResolvedValue(undefined);

    const res = await app.request(
      "/api/v1/candidate-printings/00000000-0000-4000-a000-000000000001/set-image",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "main" }),
      },
    );
    expect(res.status).toBe(204);
    expect(mockTrxPrintingImages.insertImage).toHaveBeenCalledWith(
      "printing-1",
      "https://example.com/img.png",
      "tcgplayer",
      "main",
    );
    expect(mockRehostSingleImage).toHaveBeenCalledWith(mockIo, mockPrintingImages, "image-id-1");
  });

  it("uses 'import' provider when candidate card has no provider", async () => {
    mockPrintingImages.getCandidatePrintingById.mockResolvedValue({
      printingId: "printing-1",
      imageUrl: "https://example.com/img.png",
      candidateCardId: "cc-1",
    });
    mockPrintingImages.getCandidateCardProvider.mockResolvedValue(null);
    mockTrxPrintingImages.insertImage.mockResolvedValue("image-id-1");
    mockRehostSingleImage.mockResolvedValue(undefined);

    const res = await app.request(
      "/api/v1/candidate-printings/00000000-0000-4000-a000-000000000001/set-image",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "additional" }),
      },
    );
    expect(res.status).toBe(204);
    expect(mockTrxPrintingImages.insertImage).toHaveBeenCalledWith(
      "printing-1",
      "https://example.com/img.png",
      "import",
      "additional",
    );
  });

  it("skips rehost when insertImage returns null", async () => {
    mockPrintingImages.getCandidatePrintingById.mockResolvedValue({
      printingId: "printing-1",
      imageUrl: "https://example.com/img.png",
      candidateCardId: "cc-1",
    });
    mockPrintingImages.getCandidateCardProvider.mockResolvedValue({ provider: "tcgplayer" });
    mockTrxPrintingImages.insertImage.mockResolvedValue(null);

    const res = await app.request(
      "/api/v1/candidate-printings/00000000-0000-4000-a000-000000000001/set-image",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "main" }),
      },
    );
    expect(res.status).toBe(204);
    expect(mockRehostSingleImage).not.toHaveBeenCalled();
  });

  it("returns 404 when candidate printing not found", async () => {
    mockPrintingImages.getCandidatePrintingById.mockResolvedValue(null);

    const res = await app.request(
      "/api/v1/candidate-printings/00000000-0000-4000-a000-000000000099/set-image",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "main" }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when candidate printing has no printingId", async () => {
    mockPrintingImages.getCandidatePrintingById.mockResolvedValue({
      printingId: null,
      imageUrl: "https://example.com/img.png",
      candidateCardId: "cc-1",
    });

    const res = await app.request(
      "/api/v1/candidate-printings/00000000-0000-4000-a000-000000000001/set-image",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "main" }),
      },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("not linked");
  });

  it("returns 400 when candidate printing has no imageUrl", async () => {
    mockPrintingImages.getCandidatePrintingById.mockResolvedValue({
      printingId: "printing-1",
      imageUrl: null,
      candidateCardId: "cc-1",
    });

    const res = await app.request(
      "/api/v1/candidate-printings/00000000-0000-4000-a000-000000000001/set-image",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "main" }),
      },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("no image URL");
  });
});

describe("DELETE /api/v1/printing-images/:imageId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and deletes rehost files when no others share them", async () => {
    mockPrintingImages.getIdAndRehostedUrl.mockResolvedValue({
      rehostedUrl: "/cards/origin/img-1.avif",
    });
    mockPrintingImages.getImageFileId.mockResolvedValue("ci-1");
    mockPrintingImages.countOthersByImageFileId.mockResolvedValue(0);
    mockPrintingImages.deleteById.mockResolvedValue(undefined);
    mockPrintingImages.deleteOrphanedImageFiles.mockResolvedValue(0);
    mockDeleteRehostFiles.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/printing-images/00000000-0000-4000-a000-000000000002", {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockPrintingImages.deleteById).toHaveBeenCalledWith(
      "00000000-0000-4000-a000-000000000002",
    );
    expect(mockDeleteRehostFiles).toHaveBeenCalledWith(mockIo, "/cards/origin/img-1.avif");
  });

  it("skips file deletion when other images share image_file", async () => {
    mockPrintingImages.getIdAndRehostedUrl.mockResolvedValue({
      rehostedUrl: "/cards/origin/img-1.avif",
    });
    mockPrintingImages.getImageFileId.mockResolvedValue("ci-1");
    mockPrintingImages.countOthersByImageFileId.mockResolvedValue(2);
    mockPrintingImages.deleteById.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/printing-images/00000000-0000-4000-a000-000000000002", {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockDeleteRehostFiles).not.toHaveBeenCalled();
  });

  it("skips file deletion when image has no rehostedUrl", async () => {
    mockPrintingImages.getIdAndRehostedUrl.mockResolvedValue({
      rehostedUrl: null,
    });
    mockPrintingImages.getImageFileId.mockResolvedValue(null);
    mockPrintingImages.deleteById.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/printing-images/00000000-0000-4000-a000-000000000002", {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockDeleteRehostFiles).not.toHaveBeenCalled();
  });

  it("returns 404 when image not found", async () => {
    mockPrintingImages.getIdAndRehostedUrl.mockResolvedValue(null);

    const res = await app.request("/api/v1/printing-images/00000000-0000-4000-a000-000000000099", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/printing-images/:imageId/activate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and deactivates current active when activating", async () => {
    mockPrintingImages.getForActivate.mockResolvedValue({
      printingId: "printing-1",
    });

    const res = await app.request(
      "/api/v1/printing-images/00000000-0000-4000-a000-000000000002/activate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      },
    );
    expect(res.status).toBe(204);
    expect(mockTrxPrintingImages.deactivateActiveFront).toHaveBeenCalledWith("printing-1");
    expect(mockTrxPrintingImages.setActive).toHaveBeenCalledWith(
      "00000000-0000-4000-a000-000000000002",
      true,
    );
  });

  it("returns 204 without deactivating when setting inactive", async () => {
    mockPrintingImages.getForActivate.mockResolvedValue({
      printingId: "printing-1",
    });

    const res = await app.request(
      "/api/v1/printing-images/00000000-0000-4000-a000-000000000002/activate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      },
    );
    expect(res.status).toBe(204);
    expect(mockTrxPrintingImages.deactivateActiveFront).not.toHaveBeenCalled();
    expect(mockTrxPrintingImages.setActive).toHaveBeenCalledWith(
      "00000000-0000-4000-a000-000000000002",
      false,
    );
  });

  it("returns 404 when image not found", async () => {
    mockPrintingImages.getForActivate.mockResolvedValue(null);

    const res = await app.request(
      "/api/v1/printing-images/00000000-0000-4000-a000-000000000099/activate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      },
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/printing-images/:imageId/unrehost", () => {
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

    const res = await app.request(
      "/api/v1/printing-images/00000000-0000-4000-a000-000000000002/unrehost",
      { method: "POST" },
    );
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

    const res = await app.request(
      "/api/v1/printing-images/00000000-0000-4000-a000-000000000002/unrehost",
      { method: "POST" },
    );
    expect(res.status).toBe(204);
    expect(mockDeleteRehostFiles).not.toHaveBeenCalled();
    expect(mockPrintingImages.updateRehostedUrl).toHaveBeenCalledWith("ci-1", null);
  });

  it("returns 404 when image not found", async () => {
    mockPrintingImages.getIdAndUrls.mockResolvedValue(null);

    const res = await app.request(
      "/api/v1/printing-images/00000000-0000-4000-a000-000000000099/unrehost",
      { method: "POST" },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when image is not rehosted", async () => {
    mockPrintingImages.getIdAndUrls.mockResolvedValue({
      rehostedUrl: null,
      originalUrl: "https://example.com/img.png",
    });

    const res = await app.request(
      "/api/v1/printing-images/00000000-0000-4000-a000-000000000002/unrehost",
      { method: "POST" },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("not rehosted");
  });

  it("returns 400 when image has no original URL to fall back to", async () => {
    mockPrintingImages.getIdAndUrls.mockResolvedValue({
      rehostedUrl: "/cards/origin/img-1.avif",
      originalUrl: null,
    });

    const res = await app.request(
      "/api/v1/printing-images/00000000-0000-4000-a000-000000000002/unrehost",
      { method: "POST" },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("no original URL");
  });
});

describe("POST /api/v1/printing-images/:imageId/rehost", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with rehosted url on success", async () => {
    mockPrintingImages.getForRehost.mockResolvedValue({
      originalUrl: "https://example.com/img.png",
      imageFileId: "00594247-a18a-4efd-8998-105449a4c1ab",
      rotation: 0,
    });
    mockDownloadImage.mockResolvedValue({ buffer: Buffer.from("image"), ext: ".png" });
    mockProcessAndSave.mockResolvedValue(undefined);
    mockImageRehostedUrl.mockReturnValue("/media/cards/ab/00594247-a18a-4efd-8998-105449a4c1ab");
    mockPrintingImages.updateRehostedUrl.mockResolvedValue(undefined);

    const res = await app.request(
      "/api/v1/printing-images/00000000-0000-4000-a000-000000000002/rehost",
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      rehostedUrl: "/media/cards/ab/00594247-a18a-4efd-8998-105449a4c1ab",
    });
    expect(mockDownloadImage).toHaveBeenCalledWith(mockIo, "https://example.com/img.png");
    expect(mockProcessAndSave).toHaveBeenCalledWith(
      mockIo,
      expect.any(Buffer),
      ".png",
      "/mock/media/cards/ab",
      "00594247-a18a-4efd-8998-105449a4c1ab",
      0,
    );
    expect(mockPrintingImages.updateRehostedUrl).toHaveBeenCalledWith(
      "00594247-a18a-4efd-8998-105449a4c1ab",
      "/media/cards/ab/00594247-a18a-4efd-8998-105449a4c1ab",
    );
  });

  it("returns 404 when image not found", async () => {
    mockPrintingImages.getForRehost.mockResolvedValue(null);

    const res = await app.request(
      "/api/v1/printing-images/00000000-0000-4000-a000-000000000099/rehost",
      { method: "POST" },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when image has no original URL", async () => {
    mockPrintingImages.getForRehost.mockResolvedValue({
      originalUrl: null,
      imageFileId: "ci-1",
    });

    const res = await app.request(
      "/api/v1/printing-images/00000000-0000-4000-a000-000000000002/rehost",
      { method: "POST" },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("no original URL");
  });
});

describe("POST /api/v1/printing/:printingId/add-image-url", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 with default mode and provider", async () => {
    mockPrintingImages.getPrintingById.mockResolvedValue({ id: "printing-1" });

    const res = await app.request(
      "/api/v1/printing/00000000-0000-4000-a000-000000000003/add-image-url",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/img.png" }),
      },
    );
    expect(res.status).toBe(204);
    expect(mockTrxPrintingImages.insertImage).toHaveBeenCalledWith(
      "printing-1",
      "https://example.com/img.png",
      "manual",
      "main",
    );
  });

  it("uses explicit mode and provider when provided", async () => {
    mockPrintingImages.getPrintingById.mockResolvedValue({ id: "printing-1" });

    const res = await app.request(
      "/api/v1/printing/00000000-0000-4000-a000-000000000003/add-image-url",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com/img.png",
          mode: "additional",
          provider: "tcgplayer",
        }),
      },
    );
    expect(res.status).toBe(204);
    expect(mockTrxPrintingImages.insertImage).toHaveBeenCalledWith(
      "printing-1",
      "https://example.com/img.png",
      "tcgplayer",
      "additional",
    );
  });

  it("returns 400 when url is empty", async () => {
    const res = await app.request(
      "/api/v1/printing/00000000-0000-4000-a000-000000000003/add-image-url",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "  " }),
      },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("url is required");
  });

  it("returns 404 when printing not found", async () => {
    mockPrintingImages.getPrintingById.mockResolvedValue(null);

    const res = await app.request(
      "/api/v1/printing/00000000-0000-4000-a000-000000000099/add-image-url",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/img.png" }),
      },
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/printing/:printingId/upload-image", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with rehosted url on success", async () => {
    mockPrintingImages.getPrintingById.mockResolvedValue({
      id: "printing-1",
    });
    mockProcessAndSave.mockResolvedValue(undefined);
    mockImageRehostedUrl.mockReturnValue("/media/cards/v7/mock-uuid-v7");

    const formData = new FormData();
    formData.append("file", new File(["image-data"], "card.png", { type: "image/png" }));

    const res = await app.request(
      "/api/v1/printing/00000000-0000-4000-a000-000000000003/upload-image",
      {
        method: "POST",
        body: formData,
      },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ rehostedUrl: "/media/cards/v7/mock-uuid-v7" });
    expect(mockTrxPrintingImages.insertUploadedImage).toHaveBeenCalledWith({
      id: "mock-uuid-v7",
      printingId: "printing-1",
      provider: "upload",
      rehostedUrl: "/media/cards/v7/mock-uuid-v7",
      mode: "main",
    });
  });

  it("uses provided mode and provider", async () => {
    mockPrintingImages.getPrintingById.mockResolvedValue({
      id: "printing-1",
    });
    mockProcessAndSave.mockResolvedValue(undefined);
    mockImageRehostedUrl.mockReturnValue("/media/cards/v7/mock-uuid-v7");

    const formData = new FormData();
    formData.append("file", new File(["image-data"], "card.jpg", { type: "image/jpeg" }));
    formData.append("mode", "additional");
    formData.append("provider", "custom-source");

    const res = await app.request(
      "/api/v1/printing/00000000-0000-4000-a000-000000000003/upload-image",
      {
        method: "POST",
        body: formData,
      },
    );
    expect(res.status).toBe(200);
    expect(mockTrxPrintingImages.insertUploadedImage).toHaveBeenCalledWith({
      id: "mock-uuid-v7",
      printingId: "printing-1",
      provider: "custom-source",
      rehostedUrl: "/media/cards/v7/mock-uuid-v7",
      mode: "additional",
    });
  });

  it("returns 404 when printing not found", async () => {
    mockPrintingImages.getPrintingById.mockResolvedValue(null);

    const formData = new FormData();
    formData.append("file", new File(["data"], "card.png", { type: "image/png" }));

    const res = await app.request(
      "/api/v1/printing/00000000-0000-4000-a000-000000000099/upload-image",
      {
        method: "POST",
        body: formData,
      },
    );
    expect(res.status).toBe(404);
  });
});
