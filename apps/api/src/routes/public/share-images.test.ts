import { ERROR_CODES } from "@openrift/shared/error-codes";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import type { RenderJob } from "../../services/render-job.js";
import { renderImage } from "../../services/render-pool.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { publicShareImagesRoute } from "./share-images";

vi.mock("../../services/render-pool.js", () => ({
  renderImage: vi.fn(() =>
    Promise.resolve(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  ),
}));

const renderMock = vi.mocked(renderImage);

function jobsOfKind<K extends RenderJob["kind"]>(kind: K): Extract<RenderJob, { kind: K }>[] {
  return renderMock.mock.calls
    .map(([job]) => job)
    .filter((job): job is Extract<RenderJob, { kind: K }> => job.kind === kind);
}

const shareJobs = (): Extract<RenderJob, { kind: "share" }>[] => jobsOfKind("share");
const deckJobs = (): Extract<RenderJob, { kind: "deck" }>[] => jobsOfKind("deck");

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
const mockMetaRepo = {
  contextForDeck: vi.fn(),
};

const app = new Hono<{ Variables: Variables }>()
  .use("*", async (c, next) => {
    c.set("repos", {
      lists: mockListsRepo,
      userShares: mockUserSharesRepo,
      canonicalPrintings: mockCanonicalPrintingsRepo,
      collections: mockCollectionsRepo,
      copies: mockCopiesRepo,
      decks: mockDecksRepo,
      catalog: mockCatalogRepo,
      meta: mockMetaRepo,
    } as never);
    c.set("io", {} as never);
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
  mockMetaRepo.contextForDeck.mockReset();
  mockMetaRepo.contextForDeck.mockResolvedValue(undefined);
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

    expect(shareJobs()).toHaveLength(1);
    const input = shareJobs()[0]!.input;
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
    expect(shareJobs()[0]!.input.cards[0]).toMatchObject({ imageId: "img-1" });
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
    expect(shareJobs()[0]!.input.totalCount).toBe(0);
  });

  it("renders the landscape canvas with the mark on when no params are given", async () => {
    mockListsRepo.findByShareToken.mockResolvedValue({
      list: tradeList,
      ownerName: "Alice",
      ownerEmail: "alice@example.test",
    });
    mockListsRepo.entriesWithDetailsAnon.mockResolvedValue([]);

    await app.request("/api/v1/lists/share/tok-abc/image.png");

    expect(shareJobs()[0]!.options).toEqual({ aspect: "landscape", qr: true });
  });

  it("passes the vertical aspect and the code toggle through", async () => {
    mockListsRepo.findByShareToken.mockResolvedValue({
      list: tradeList,
      ownerName: "Alice",
      ownerEmail: "alice@example.test",
    });
    mockListsRepo.entriesWithDetailsAnon.mockResolvedValue([]);

    const res = await app.request("/api/v1/lists/share/tok-abc/image.png?aspect=vertical&qr=0");

    expect(res.status).toBe(200);
    expect(shareJobs()[0]!.options).toEqual({ aspect: "vertical", qr: false });
  });
});

describe("GET /api/v1/users/share/:token/image.png", () => {
  it("renders the bundle from the owner's anonymous projection, with a null viewerUserId", async () => {
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
    expect(mockUserSharesRepo.listsForOwner).toHaveBeenCalledWith("u1", null);
    expect(shareJobs()[0]!.input).toMatchObject({
      ownerName: "Alice",
      title: "Wish & trade lists",
      intentLabel: "1 list",
    });
  });

  it("passes the vertical aspect and the code toggle through", async () => {
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

    const res = await app.request(
      "/api/v1/users/share/tok-bundle/image.png?aspect=vertical&qr=0&size=hq",
    );

    expect(res.status).toBe(200);
    expect(shareJobs()[0]!.scale).toBe(2);
    expect(shareJobs()[0]!.options).toEqual({ aspect: "vertical", qr: false });
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
      totalDistinct: 14,
    });

    const res = await app.request("/api/v1/collections/share/tok-col/image.png?v=1700-7");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toMatch(/immutable/u);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 4)).toEqual(PNG_MAGIC);

    expect(mockCopiesRepo.collectionShareImageCards).toHaveBeenCalledWith("col-1", 60);
    expect(shareJobs()).toHaveLength(1);
    expect(shareJobs()[0]!.input).toMatchObject({
      ownerName: "Bob",
      title: "My Binder",
      intentLabel: "Collection",
      unit: { one: "printing", many: "printings" },
      totalCount: 14,
      siteHost: "openrift.app",
    });
    expect(shareJobs()[0]!.input.cards).toHaveLength(2);
  });

  it("passes the vertical aspect and the code toggle through", async () => {
    mockCollectionsRepo.findByShareToken.mockResolvedValue({
      collection: { id: "col-1", name: "My Binder", updatedAt: NOW, copyCount: 7 },
      ownerName: "Bob",
      ownerEmail: "bob@example.test",
    });
    mockCopiesRepo.collectionShareImageCards.mockResolvedValue({ cards: [], totalDistinct: 0 });

    const res = await app.request(
      "/api/v1/collections/share/tok-col/image.png?aspect=vertical&qr=0&size=hq",
    );

    expect(res.status).toBe(200);
    expect(shareJobs()[0]!.scale).toBe(2);
    expect(shareJobs()[0]!.options).toEqual({ aspect: "vertical", qr: false });
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
      {
        id: "card-1",
        name: "Scorn of the Moon",
        types: ["spell"],
        tags: [],
        energy: null,
        domains: ["order"],
      },
      { id: "card-2", name: "Gust", types: ["spell"], tags: [], energy: 1, domains: ["fury"] },
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

    expect(deckJobs()).toHaveLength(1);
    const { input, scale } = deckJobs()[0]!;
    expect(scale).toBe(1);
    expect(input).toMatchObject({
      deckName: "Best of Diana",
      ownerName: "drawphasetcg",
      formatLabel: "Constructed",
      siteHost: "openrift.app",
      shareUrl: "https://openrift.app/decks/share/tok-deck",
    });
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
    expect(deckJobs()[0]!.scale).toBe(2);
  });

  it("renders the landscape canvas by default", async () => {
    setupDeck();

    await app.request("/api/v1/decks/share/tok-deck/image.png?v=999");

    expect(deckJobs()[0]!.aspect).toBe("landscape");
  });

  it("renders the vertical canvas when aspect=vertical", async () => {
    setupDeck();

    const res = await app.request("/api/v1/decks/share/tok-deck/image.png?v=999&aspect=vertical");

    expect(res.status).toBe(200);
    expect(deckJobs()[0]!.aspect).toBe("vertical");
  });

  it("ignores an unrecognized aspect rather than failing the render", async () => {
    setupDeck();

    const res = await app.request("/api/v1/decks/share/tok-deck/image.png?v=999&aspect=square");

    expect(res.status).toBe(200);
    expect(deckJobs()[0]!.aspect).toBe("landscape");
  });

  it("passes a share URL for the QR by default", async () => {
    setupDeck();

    await app.request("/api/v1/decks/share/tok-deck/image.png?v=999");

    expect(deckJobs()[0]!.input).toMatchObject({
      shareUrl: expect.stringContaining("/decks/share/tok-deck"),
    });
  });

  it("drops the share URL when qr=0, so no code is drawn", async () => {
    setupDeck();

    const res = await app.request("/api/v1/decks/share/tok-deck/image.png?v=999&qr=0");

    expect(res.status).toBe(200);
    expect(deckJobs()[0]!.input).toMatchObject({ shareUrl: undefined });
  });

  it("keeps the QR for any other qr value", async () => {
    setupDeck();

    await app.request("/api/v1/decks/share/tok-deck/image.png?v=999&qr=1");

    expect(deckJobs()[0]!.input).toMatchObject({
      shareUrl: expect.stringContaining("/decks/share/tok-deck"),
    });
  });

  it("returns 404 for an unknown deck token and does not render", async () => {
    mockDecksRepo.findByShareToken.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/decks/share/nope/image.png");

    expect(res.status).toBe(404);
    expect(mockDecksRepo.cardsForDeck).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalled();
  });

  it("leaves the result line out for a deck outside the archive", async () => {
    setupDeck();

    await app.request("/api/v1/decks/share/tok-deck/image.png?v=999");

    expect(deckJobs()[0]!.input.resultLine).toBeUndefined();
  });

  describe("archive entry", () => {
    const metaContext = {
      playerId: "p1",
      listStatus: "full",
      playerName: "adtoll",
      sourceIdentity: null,
      rank: 1,
      rankIsTier: false,
      wins: 14,
      losses: 1,
      draws: 0,
      eventSlug: "summoner-skirmish-wuhan-2026",
      eventName: "Summoner Skirmish Wuhan",
      eventDate: "2026-03-14",
      eventFormat: "constructed",
      eventTier: "premier",
      eventCountry: "CN",
      eventPlayerCount: 3283,
    };

    function setupArchivedDeck() {
      mockDecksRepo.findByShareToken.mockResolvedValue({
        deck: { ...deck, name: "Blade Dancer (adtoll)" },
        ownerName: "Meta Archive",
        ownerEmail: "meta@example.test",
      });
      mockDecksRepo.cardsForDeck.mockResolvedValue([
        { cardId: "card-1", zone: "legend", quantity: 1, preferredPrintingId: null },
        { cardId: "card-2", zone: "main", quantity: 3, preferredPrintingId: null },
      ]);
      mockCatalogRepo.cardsByIds.mockResolvedValue([
        {
          id: "card-1",
          name: "Blade Dancer",
          types: ["legend"],
          tags: ["Irelia"],
          energy: null,
          domains: ["fury"],
        },
        { id: "card-2", name: "Gust", types: ["spell"], tags: [], energy: 1, domains: ["fury"] },
      ]);
      mockCanonicalPrintingsRepo.resolvePrintingMetaForRows.mockResolvedValue([
        { cardId: "card-1", imageId: "img-1" },
        { cardId: "card-2", imageId: "img-2" },
      ]);
      mockMetaRepo.contextForDeck.mockResolvedValue(metaContext);
    }

    it("titles the image with the legend, bylines the player, and states the finish", async () => {
      setupArchivedDeck();

      const res = await app.request("/api/v1/decks/share/tok-deck/image.png?v=999");

      expect(res.status).toBe(200);
      expect(mockMetaRepo.contextForDeck).toHaveBeenCalledWith(deck.id);
      expect(deckJobs()[0]!.input).toMatchObject({
        deckName: "Irelia, Blade Dancer",
        ownerName: "adtoll",
        resultLine: "1st of 3,283 · 14-1-0 · Summoner Skirmish Wuhan",
      });
    });

    it("points the QR at the archive page rather than the deck share link", async () => {
      setupArchivedDeck();

      await app.request("/api/v1/decks/share/tok-deck/image.png?v=999");

      expect(deckJobs()[0]!.input.shareUrl).toBe("https://openrift.app/meta/decks/tok-deck");
    });

    it("still drops the QR when qr=0", async () => {
      setupArchivedDeck();

      await app.request("/api/v1/decks/share/tok-deck/image.png?v=999&qr=0");

      expect(deckJobs()[0]!.input.shareUrl).toBeUndefined();
    });

    it("titles a list with no legend zone with the player instead", async () => {
      setupArchivedDeck();
      mockDecksRepo.cardsForDeck.mockResolvedValue([
        { cardId: "card-2", zone: "main", quantity: 3, preferredPrintingId: null },
      ]);
      mockCanonicalPrintingsRepo.resolvePrintingMetaForRows.mockResolvedValue([
        { cardId: "card-2", imageId: "img-2" },
      ]);

      await app.request("/api/v1/decks/share/tok-deck/image.png?v=999");

      expect(deckJobs()[0]!.input).toMatchObject({ deckName: "adtoll" });
      expect(deckJobs()[0]!.input.ownerName).toBeUndefined();
    });

    it("leaves the field size and the record unsaid when the source published neither", async () => {
      setupArchivedDeck();
      mockMetaRepo.contextForDeck.mockResolvedValue({
        ...metaContext,
        wins: null,
        losses: null,
        draws: null,
        eventPlayerCount: null,
      });

      await app.request("/api/v1/decks/share/tok-deck/image.png?v=999");

      expect(deckJobs()[0]!.input.resultLine).toBe("1st · Summoner Skirmish Wuhan");
    });
  });
});

describe("POST /api/v1/decks/image", () => {
  // The rate limiter's counters live for the whole test file; each test needs its own IP.
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
    expect(deckJobs()).toHaveLength(1);
  });

  it("truncates oversized deckName and ownerName before rendering", async () => {
    const res = await postRender("10.0.0.2", {
      ...validBody,
      deckName: "n".repeat(5000),
      ownerName: "o".repeat(5000),
    });

    expect(res.status).toBe(200);
    const input = deckJobs()[0]!.input;
    expect(input.deckName).toHaveLength(200);
    expect(input.ownerName).toHaveLength(200);
  });

  it("rejects bodies over 256 KB with 413 and the standard error envelope, before parsing", async () => {
    const res = await postRender("10.0.0.3", {
      ...validBody,
      deckName: "x".repeat(300 * 1024),
    });

    expect(res.status).toBe(413);
    expect(renderMock).not.toHaveBeenCalled();
    expect(await readJson(res)).toStrictEqual({
      error: "Render payload exceeds 256 KB",
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
    });
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
    expect(deckJobs()).toHaveLength(10);
  });

  it("rejects a missing or empty card list with 400", async () => {
    const res = await postRender("10.0.0.5", { deckName: "Empty", cards: [] });

    expect(res.status).toBe(400);
    expect(renderMock).not.toHaveBeenCalled();
  });
});
