import { PREFERENCE_DEFAULTS } from "@openrift/shared/types";
import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { decksRouter } from "./decks";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockRepo = {
  listForUser: vi.fn(() => Promise.resolve([] as object[])),
  allCardsForUser: vi.fn(() => Promise.resolve([] as object[])),
  create: vi.fn(() => Promise.resolve({} as object)),
  getByIdForUser: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  update: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  deleteByIdForUser: vi.fn(() => Promise.resolve({ numDeletedRows: 0n })),
  cardsForDeck: vi.fn(() => Promise.resolve([] as object[])),
  cardsWithDetails: vi.fn(() => Promise.resolve([] as object[])),
  getIdAndFormat: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  exists: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  replaceCards: vi.fn(() => Promise.resolve()),
  cloneDeck: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  getShareState: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  setShareToken: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  findByShareToken: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  cloneFromShareToken: vi.fn(() => Promise.resolve(undefined as object | undefined)),
};

const mockMarketplace = {
  deckValues: vi.fn(() => Promise.resolve(new Map<string, number>())),
};

const mockCopies = {
  buildableCountByCard: vi.fn(() => Promise.resolve(new Map<string, number>())),
  buildableCountByCardForCollections: vi.fn(() =>
    Promise.resolve(new Map<string, Map<string, number>>()),
  ),
};

const mockCollections = {
  getAccessForUser: vi.fn(() => Promise.resolve(undefined as object | undefined)),
};

const mockLoans = {
  borrowedCountByCard: vi.fn(() => Promise.resolve(new Map<string, number>())),
};

const mockDeckFolders = {
  folderIdsByDeckIds: vi.fn(() => Promise.resolve(new Map<string, string[]>())),
};

const mockCatalog = {
  cardBansByCardIds: vi.fn(() => Promise.resolve([] as { cardId: string; formatId: string }[])),
};

const mockUserPreferences = {
  getByUserId: vi.fn(() => Promise.resolve(undefined as object | undefined)),
};

const mockDeckFormats = {
  getBySlug: vi.fn((slug: string) =>
    Promise.resolve(
      slug === "constructed" || slug === "freeform" || slug === "custom-region"
        ? { slug, label: slug, sortOrder: 0, isWellKnown: true }
        : undefined,
    ),
  ),
};

const mockCustomTags = {
  getBySlug: vi.fn(() => Promise.resolve(undefined as object | undefined)),
};

const mockEnums = {
  all: vi.fn(() =>
    Promise.resolve({
      cardTypes: [
        { slug: "legend", label: "legend", sortOrder: 1, isWellKnown: true },
        { slug: "unit", label: "unit", sortOrder: 2, isWellKnown: true },
        { slug: "rune", label: "rune", sortOrder: 3, isWellKnown: true },
        { slug: "spell", label: "spell", sortOrder: 4, isWellKnown: true },
        { slug: "gear", label: "gear", sortOrder: 5, isWellKnown: true },
        { slug: "battlefield", label: "battlefield", sortOrder: 6, isWellKnown: true },
        { slug: "other", label: "other", sortOrder: 7, isWellKnown: true },
      ],
      domains: [
        { slug: "fury", label: "fury", sortOrder: 1, isWellKnown: true, color: null },
        { slug: "calm", label: "calm", sortOrder: 2, isWellKnown: true, color: null },
        { slug: "mind", label: "mind", sortOrder: 3, isWellKnown: true, color: null },
        { slug: "body", label: "body", sortOrder: 4, isWellKnown: true, color: null },
        { slug: "chaos", label: "chaos", sortOrder: 5, isWellKnown: true, color: null },
        { slug: "order", label: "order", sortOrder: 6, isWellKnown: true, color: null },
        { slug: "colorless", label: "colorless", sortOrder: 7, isWellKnown: true, color: null },
      ],
      rarities: [],
      superTypes: [],
      finishes: [],
      artVariants: [],
      deckFormats: [],
      deckZones: [],
      languages: [],
    }),
  ),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", {
    decks: mockRepo,
    deckFolders: mockDeckFolders,
    marketplace: mockMarketplace,
    userPreferences: mockUserPreferences,
    enums: mockEnums,
    deckFormats: mockDeckFormats,
    customTags: mockCustomTags,
    copies: mockCopies,
    loans: mockLoans,
    catalog: mockCatalog,
    collections: mockCollections,
  } as never);
  await next();
});
registerRouterForTest(app, decksRouter);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  throw err;
});

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const now = new Date("2026-03-17T00:00:00Z");

const DECK_ID = "a0000000-0001-4000-a000-000000000010";

const dbDeck = {
  id: DECK_ID,
  userId: USER_ID,
  name: "Fury Aggro",
  description: null,
  format: "constructed",
  formatConfig: null,
  oddsConfig: null,
  isPublic: false,
  shareToken: null,
  isPinned: false,
  archivedAt: null,
  coverCardId: null,
  coverPrintingId: null,
  coverPosition: null,
  links: [],
  collectionId: null,
  createdAt: now,
  updatedAt: now,
};

const COLLECTION_ID = "b0000000-0001-4000-a000-000000000001";

/** Slim deck card row (for cardsForDeck — detail/PUT endpoints). */
const dbDeckCard = {
  cardId: "c0000000-0001-4000-a000-000000000001",
  zone: "main",
  quantity: 4,
  preferredPrintingId: null,
};

/** Full deck card row (for cardsWithDetails — export, allCardsForUser — list). */
const dbDeckCardFull = {
  id: "a0000000-0001-4000-a000-000000000020",
  deckId: DECK_ID,
  cardId: "c0000000-0001-4000-a000-000000000001",
  zone: "main",
  quantity: 4,
  cardName: "Fire Dragon",
  cardType: "unit",
  cardTypes: ["unit"],
  superTypes: [],
  domains: ["fury"],
  tags: [],
  keywords: [],
  energy: 5,
  might: 4,
  power: 6,
  imageUrl: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/decks", () => {
  beforeEach(() => {
    mockRepo.listForUser.mockReset();
    mockCopies.buildableCountByCard.mockReset();
    mockCopies.buildableCountByCard.mockResolvedValue(new Map<string, number>());
    mockCopies.buildableCountByCardForCollections.mockReset();
    mockCopies.buildableCountByCardForCollections.mockResolvedValue(
      new Map<string, Map<string, number>>(),
    );
    mockLoans.borrowedCountByCard.mockReset();
    mockLoans.borrowedCountByCard.mockResolvedValue(new Map<string, number>());
    mockMarketplace.deckValues.mockClear();
    mockUserPreferences.getByUserId.mockReset();
    mockUserPreferences.getByUserId.mockResolvedValue(undefined);
  });

  it("returns 200 with list of decks", async () => {
    mockRepo.listForUser.mockResolvedValue([dbDeck]);
    mockRepo.allCardsForUser.mockResolvedValue([dbDeckCardFull]);
    const res = await app.request("/api/v1/decks");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].deck.name).toBe("Fury Aggro");
    expect(json.items[0].totalCards).toBe(4);
    expect(json.items[0].typeCounts).toEqual([{ cardType: "unit", count: 4 }]);
    expect(json.items[0].isValid).toBe(false);
    // Build figure for the tile's format badge: the four main-deck cards
    // against Constructed's 56 required-zone cards.
    expect(json.items[0].requiredProgress).toBe(4);
    expect(json.items[0].requiredTotal).toBe(56);
  });

  it("counts only the required zones in the build figure", async () => {
    mockRepo.listForUser.mockResolvedValue([dbDeck]);
    mockRepo.allCardsForUser.mockResolvedValue([
      dbDeckCardFull,
      { ...dbDeckCardFull, id: "a0000000-0001-4000-a000-000000000021", zone: "sideboard" },
      { ...dbDeckCardFull, id: "a0000000-0001-4000-a000-000000000022", zone: "overflow" },
    ]);
    const res = await app.request("/api/v1/decks");
    const json = await readJson(res);
    // totalCards keeps the sideboard, the build figure doesn't — the two
    // numbers are deliberately different.
    expect(json.items[0].totalCards).toBe(8);
    expect(json.items[0].requiredProgress).toBe(4);
  });

  // The tile's value must be priced on the same basis as the deck page, which
  // only counts printings in the languages the viewer collects.
  it("prices deck values in the user's preferred languages", async () => {
    mockRepo.listForUser.mockResolvedValue([dbDeck]);
    mockRepo.allCardsForUser.mockResolvedValue([dbDeckCardFull]);
    mockUserPreferences.getByUserId.mockResolvedValue({
      data: { marketplaceOrder: ["cardtrader"], languages: ["SC", "EN"] },
    });

    const res = await app.request("/api/v1/decks");

    expect(res.status).toBe(200);
    expect(mockMarketplace.deckValues).toHaveBeenCalledWith(USER_ID, "cardtrader", ["SC", "EN"]);
  });

  it("falls back to the default languages when the user has no preference", async () => {
    mockRepo.listForUser.mockResolvedValue([dbDeck]);
    mockRepo.allCardsForUser.mockResolvedValue([dbDeckCardFull]);

    const res = await app.request("/api/v1/decks");

    expect(res.status).toBe(200);
    expect(mockMarketplace.deckValues).toHaveBeenCalledWith(
      USER_ID,
      PREFERENCE_DEFAULTS.marketplaceOrder[0],
      PREFERENCE_DEFAULTS.languages,
    );
  });

  // The deck needs 4 of one card. With no buildable/borrowed stock, the whole
  // playset is missing.
  it("reports the full playset missing when nothing is owned", async () => {
    mockRepo.listForUser.mockResolvedValue([dbDeck]);
    mockRepo.allCardsForUser.mockResolvedValue([dbDeckCardFull]);
    const res = await app.request("/api/v1/decks");
    const json = await readJson(res);
    expect(json.items[0].missingCount).toBe(4);
  });

  // Buildable + borrowed-in stock both count toward the shortfall, and the
  // shortfall floors at 0 (surplus copies never make missing go negative).
  it("subtracts buildable and borrowed-in stock, flooring at zero", async () => {
    const cardId = dbDeckCardFull.cardId;
    mockRepo.listForUser.mockResolvedValue([dbDeck]);
    // main needs 4, sideboard needs 1 (5 total across zones).
    mockRepo.allCardsForUser.mockResolvedValue([
      dbDeckCardFull,
      { ...dbDeckCardFull, id: "side", zone: "sideboard", quantity: 1 },
    ]);
    mockCopies.buildableCountByCard.mockResolvedValue(new Map([[cardId, 2]]));
    mockLoans.borrowedCountByCard.mockResolvedValue(new Map([[cardId, 1]]));
    const res = await app.request("/api/v1/decks");
    const json = await readJson(res);
    // needed 5 − buildable 2 − borrowed 1 = 2 missing.
    expect(json.items[0].missingCount).toBe(2);
  });

  // Overflow is a parking zone, so cards stashed there aren't part of the deck
  // and never show up as missing — matching the deck editor's ownership panel.
  it("ignores overflow cards when counting missing", async () => {
    mockRepo.listForUser.mockResolvedValue([dbDeck]);
    mockRepo.allCardsForUser.mockResolvedValue([
      dbDeckCardFull,
      { ...dbDeckCardFull, id: "stash", cardId: "stashed-card", zone: "overflow", quantity: 3 },
    ]);
    const res = await app.request("/api/v1/decks");
    const json = await readJson(res);
    expect(json.items[0].missingCount).toBe(4);
  });

  // The deck's home collection is the box it lives in: its copies count for
  // this deck on top of the shared buildable pool, even though the collection
  // is excluded from deck building everywhere else.
  it("adds the home collection's copies to the deck's own stock", async () => {
    const cardId = dbDeckCardFull.cardId;
    mockRepo.listForUser.mockResolvedValue([{ ...dbDeck, collectionId: COLLECTION_ID }]);
    mockRepo.allCardsForUser.mockResolvedValue([dbDeckCardFull]);
    mockCopies.buildableCountByCard.mockResolvedValue(new Map([[cardId, 1]]));
    mockCopies.buildableCountByCardForCollections.mockResolvedValue(
      new Map([[COLLECTION_ID, new Map([[cardId, 3]])]]),
    );
    const res = await app.request("/api/v1/decks");
    const json = await readJson(res);
    expect(mockCopies.buildableCountByCardForCollections).toHaveBeenCalledWith(USER_ID, [
      COLLECTION_ID,
    ]);
    // needed 4 − buildable 1 − home collection 3 = 0 missing.
    expect(json.items[0].missingCount).toBe(0);
  });

  // Another deck's home collection must not leak into this deck's stock.
  it("ignores home-collection stock for a deck without one", async () => {
    const cardId = dbDeckCardFull.cardId;
    mockRepo.listForUser.mockResolvedValue([dbDeck]);
    mockRepo.allCardsForUser.mockResolvedValue([dbDeckCardFull]);
    mockCopies.buildableCountByCardForCollections.mockResolvedValue(
      new Map([[COLLECTION_ID, new Map([[cardId, 4]])]]),
    );
    const res = await app.request("/api/v1/decks");
    const json = await readJson(res);
    expect(json.items[0].missingCount).toBe(4);
  });

  it("reports zero missing when owned stock covers the deck", async () => {
    mockRepo.listForUser.mockResolvedValue([dbDeck]);
    mockRepo.allCardsForUser.mockResolvedValue([dbDeckCardFull]);
    mockCopies.buildableCountByCard.mockResolvedValue(new Map([[dbDeckCardFull.cardId, 10]]));
    const res = await app.request("/api/v1/decks");
    const json = await readJson(res);
    expect(json.items[0].missingCount).toBe(0);
  });

  // ADR-037: type counts fan out over the full type set, so a multi-type card
  // (e.g. Unit Gear) is counted under each of its non-excluded types.
  it("counts a multi-type card under each of its types", async () => {
    mockRepo.listForUser.mockResolvedValue([dbDeck]);
    mockRepo.allCardsForUser.mockResolvedValue([
      { ...dbDeckCardFull, cardType: "unit", cardTypes: ["unit", "gear"] },
    ]);
    const res = await app.request("/api/v1/decks");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.items[0].typeCounts).toEqual([
      { cardType: "unit", count: 4 },
      { cardType: "gear", count: 4 },
    ]);
  });
});

describe("POST /api/v1/decks", () => {
  beforeEach(() => {
    mockRepo.create.mockReset();
  });

  it("returns 201 with created deck", async () => {
    mockRepo.create.mockResolvedValue(dbDeck);
    const res = await app.request("/api/v1/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Fury Aggro", format: "constructed" }),
    });
    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json.name).toBe("Fury Aggro");
  });

  it("creates with all optional fields", async () => {
    mockRepo.create.mockResolvedValue(dbDeck);
    const res = await app.request("/api/v1/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Fury Aggro",
        format: "freeform",
        description: "A fast deck",
        isPublic: true,
      }),
    });
    expect(res.status).toBe(201);
  });

  it("passes outbound links through to the repository", async () => {
    mockRepo.create.mockResolvedValue(dbDeck);
    const res = await app.request("/api/v1/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Fury Aggro",
        format: "constructed",
        links: [{ url: "https://riftdecks.com/deck/42" }],
      }),
    });
    expect(res.status).toBe(201);
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ links: [{ url: "https://riftdecks.com/deck/42" }] }),
    );
  });

  it("rejects a link on a host that is not allowlisted", async () => {
    mockRepo.create.mockResolvedValue(dbDeck);
    const res = await app.request("/api/v1/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Fury Aggro",
        format: "constructed",
        links: [{ url: "https://example.test/deck/42" }],
      }),
    });
    expect(res.status).toBe(400);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/decks/:id", () => {
  beforeEach(() => {
    mockRepo.getByIdForUser.mockReset();
    mockRepo.cardsForDeck.mockReset();
  });

  it("returns 200 with deck and cards", async () => {
    mockRepo.getByIdForUser.mockResolvedValue(dbDeck);
    mockRepo.cardsForDeck.mockResolvedValue([dbDeckCard]);
    const res = await app.request(`/api/v1/decks/${DECK_ID}`);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.deck.name).toBe("Fury Aggro");
    expect(json.cards).toHaveLength(1);
    expect(json.cards[0].cardId).toBe("c0000000-0001-4000-a000-000000000001");
    expect(json.cards[0].zone).toBe("main");
    expect(json.cards[0].quantity).toBe(4);
  });

  it("returns 404 when not found", async () => {
    mockRepo.getByIdForUser.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/decks/${DECK_ID}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/decks/:id", () => {
  beforeEach(() => {
    mockRepo.update.mockReset();
  });

  it("returns 200 with updated deck", async () => {
    const updated = { ...dbDeck, name: "Renamed" };
    mockRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/decks/${DECK_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.name).toBe("Renamed");
  });

  it("returns 404 when not found", async () => {
    mockRepo.update.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/decks/${DECK_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(404);
  });

  it("sets the home collection when the user can reach it", async () => {
    mockCollections.getAccessForUser.mockResolvedValue({
      collection: { id: COLLECTION_ID, groupId: null },
    });
    mockRepo.update.mockResolvedValue({ ...dbDeck, collectionId: COLLECTION_ID });
    const res = await app.request(`/api/v1/decks/${DECK_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId: COLLECTION_ID }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.collectionId).toBe(COLLECTION_ID);
  });

  it("returns 404 for a home collection the user cannot reach", async () => {
    mockCollections.getAccessForUser.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/decks/${DECK_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId: COLLECTION_ID }),
    });
    expect(res.status).toBe(404);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  // A group binder is communal — filling a deck from one would hand personal
  // copies to the group, so it can't be a deck box.
  it("rejects a group collection as the home collection", async () => {
    mockRepo.update.mockClear();
    mockCollections.getAccessForUser.mockResolvedValue({
      collection: { id: COLLECTION_ID, groupId: "d0000000-0001-4000-a000-000000000001" },
    });
    const res = await app.request(`/api/v1/decks/${DECK_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId: COLLECTION_ID }),
    });
    expect(res.status).toBe(400);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it("clears the home collection without an access check", async () => {
    mockCollections.getAccessForUser.mockClear();
    mockRepo.update.mockResolvedValue({ ...dbDeck, collectionId: null });
    const res = await app.request(`/api/v1/decks/${DECK_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId: null }),
    });
    expect(res.status).toBe(200);
    expect(mockCollections.getAccessForUser).not.toHaveBeenCalled();
    const json = await readJson(res);
    expect(json.collectionId).toBeNull();
  });
});

describe("DELETE /api/v1/decks/:id", () => {
  beforeEach(() => {
    mockRepo.deleteByIdForUser.mockReset();
  });

  it("returns 204 when deleted", async () => {
    mockRepo.deleteByIdForUser.mockResolvedValue({ numDeletedRows: 1n });
    const res = await app.request(`/api/v1/decks/${DECK_ID}`, { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  it("returns 404 when not found", async () => {
    mockRepo.deleteByIdForUser.mockResolvedValue({ numDeletedRows: 0n });
    const res = await app.request(`/api/v1/decks/${DECK_ID}`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/v1/decks/:id/cards", () => {
  beforeEach(() => {
    mockRepo.getIdAndFormat.mockReset();
    mockRepo.replaceCards.mockReset();
  });

  it("returns 200 with updated cards when replaced successfully", async () => {
    mockRepo.getIdAndFormat.mockResolvedValue({ id: DECK_ID, format: "freeform" });
    mockRepo.cardsForDeck.mockResolvedValue([]);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cards: [{ cardId: "c0000000-0001-4000-a000-000000000001", zone: "main", quantity: 4 }],
      }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.cards).toEqual([]);
  });

  it("returns 200 with empty cards array", async () => {
    mockRepo.getIdAndFormat.mockResolvedValue({ id: DECK_ID, format: "freeform" });
    mockRepo.cardsForDeck.mockResolvedValue([]);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards: [] }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 when deck not found", async () => {
    mockRepo.getIdAndFormat.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards: [] }),
    });
    expect(res.status).toBe(404);
  });

  it("saves incomplete constructed deck without validation error", async () => {
    mockRepo.getIdAndFormat.mockResolvedValue({ id: DECK_ID, format: "constructed" });
    mockRepo.cardsForDeck.mockResolvedValue([
      {
        cardId: "c0000000-0001-4000-a000-000000000001",
        zone: "main",
        quantity: 10,
        preferredPrintingId: null,
      },
    ]);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cards: [{ cardId: "c0000000-0001-4000-a000-000000000001", zone: "main", quantity: 10 }],
      }),
    });
    expect(res.status).toBe(200);
  });

  it("allows freeform deck without validation", async () => {
    mockRepo.getIdAndFormat.mockResolvedValue({ id: DECK_ID, format: "freeform" });
    mockRepo.cardsForDeck.mockResolvedValue([
      {
        cardId: "c0000000-0001-4000-a000-000000000001",
        zone: "main",
        quantity: 4,
        preferredPrintingId: null,
      },
    ]);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cards: [{ cardId: "c0000000-0001-4000-a000-000000000001", zone: "main", quantity: 4 }],
      }),
    });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/decks — wanted filter false", () => {
  beforeEach(() => {
    mockRepo.listForUser.mockReset();
  });

  it("passes includeArchived=false when query param absent", async () => {
    mockRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/v1/decks");
    expect(mockRepo.listForUser).toHaveBeenCalledWith(USER_ID, {
      includeArchived: false,
    });
  });

  it("passes includeArchived=false when query is not 'true'", async () => {
    mockRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/v1/decks?includeArchived=false");
    expect(mockRepo.listForUser).toHaveBeenCalledWith(USER_ID, {
      includeArchived: false,
    });
  });

  it("passes includeArchived=true when query says so", async () => {
    mockRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/v1/decks?includeArchived=true");
    expect(mockRepo.listForUser).toHaveBeenCalledWith(USER_ID, {
      includeArchived: true,
    });
  });
});

describe("POST /api/v1/decks — argument passing", () => {
  beforeEach(() => {
    mockRepo.create.mockReset();
  });

  it("passes defaults for optional fields", async () => {
    mockRepo.create.mockResolvedValue(dbDeck);
    await app.request("/api/v1/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Simple", format: "freeform" }),
    });
    expect(mockRepo.create).toHaveBeenCalledWith({
      userId: USER_ID,
      name: "Simple",
      description: null,
      format: "freeform",
      formatConfig: null,
      isPublic: false,
    });
  });
});

describe("PATCH /api/v1/decks/:id — field updates", () => {
  beforeEach(() => {
    mockRepo.update.mockReset();
  });

  it("updates format field", async () => {
    const updated = { ...dbDeck, format: "freeform" };
    mockRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/decks/${DECK_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "freeform" }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.format).toBe("freeform");
  });

  // isPublic is no longer patchable — a deck's public state is owned solely by
  // the /share sub-resource. A PATCH that includes isPublic must strip it and
  // apply only the real fields.
  it("ignores isPublic in PATCH (public state is controlled via /share)", async () => {
    const updated = { ...dbDeck, name: "Renamed" };
    mockRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/decks/${DECK_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed", isPublic: true }),
    });
    expect(res.status).toBe(200);
    expect(mockRepo.update).toHaveBeenCalledWith(DECK_ID, USER_ID, { name: "Renamed" });
  });

  it("updates description field", async () => {
    const updated = { ...dbDeck, description: "Aggro build" };
    mockRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/decks/${DECK_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Aggro build" }),
    });
    expect(res.status).toBe(200);
    expect(mockRepo.update).toHaveBeenCalledWith(DECK_ID, USER_ID, { description: "Aggro build" });
  });
});

describe("PUT /api/v1/decks/:id/cards — returned cards", () => {
  beforeEach(() => {
    mockRepo.getIdAndFormat.mockReset();
    mockRepo.replaceCards.mockReset();
    mockRepo.cardsForDeck.mockReset();
  });

  it("returns the replaced cards from cardsForDeck", async () => {
    mockRepo.getIdAndFormat.mockResolvedValue({ id: DECK_ID, format: "freeform" });
    mockRepo.replaceCards.mockResolvedValue(undefined);
    mockRepo.cardsForDeck.mockResolvedValue([dbDeckCard]);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cards: [{ cardId: "c0000000-0001-4000-a000-000000000001", zone: "main", quantity: 4 }],
      }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.cards).toHaveLength(1);
    expect(json.cards[0].cardId).toBe("c0000000-0001-4000-a000-000000000001");
    expect(json.cards[0].quantity).toBe(4);
  });

  it("calls replaceCards with the card data", async () => {
    mockRepo.getIdAndFormat.mockResolvedValue({ id: DECK_ID, format: "freeform" });
    mockRepo.replaceCards.mockResolvedValue(undefined);
    mockRepo.cardsForDeck.mockResolvedValue([]);
    const cards = [
      { cardId: "c0000000-0001-4000-a000-000000000001", zone: "main", quantity: 4 },
      { cardId: "c0000000-0002-4000-a000-000000000001", zone: "sideboard", quantity: 2 },
    ];
    await app.request(`/api/v1/decks/${DECK_ID}/cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards }),
    });
    expect(mockRepo.replaceCards).toHaveBeenCalledWith(
      DECK_ID,
      cards.map((card) => ({ ...card, preferredPrintingId: null })),
    );
  });
});

describe("GET /api/v1/decks/:id — card details", () => {
  beforeEach(() => {
    mockRepo.getByIdForUser.mockReset();
    mockRepo.cardsForDeck.mockReset();
  });

  it("returns empty cards array when deck has no cards", async () => {
    mockRepo.getByIdForUser.mockResolvedValue(dbDeck);
    mockRepo.cardsForDeck.mockResolvedValue([]);
    const res = await app.request(`/api/v1/decks/${DECK_ID}`);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.deck.id).toBe(DECK_ID);
    expect(json.cards).toEqual([]);
  });
});

describe("GET /api/v1/decks/:id/share", () => {
  beforeEach(() => {
    mockRepo.getShareState.mockReset();
  });

  it("reflects a shared deck", async () => {
    mockRepo.getShareState.mockResolvedValue({ shareToken: "AbCdEfGhIjKl", isPublic: true });
    const res = await app.request(`/api/v1/decks/${DECK_ID}/share`, { method: "GET" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.shareToken).toBe("AbCdEfGhIjKl");
    expect(json.isPublic).toBe(true);
  });

  it("returns { shareToken: null, isPublic: false } for an owned-but-unshared deck", async () => {
    mockRepo.getShareState.mockResolvedValue({ shareToken: null, isPublic: false });
    const res = await app.request(`/api/v1/decks/${DECK_ID}/share`, { method: "GET" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.shareToken).toBeNull();
    expect(json.isPublic).toBe(false);
  });

  it("returns 404 when the deck is not owned by the caller", async () => {
    mockRepo.getShareState.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/share`, { method: "GET" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/decks/:id/share", () => {
  beforeEach(() => {
    mockRepo.getShareState.mockReset();
    mockRepo.setShareToken.mockReset();
  });

  it("mints a fresh token and isPublic=true when the deck is unshared", async () => {
    mockRepo.getShareState.mockResolvedValue({ shareToken: null, isPublic: false });
    mockRepo.setShareToken.mockResolvedValue({ ...dbDeck, isPublic: true });
    const res = await app.request(`/api/v1/decks/${DECK_ID}/share`, { method: "POST" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.shareToken).toMatch(/^[A-Za-z0-9]{12}$/u);
    expect(json.isPublic).toBe(true);
    expect(mockRepo.setShareToken).toHaveBeenCalledWith(DECK_ID, USER_ID, json.shareToken, true);
  });

  it("is idempotent: returns the existing token without re-minting when already shared", async () => {
    mockRepo.getShareState.mockResolvedValue({ shareToken: "ExIsTiNg1234", isPublic: true });
    const res = await app.request(`/api/v1/decks/${DECK_ID}/share`, { method: "POST" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.shareToken).toBe("ExIsTiNg1234");
    expect(json.isPublic).toBe(true);
    // No new token is minted on the idempotent path.
    expect(mockRepo.setShareToken).not.toHaveBeenCalled();
  });

  it("returns 404 when the deck is not owned by the caller", async () => {
    mockRepo.getShareState.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/share`, { method: "POST" });
    expect(res.status).toBe(404);
    expect(mockRepo.setShareToken).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/decks/:id/share/rotate", () => {
  beforeEach(() => {
    mockRepo.setShareToken.mockReset();
  });

  it("mints a new token each call and sets isPublic=true", async () => {
    mockRepo.setShareToken.mockResolvedValue({ ...dbDeck, isPublic: true });
    const res1 = await app.request(`/api/v1/decks/${DECK_ID}/share/rotate`, { method: "POST" });
    expect(res1.status).toBe(200);
    const r1 = await readJson(res1);
    expect(r1.shareToken).toMatch(/^[A-Za-z0-9]{12}$/u);
    expect(r1.isPublic).toBe(true);
    expect(mockRepo.setShareToken).toHaveBeenCalledWith(DECK_ID, USER_ID, r1.shareToken, true);

    const res2 = await app.request(`/api/v1/decks/${DECK_ID}/share/rotate`, { method: "POST" });
    const r2 = await readJson(res2);
    expect(r2.shareToken).not.toBe(r1.shareToken);
  });

  it("returns 404 when the deck is not owned by the caller", async () => {
    mockRepo.setShareToken.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/share/rotate`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/decks/:id/share", () => {
  beforeEach(() => {
    mockRepo.setShareToken.mockReset();
  });

  it("returns 204 and nulls the token + isPublic=false", async () => {
    mockRepo.setShareToken.mockResolvedValue({ ...dbDeck, isPublic: false, shareToken: null });
    const res = await app.request(`/api/v1/decks/${DECK_ID}/share`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(mockRepo.setShareToken).toHaveBeenCalledWith(DECK_ID, USER_ID, null, false);
  });

  it("returns 404 when the deck is not owned by the caller", async () => {
    mockRepo.setShareToken.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/share`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/decks/share/:token/clone", () => {
  beforeEach(() => {
    mockRepo.cloneFromShareToken.mockReset();
  });

  it("returns 201 with the new deck id when the token resolves to a public deck", async () => {
    const cloned = { ...dbDeck, id: "a0000000-0001-4000-a000-000000000099" };
    mockRepo.cloneFromShareToken.mockResolvedValue(cloned);
    const res = await app.request("/api/v1/decks/share/abc123/clone", { method: "POST" });
    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json.deckId).toBe(cloned.id);
    expect(mockRepo.cloneFromShareToken).toHaveBeenCalledWith("abc123", USER_ID);
  });

  it("returns 404 when the token is missing or the deck is not public", async () => {
    mockRepo.cloneFromShareToken.mockResolvedValue(undefined);
    const res = await app.request("/api/v1/decks/share/unknown/clone", { method: "POST" });
    expect(res.status).toBe(404);
  });
});
