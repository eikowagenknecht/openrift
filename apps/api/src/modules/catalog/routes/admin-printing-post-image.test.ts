import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../../errors.js";
import type { Variables } from "../../../types.js";
import { renderPrintingPostImage } from "../services/printing-post-image.js";
import { mountAdminPrintingPostImage } from "./admin-printing-post-image.js";

vi.mock("../services/printing-post-image.js", () => ({
  renderPrintingPostImage: vi.fn(() =>
    Promise.resolve(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  ),
}));

vi.mock("../../../middleware/require-admin.js", () => ({
  requireAdmin: (_c: unknown, next: () => Promise<void>) => next(),
}));

const renderMock = vi.mocked(renderPrintingPostImage);

const PRINTING_ID = "a0000000-0001-4000-a000-000000000001";

const printingRow = {
  printingId: PRINTING_ID,
  cardId: "card-1",
  cardName: "Summoner Skirmish Banner",
  cardType: "unit",
  publicCode: "OGN-P01/298",
  finish: "foil",
  artist: "A. Painter",
  markerSlugs: ["prerelease"],
  activeImageFileId: "active-file",
};

const mockPrintingDesk = { getPostImageRow: vi.fn(), getImageCredit: vi.fn() };
const mockDistributionChannels = { listForPrintingIds: vi.fn(), getById: vi.fn() };
const mockMarkers = { listBySlugs: vi.fn() };
const mockFinishes = { getBySlug: vi.fn() };

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", {
    printingDesk: mockPrintingDesk,
    distributionChannels: mockDistributionChannels,
    markers: mockMarkers,
    finishes: mockFinishes,
  } as never);
  c.set("io", {} as never);
  c.set("config", { corsOrigin: "https://cards.example" } as never);
  await next();
});
mountAdminPrintingPostImage(app);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status as 404);
  }
  throw err;
});

function url(query = ""): string {
  return `http://localhost/api/admin/v1/printing-desk/printings/${PRINTING_ID}/post-image.png${query}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  renderMock.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  mockPrintingDesk.getPostImageRow.mockResolvedValue(printingRow);
  mockDistributionChannels.listForPrintingIds.mockResolvedValue([
    { channelLabel: "Summoner Skirmish", channelParentId: "parent-1" },
  ]);
  mockDistributionChannels.getById.mockResolvedValue({ id: "parent-1", label: "Organized Play" });
  mockMarkers.listBySlugs.mockResolvedValue([{ slug: "prerelease", label: "Prerelease" }]);
  mockFinishes.getBySlug.mockResolvedValue({ slug: "foil", label: "Foil" });
  mockPrintingDesk.getImageCredit.mockResolvedValue({ credit: "gamesnight" });
});

describe("GET printing-desk post-image.png", () => {
  it("serves a PNG that no shared cache may keep", async () => {
    const res = await app.request(url());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  it("defaults to the active front image, the released label, square and 1×", async () => {
    await app.request(url());

    expect(renderMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        imageFileId: "active-file",
        label: "released",
        siteHost: "cards.example",
      }),
      "square",
      1,
    );
  });

  it("passes the requested image, label, aspect and scale through", async () => {
    await app.request(url("?imageFileId=chosen&label=announced&aspect=story&scale=2"));

    expect(renderMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ imageFileId: "chosen", label: "announced" }),
      "story",
      2,
    );
  });

  it("passes the date through in its display form", async () => {
    await app.request(url("?date=2026-10-04"));

    expect(renderMock.mock.calls[0]?.[1]).toMatchObject({ dateText: "4 October 2026" });
  });

  it("shortens the date to the precision the query carries", async () => {
    await app.request(url("?date=2026-Q2"));
    expect(renderMock.mock.calls[0]?.[1]).toMatchObject({ dateText: "Q2 2026" });
  });

  it("sends no date when the query carries none", async () => {
    await app.request(url());
    expect(renderMock.mock.calls[0]?.[1]).toMatchObject({ dateText: undefined });
  });

  it("drops a date that is not a real one", async () => {
    for (const value of ["none", "2026-02-30", "yesterday"]) {
      renderMock.mockClear();
      await app.request(url(`?date=${value}`));
      expect(renderMock.mock.calls[0]?.[1]).toMatchObject({ dateText: undefined });
    }
  });

  it("falls back to the defaults on unknown query values", async () => {
    await app.request(url("?label=nonsense&aspect=nonsense&scale=9"));

    expect(renderMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ label: "released" }),
      "square",
      1,
    );
  });

  it("resolves the channel breadcrumb, marker and finish labels", async () => {
    await app.request(url());

    expect(renderMock.mock.calls[0]?.[1]).toMatchObject({
      channelLabel: "Organized Play › Summoner Skirmish",
      markerLabels: ["Prerelease"],
      finishLabel: "Foil",
    });
  });

  it("leaves a root channel's label unprefixed", async () => {
    mockDistributionChannels.listForPrintingIds.mockResolvedValue([
      { channelLabel: "Summoner Skirmish", channelParentId: null },
    ]);
    await app.request(url());

    expect(renderMock.mock.calls[0]?.[1]).toMatchObject({ channelLabel: "Summoner Skirmish" });
    expect(mockDistributionChannels.getById).not.toHaveBeenCalled();
  });

  it("credits the maker recorded on the chosen image file", async () => {
    await app.request(url("?imageFileId=chosen"));

    expect(mockPrintingDesk.getImageCredit).toHaveBeenCalledWith("chosen");
    expect(renderMock.mock.calls[0]?.[1]).toMatchObject({ imageCredit: "gamesnight" });
  });

  it("sends a null credit when the file carries none", async () => {
    mockPrintingDesk.getImageCredit.mockResolvedValue({ credit: null });
    await app.request(url());
    expect(renderMock.mock.calls[0]?.[1]).toMatchObject({ imageCredit: null });
  });

  it("sends a null credit when the printing has no image at all", async () => {
    mockPrintingDesk.getPostImageRow.mockResolvedValue({
      ...printingRow,
      activeImageFileId: null,
    });
    await app.request(url());

    expect(mockPrintingDesk.getImageCredit).not.toHaveBeenCalled();
    expect(renderMock.mock.calls[0]?.[1]).toMatchObject({ imageCredit: null });
  });

  it("renders a battlefield image lying down", async () => {
    mockPrintingDesk.getPostImageRow.mockResolvedValue({
      ...printingRow,
      cardType: "battlefield",
    });
    await app.request(url());
    expect(renderMock.mock.calls[0]?.[1]).toMatchObject({ orientation: "landscape" });
  });

  it("shows a TBA public code as its display form", async () => {
    mockPrintingDesk.getPostImageRow.mockResolvedValue({ ...printingRow, publicCode: "TBA" });
    await app.request(url());
    expect(renderMock.mock.calls[0]?.[1]).toMatchObject({ publicCode: "Code TBA" });
  });

  it("404s on an unknown printing", async () => {
    mockPrintingDesk.getPostImageRow.mockResolvedValue(undefined);

    const res = await app.request(url());
    expect(res.status).toBe(404);
    expect(renderMock).not.toHaveBeenCalled();
  });
});
