import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import type { Variables } from "../../../types.js";
import { adminPrintingDeskRouter } from "./admin-printing-desk";

const mockPrintingDesk = {
  getImageCredit: vi.fn(),
  updateImageCredit: vi.fn(),
  isDeskPrinting: vi.fn(),
  nonDeskPrintingIdsForImageFile: vi.fn(),
};
const mockPrintingImages = { getForActivate: vi.fn(), setFace: vi.fn() };
const mockCatalog = { refreshCatalogViews: vi.fn() };
const mockAdminEvents = { insert: vi.fn(), wasPrintingCreatedBy: vi.fn() };

const FULL_ADMIN = { isAdmin: true, sections: [] };
const GRANT_HOLDER = { isAdmin: false, sections: ["printing-desk"] };
let adminAccess: typeof FULL_ADMIN | typeof GRANT_HOLDER = FULL_ADMIN;

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const IMAGE_FILE_ID = "b0000000-0001-4000-a000-000000000001";
const PRINTING_IMAGE_ID = "c0000000-0001-4000-a000-000000000001";
const UNKNOWN_ID = "b0000000-0001-4000-a000-000000000099";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("adminAccess", adminAccess as never);
  c.set("repos", {
    adminEvents: mockAdminEvents,
    printingDesk: mockPrintingDesk,
    printingImages: mockPrintingImages,
    catalog: mockCatalog,
  } as never);
  await next();
});
registerRouterForTest(app, adminPrintingDeskRouter);

function patchImage(body: unknown, imageFileId = IMAGE_FILE_ID) {
  return app.request(`/api/admin/v1/printing-desk/images/${imageFileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchFace(body: unknown, printingImageId = PRINTING_IMAGE_ID) {
  return app.request(`/api/admin/v1/printing-desk/printing-images/${printingImageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  adminAccess = FULL_ADMIN;
  mockPrintingDesk.getImageCredit.mockResolvedValue({ credit: "gamesnight" });
  mockPrintingImages.getForActivate.mockResolvedValue({
    id: PRINTING_IMAGE_ID,
    printingId: "d0000000-0001-4000-a000-000000000001",
    face: "front",
  });
});

describe("PATCH /printing-desk/images/:imageFileId", () => {
  it("writes the credit", async () => {
    const res = await patchImage({ credit: "gamesnight" });

    expect(res.status).toBe(204);
    expect(mockPrintingDesk.updateImageCredit).toHaveBeenCalledWith(IMAGE_FILE_ID, {
      credit: "gamesnight",
    });
  });

  it("leaves an omitted credit alone", async () => {
    const res = await patchImage({});

    expect(res.status).toBe(204);
    expect(mockPrintingDesk.updateImageCredit).toHaveBeenCalledWith(IMAGE_FILE_ID, {});
  });

  it("clears a credit sent as null", async () => {
    const res = await patchImage({ credit: null });

    expect(res.status).toBe(204);
    expect(mockPrintingDesk.updateImageCredit).toHaveBeenCalledWith(IMAGE_FILE_ID, {
      credit: null,
    });
  });

  it("rejects an unknown field", async () => {
    const res = await patchImage({ creditUrl: "https://example.test/post/1" });

    expect(res.status).toBe(400);
    expect(mockPrintingDesk.updateImageCredit).not.toHaveBeenCalled();
  });

  it("404s on an unknown image file", async () => {
    mockPrintingDesk.getImageCredit.mockResolvedValue(undefined);

    const res = await patchImage({ credit: "gamesnight" }, UNKNOWN_ID);

    expect(res.status).toBe(404);
    expect(mockPrintingDesk.updateImageCredit).not.toHaveBeenCalled();
  });

  it("records the old and new credit as an admin event", async () => {
    await patchImage({ credit: "someone else" });

    expect(mockAdminEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "image.credit",
        entityType: "image",
        entityId: IMAGE_FILE_ID,
        oldValues: { credit: "gamesnight" },
        newValues: { credit: "someone else" },
      }),
    );
  });
});

describe("PATCH /printing-desk/printing-images/:printingImageId", () => {
  it("moves the image to the other side", async () => {
    const res = await patchFace({ face: "back" });

    expect(res.status).toBe(204);
    expect(mockPrintingImages.setFace).toHaveBeenCalledWith(PRINTING_IMAGE_ID, "back");
    expect(mockCatalog.refreshCatalogViews).toHaveBeenCalled();
  });

  it("records the old and new side as an admin event", async () => {
    await patchFace({ face: "back" });

    expect(mockAdminEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "image.face",
        entityType: "image",
        entityId: PRINTING_IMAGE_ID,
        oldValues: { face: "front" },
        newValues: { face: "back" },
      }),
    );
  });

  it("does nothing when the side is unchanged", async () => {
    const res = await patchFace({ face: "front" });

    expect(res.status).toBe(204);
    expect(mockPrintingImages.setFace).not.toHaveBeenCalled();
    expect(mockAdminEvents.insert).not.toHaveBeenCalled();
    expect(mockCatalog.refreshCatalogViews).not.toHaveBeenCalled();
  });

  it("404s on an unknown printing image", async () => {
    mockPrintingImages.getForActivate.mockResolvedValue(undefined);

    const res = await patchFace({ face: "back" }, UNKNOWN_ID);

    expect(res.status).toBe(404);
    expect(mockPrintingImages.setFace).not.toHaveBeenCalled();
  });
});

describe("grant holder scope", () => {
  beforeEach(() => {
    adminAccess = GRANT_HOLDER;
    mockAdminEvents.wasPrintingCreatedBy.mockResolvedValue(false);
  });

  it("403s a credit edit on a file shared with a printing outside the desk", async () => {
    mockPrintingDesk.nonDeskPrintingIdsForImageFile.mockResolvedValue(["p-1"]);

    const res = await patchImage({ credit: "Nope" });

    expect(res.status).toBe(403);
    expect(mockPrintingDesk.updateImageCredit).not.toHaveBeenCalled();
  });

  it("lets them credit a file that only desk printings use", async () => {
    mockPrintingDesk.nonDeskPrintingIdsForImageFile.mockResolvedValue([]);

    const res = await patchImage({ credit: "gamesnight" });

    expect(res.status).toBe(204);
    expect(mockPrintingDesk.updateImageCredit).toHaveBeenCalled();
  });

  it("403s moving an image to the other side on a printing outside the desk", async () => {
    mockPrintingDesk.isDeskPrinting.mockResolvedValue(false);

    const res = await patchFace({ face: "back" });

    expect(res.status).toBe(403);
    expect(mockPrintingImages.setFace).not.toHaveBeenCalled();
  });

  it("lets them move an image on a promo", async () => {
    mockPrintingDesk.isDeskPrinting.mockResolvedValue(true);

    const res = await patchFace({ face: "back" });

    expect(res.status).toBe(204);
    expect(mockPrintingImages.setFace).toHaveBeenCalled();
  });
});
