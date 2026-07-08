import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import type * as DeckImageModule from "../../services/deck-image.js";
import { renderDeckImage } from "../../services/deck-image.js";
import { renderShareImage } from "../../services/share-image.js";
import { publicShareImagesRoute } from "./share-images";

// The render pipeline (satori + sharp + fonts) is exercised separately; here we
// only verify the route's data flow, headers, and projection choices.
vi.mock("../../services/share-image.js", () => ({
  renderShareImage: vi.fn(() =>
    Promise.resolve(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  ),
}));

// Mock only the heavy renderer; keep buildDeckImageCards/formatLabelFromSlug real
// so the route's enrichment data flow is exercised.
vi.mock("../../services/deck-image.js", async (importOriginal) => ({
  ...(await importOriginal<typeof DeckImageModule>()),
  renderDeckImage: vi.fn(() =>
    Promise.resolve(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  ),
}));

const renderMock = vi.mocked(renderShareImage);
const renderDeckMock = vi.mocked(renderDeckImage);

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
const mockCollectionsRepo = {
  findByShareToken: vi.fn(),
};
const mockCopiesRepo = {
  collectionShareImageCards: vi.fn(),
};
const mockDecksRepo = {
  findByShareToken: vi.fn(),
  cardsForDeck: vi.fn(),
};
const mockCatalogRepo = {
  cardsByIds: vi.fn(),
};

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("repos", {
      lists: mockListsRepo,
      userShares: mockUserSharesRepo,
      canonicalPrintings: mockCanonicalPrintingsRepo,
      collections: mockCollectionsRepo,
      copies: mockCopiesRepo,
      decks: mockDecksRepo,
      catalog: mockCatalogRepo,
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
    source: "manual" as const,
    copyId: `copy-${id}`,
    printingId: `printing-${id}`,
    collectionId: "col",
    cardName,
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
  renderDeckMock.mockClear();
  mockListsRepo.findByShareToken.mockReset();
  mockListsRepo.entriesWithDetailsAnon.mockReset();
  mockUserSharesRepo.findOwnerByShareToken.mockReset();
  mockUserSharesRepo.listsForOwner.mockReset();
  mockCanonicalPrintingsRepo.resolvePrintingMetaForRows.mockReset();
  mockCanonicalPrintingsRepo.resolvePrintingMetaForRows.mockResolvedValue([]);
  mockCollectionsRepo.findByShareToken.mockReset();
  mockCopiesRepo.collectionShareImageCards.mockReset();
  mockDecksRepo.findByShareToken.mockReset();
  mockDecksRepo.cardsForDeck.mockReset();
  mockCatalogRepo.cardsByIds.mockReset();
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

describe("GET /api/v1/collections/share/:token/image.png", () => {
  it("renders a PNG with an immutable cache header and maps collection metadata", async () => {
    mockCollectionsRepo.findByShareToken.mockResolvedValue({
      collection: { id: "col-1", name: "My Binder", updatedAt: NOW, copyCount: 7 },
      ownerName: "Bob",
      ownerEmail: "bob@example.test",
    });
    mockCopiesRepo.collectionShareImageCards.mockResolvedValue({
      cards: [
        { cardName: "Teemo, Scout", quantity: 3, imageId: "img-1" },
        { cardName: "Jinx, Rebel", quantity: 1, imageId: null },
      ],
      // Larger than the returned cards array so "+N more" overflow is exercised.
      totalDistinct: 14,
    });

    const res = await app.request("/api/v1/collections/share/tok-col/image.png?v=1700-7");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toMatch(/immutable/u);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 4)).toEqual(PNG_MAGIC);

    expect(mockCopiesRepo.collectionShareImageCards).toHaveBeenCalledWith("col-1", 60);
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(renderMock.mock.calls[0]![1]).toMatchObject({
      ownerName: "Bob",
      title: "My Binder",
      intentLabel: "Collection",
      unit: { one: "printing", many: "printings" },
      totalCount: 14,
      siteHost: "openrift.app",
    });
    expect(renderMock.mock.calls[0]![1].cards).toHaveLength(2);
  });

  it("returns 404 for an unknown or private token and does not render", async () => {
    mockCollectionsRepo.findByShareToken.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/collections/share/nope/image.png");

    expect(res.status).toBe(404);
    expect(mockCopiesRepo.collectionShareImageCards).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/decks/share/:token/image.png", () => {
  const deck = {
    id: "d0000000-0001-4000-a000-000000000010",
    userId: "u1",
    name: "Best of Diana",
    format: "constructed",
  };

  function setupDeck() {
    mockDecksRepo.findByShareToken.mockResolvedValue({
      deck,
      ownerName: "drawphasetcg",
      ownerEmail: "owner@example.test",
    });
    mockDecksRepo.cardsForDeck.mockResolvedValue([
      { cardId: "card-1", zone: "legend", quantity: 1, preferredPrintingId: null },
      { cardId: "card-2", zone: "main", quantity: 3, preferredPrintingId: null },
    ]);
    mockCatalogRepo.cardsByIds.mockResolvedValue([
      { id: "card-1", name: "Scorn of the Moon", energy: null, domains: ["order"] },
      { id: "card-2", name: "Gust", energy: 1, domains: ["fury"] },
    ]);
    mockCanonicalPrintingsRepo.resolvePrintingMetaForRows.mockResolvedValue([
      { cardId: "card-1", imageId: "img-1" },
      { cardId: "card-2", imageId: "img-2" },
    ]);
  }

  it("renders a PNG with an immutable cache header and the enriched deck cards", async () => {
    setupDeck();

    const res = await app.request("/api/v1/decks/share/tok-deck/image.png?v=999");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toMatch(/immutable/u);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 4)).toEqual(PNG_MAGIC);

    expect(renderDeckMock).toHaveBeenCalledTimes(1);
    const [, input, scale] = renderDeckMock.mock.calls[0]!;
    expect(scale).toBe(1);
    expect(input).toMatchObject({
      deckName: "Best of Diana",
      ownerName: "drawphasetcg",
      formatLabel: "Constructed",
      siteHost: "openrift.app",
      shareUrl: "https://openrift.app/decks/share/tok-deck",
    });
    // Cards are enriched with zone, art id, energy, and domains for the layout.
    expect(input.cards).toEqual([
      {
        cardName: "Scorn of the Moon",
        quantity: 1,
        imageId: "img-1",
        energy: null,
        domains: ["order"],
        zone: "legend",
      },
      {
        cardName: "Gust",
        quantity: 3,
        imageId: "img-2",
        energy: 1,
        domains: ["fury"],
        zone: "main",
      },
    ]);
  });

  it("renders the HQ variant at 2× when size=hq", async () => {
    setupDeck();

    const res = await app.request("/api/v1/decks/share/tok-deck/image.png?v=999&size=hq");

    expect(res.status).toBe(200);
    expect(renderDeckMock.mock.calls[0]![2]).toBe(2);
  });

  it("returns 404 for an unknown deck token and does not render", async () => {
    mockDecksRepo.findByShareToken.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/decks/share/nope/image.png");

    expect(res.status).toBe(404);
    expect(mockDecksRepo.cardsForDeck).not.toHaveBeenCalled();
    expect(renderDeckMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/decks/image", () => {
  // The rate limiter keys on x-real-ip and its counters live for the whole
  // test file, so every test uses its own IP to get an isolated bucket.
  function postRender(ip: string, body: unknown) {
    return app.request("/api/v1/decks/image", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: JSON.stringify(body),
    });
  }

  const validBody = {
    deckName: "Local Deck",
    format: "constructed",
    cards: [{ cardId: "card-1", quantity: 3, zone: "main" }],
  };

  beforeEach(() => {
    mockCatalogRepo.cardsByIds.mockResolvedValue([]);
  });

  it("renders a PNG from posted cards", async () => {
    const res = await postRender("10.0.0.1", validBody);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(renderDeckMock).toHaveBeenCalledTimes(1);
  });

  it("truncates oversized deckName and ownerName before rendering", async () => {
    const res = await postRender("10.0.0.2", {
      ...validBody,
      deckName: "n".repeat(5000),
      ownerName: "o".repeat(5000),
    });

    expect(res.status).toBe(200);
    const input = renderDeckMock.mock.calls[0]![1];
    expect(input.deckName).toHaveLength(200);
    expect(input.ownerName).toHaveLength(200);
  });

  it("rejects bodies over 256 KB with 413 before parsing", async () => {
    const res = await postRender("10.0.0.3", {
      ...validBody,
      deckName: "x".repeat(300 * 1024),
    });

    expect(res.status).toBe(413);
    expect(renderDeckMock).not.toHaveBeenCalled();
  });

  it("rate-limits repeated renders from one IP with 429", async () => {
    let limited = 0;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const res = await postRender("10.0.0.4", validBody);
      if (res.status === 429) {
        limited += 1;
      }
    }

    expect(limited).toBe(1);
    expect(renderDeckMock).toHaveBeenCalledTimes(10);
  });

  it("rejects a missing or empty card list with 400", async () => {
    const res = await postRender("10.0.0.5", { deckName: "Empty", cards: [] });

    expect(res.status).toBe(400);
    expect(renderDeckMock).not.toHaveBeenCalled();
  });
});
