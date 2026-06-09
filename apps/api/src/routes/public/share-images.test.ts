import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { renderShareImage } from "../../services/share-image.js";
import { publicShareImagesRoute } from "./share-images";

// The render pipeline (satori + sharp + fonts) is exercised separately; here we
// only verify the route's data flow, headers, and projection choices.
vi.mock("../../services/share-image.js", () => ({
  renderShareImage: vi.fn(() =>
    Promise.resolve(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  ),
}));

const renderMock = vi.mocked(renderShareImage);

const mockListsRepo = {
  findByShareToken: vi.fn(),
  entriesWithDetailsAnon: vi.fn(),
};
const mockUserSharesRepo = {
  findOwnerByShareToken: vi.fn(),
  listsForOwner: vi.fn(),
};
const mockCanonicalPrintingsRepo = {
  resolvePrintingMetaForRows: vi.fn(() => Promise.resolve([] as unknown[])),
};

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("repos", {
      lists: mockListsRepo,
      userShares: mockUserSharesRepo,
      canonicalPrintings: mockCanonicalPrintingsRepo,
    } as never);
    c.set("io", {} as never);
    // Comma-separated allow-list (as CORS_ORIGIN really is) to guard the footer
    // host parsing: the first origin's host must be used, not the whole string.
    c.set("config", { corsOrigin: "https://openrift.app,https://preview.openrift.app" } as never);
    await next();
  })
  .route("/api/v1", publicShareImagesRoute)
  .onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 404);
    }
    throw err;
  });

const NOW = new Date("2026-04-20T00:00:00Z");
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const tradeList = {
  id: "a0000000-0001-4000-a000-000000000010",
  userId: "u1",
  name: "Holiday Targets",
  intent: "trade",
  kind: "copy",
  isPublic: true,
  shareToken: "tok-abc",
  createdAt: NOW,
  updatedAt: NOW,
  defaultPricePref: null,
  defaultPriceAbsoluteCents: null,
  defaultTradeType: null,
  currency: null,
  sortOrder: 0,
};

function copyEntry(id: string, cardName: string, quantity: number) {
  return {
    id,
    listId: tradeList.id,
    kind: "copy",
    copyId: `copy-${id}`,
    printingId: `printing-${id}`,
    collectionId: "col",
    cardName,
    cardType: "unit",
    setId: "set",
    rarity: "common",
    finish: "standard",
    imageId: null,
    quantity,
    tradeOverride: { pricePref: null, priceAbsoluteCents: null, tradeType: null },
  };
}

beforeEach(() => {
  renderMock.mockClear();
  mockListsRepo.findByShareToken.mockReset();
  mockListsRepo.entriesWithDetailsAnon.mockReset();
  mockUserSharesRepo.findOwnerByShareToken.mockReset();
  mockUserSharesRepo.listsForOwner.mockReset();
  mockCanonicalPrintingsRepo.resolvePrintingMetaForRows.mockReset();
  mockCanonicalPrintingsRepo.resolvePrintingMetaForRows.mockResolvedValue([]);
});

describe("GET /api/v1/lists/share/:token/image.png", () => {
  it("renders a PNG with an immutable cache header and maps list metadata", async () => {
    mockListsRepo.findByShareToken.mockResolvedValue({
      list: tradeList,
      ownerName: "Alice",
      ownerEmail: "alice@example.test",
    });
    mockListsRepo.entriesWithDetailsAnon.mockResolvedValue([
      copyEntry("e1", "Teemo, Scout", 2),
      copyEntry("e2", "Jinx, Rebel", 1),
    ]);

    const res = await app.request("/api/v1/lists/share/tok-abc/image.png?v=123");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toMatch(/immutable/u);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 4)).toEqual(PNG_MAGIC);

    expect(renderMock).toHaveBeenCalledTimes(1);
    const input = renderMock.mock.calls[0]![1];
    expect(input).toMatchObject({
      ownerName: "Alice",
      title: "Holiday Targets",
      intentLabel: "Trade list",
      totalCount: 2,
      siteHost: "openrift.app",
    });
    expect(input.cards).toHaveLength(2);
  });

  it("returns 404 for an unknown token and does not render", async () => {
    mockListsRepo.findByShareToken.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/lists/share/nope/image.png");

    expect(res.status).toBe(404);
    expect(mockListsRepo.entriesWithDetailsAnon).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalled();
  });

  it("resolves representative art for card-kind entries", async () => {
    mockListsRepo.findByShareToken.mockResolvedValue({
      list: { ...tradeList, intent: "wish", kind: "card" },
      ownerName: "Alice",
      ownerEmail: "alice@example.test",
    });
    mockListsRepo.entriesWithDetailsAnon.mockResolvedValue([
      {
        id: "e1",
        listId: tradeList.id,
        kind: "card",
        cardId: "card-1",
        cardName: "Teemo, Scout",
        cardType: "unit",
        quantity: 1,
        tradeOverride: { pricePref: null, priceAbsoluteCents: null, tradeType: null },
      },
    ]);
    mockCanonicalPrintingsRepo.resolvePrintingMetaForRows.mockResolvedValue([
      {
        cardId: "card-1",
        preferredPrintingId: null,
        resolvedPrintingId: "p1",
        shortCode: "X",
        imageId: "img-1",
      },
    ]);

    const res = await app.request("/api/v1/lists/share/tok-abc/image.png");

    expect(res.status).toBe(200);
    expect(mockCanonicalPrintingsRepo.resolvePrintingMetaForRows).toHaveBeenCalledWith([
      { cardId: "card-1", preferredPrintingId: null },
    ]);
    expect(renderMock.mock.calls[0]![1].cards[0]).toMatchObject({ imageId: "img-1" });
  });

  it("renders a placeholder image (200) for a shared list with no entries", async () => {
    mockListsRepo.findByShareToken.mockResolvedValue({
      list: tradeList,
      ownerName: "Alice",
      ownerEmail: "alice@example.test",
    });
    mockListsRepo.entriesWithDetailsAnon.mockResolvedValue([]);

    const res = await app.request("/api/v1/lists/share/tok-abc/image.png");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(renderMock.mock.calls[0]![1].totalCount).toBe(0);
  });
});

describe("GET /api/v1/users/share/:token/image.png", () => {
  it("renders the bundle from the owner's anonymous (public-only) projection", async () => {
    mockUserSharesRepo.findOwnerByShareToken.mockResolvedValue({
      userId: "u1",
      displayName: "Alice",
      email: "alice@example.test",
      image: null,
    });
    mockUserSharesRepo.listsForOwner.mockResolvedValue([
      { list: tradeList, entryCount: 1, viaGroups: [] },
    ]);
    mockListsRepo.entriesWithDetailsAnon.mockResolvedValue([copyEntry("e1", "Teemo, Scout", 1)]);

    const res = await app.request("/api/v1/users/share/tok-bundle/image.png");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    // Anonymous projection: viewerUserId must be null so the image never varies
    // by viewer.
    expect(mockUserSharesRepo.listsForOwner).toHaveBeenCalledWith("u1", null);
    expect(renderMock.mock.calls[0]![1]).toMatchObject({
      ownerName: "Alice",
      title: "Wish & trade lists",
      intentLabel: "1 list",
    });
  });

  it("returns 404 for an unknown bundle token", async () => {
    mockUserSharesRepo.findOwnerByShareToken.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/users/share/nope/image.png");

    expect(res.status).toBe(404);
    expect(renderMock).not.toHaveBeenCalled();
  });
});
