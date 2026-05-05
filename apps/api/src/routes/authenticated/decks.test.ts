import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { decksRoute } from "./decks";

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
  cardRequirements: vi.fn(() => Promise.resolve([] as object[])),
  availableCopiesByCard: vi.fn(() => Promise.resolve([] as object[])),
  replaceCards: vi.fn(() => Promise.resolve()),
  cloneDeck: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  setShareToken: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  findByShareToken: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  cloneFromShareToken: vi.fn(() => Promise.resolve(undefined as object | undefined)),
};

const mockMarketplace = {
  deckValues: vi.fn(() => Promise.resolve(new Map<string, number>())),
};

const mockUserPreferences = {
  getByUserId: vi.fn(() => Promise.resolve(undefined)),
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

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", {
      decks: mockRepo,
      marketplace: mockMarketplace,
      userPreferences: mockUserPreferences,
      enums: mockEnums,
    } as never);
    await next();
  })
  .route("/api/v1", decksRoute)
  .onError((err, c) => {
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
  isWanted: false,
  isPublic: false,
  shareToken: null,
  createdAt: now,
  updatedAt: now,
};

/** Slim deck card row (for cardsForDeck — detail/PUT endpoints). */
const dbDeckCard = {
  cardId: "c0000000-0001-4000-a000-000000000001",
  zone: "main",
  quantity: 4,
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
  });

  it("returns 200 with list of decks", async () => {
    mockRepo.listForUser.mockResolvedValue([dbDeck]);
    mockRepo.allCardsForUser.mockResolvedValue([dbDeckCardFull]);
    const res = await app.request("/api/v1/decks");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].deck.name).toBe("Fury Aggro");
    expect(json.items[0].totalCards).toBe(4);
    expect(json.items[0].typeCounts).toEqual([{ cardType: "unit", count: 4 }]);
    expect(json.items[0].isValid).toBe(false);
  });

  it("passes wanted filter", async () => {
    mockRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/v1/decks?wanted=true");
    expect(mockRepo.listForUser).toHaveBeenCalledWith(USER_ID, {
      wantedOnly: true,
      includeArchived: false,
    });
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
    const json = await res.json();
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
        isWanted: true,
        isPublic: true,
      }),
    });
    expect(res.status).toBe(201);
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
    const json = await res.json();
    expect(json.deck.name).toBe("Fury Aggro");
    expect(json.cards).toHaveLength(1);
    expect(json.cards[0].cardId).toBe("c0000000-0001-4000-a000-000000000001");
    expect(json.cards[0].zone).toBe("main");
    expect(json.cards[0].quantity).toBe(4);
  });

  it("returns 404 when not found", async () => {
    mockRepo.getByIdForUser.mockResolvedValue();
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
    const json = await res.json();
    expect(json.name).toBe("Renamed");
  });

  it("returns 404 when not found", async () => {
    mockRepo.update.mockResolvedValue();
    const res = await app.request(`/api/v1/decks/${DECK_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(404);
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
    const json = await res.json();
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
    mockRepo.getIdAndFormat.mockResolvedValue();
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
      { cardId: "c0000000-0001-4000-a000-000000000001", zone: "main", quantity: 10 },
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
      { cardId: "c0000000-0001-4000-a000-000000000001", zone: "main", quantity: 4 },
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

describe("GET /api/v1/decks/:id/availability", () => {
  beforeEach(() => {
    mockRepo.exists.mockReset();
    mockRepo.cardRequirements.mockReset();
    mockRepo.availableCopiesByCard.mockReset();
  });

  it("returns 200 with availability data", async () => {
    mockRepo.exists.mockResolvedValue({ id: DECK_ID });
    mockRepo.cardRequirements.mockResolvedValue([
      { cardId: "c0000000-0001-4000-a000-000000000001", zone: "main", quantity: 4 },
    ]);
    mockRepo.availableCopiesByCard.mockResolvedValue([
      { cardId: "c0000000-0001-4000-a000-000000000001", count: 2 },
    ]);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/availability`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].cardId).toBe("c0000000-0001-4000-a000-000000000001");
    expect(json.items[0].needed).toBe(4);
    expect(json.items[0].owned).toBe(2);
    expect(json.items[0].shortfall).toBe(2);
  });

  it("returns 0 shortfall when owned >= needed", async () => {
    mockRepo.exists.mockResolvedValue({ id: DECK_ID });
    mockRepo.cardRequirements.mockResolvedValue([
      { cardId: "c0000000-0001-4000-a000-000000000001", zone: "main", quantity: 2 },
    ]);
    mockRepo.availableCopiesByCard.mockResolvedValue([
      { cardId: "c0000000-0001-4000-a000-000000000001", count: 5 },
    ]);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/availability`);
    const json = await res.json();
    expect(json.items[0].shortfall).toBe(0);
    expect(json.items[0].owned).toBe(5);
  });

  it("returns 404 when deck not found", async () => {
    mockRepo.exists.mockResolvedValue();
    const res = await app.request(`/api/v1/decks/${DECK_ID}/availability`);
    expect(res.status).toBe(404);
  });

  it("defaults owned to 0 when card not in available copies", async () => {
    mockRepo.exists.mockResolvedValue({ id: DECK_ID });
    mockRepo.cardRequirements.mockResolvedValue([
      { cardId: "c0000000-0003-4000-a000-000000000001", zone: "main", quantity: 3 },
    ]);
    mockRepo.availableCopiesByCard.mockResolvedValue([]);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/availability`);
    const json = await res.json();
    expect(json.items[0].owned).toBe(0);
    expect(json.items[0].shortfall).toBe(3);
  });

  it("skips availableCopiesByCard when deck has no cards", async () => {
    mockRepo.exists.mockResolvedValue({ id: DECK_ID });
    mockRepo.cardRequirements.mockResolvedValue([]);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/availability`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toEqual([]);
    expect(mockRepo.availableCopiesByCard).not.toHaveBeenCalled();
  });

  it("returns availability for multiple cards with mixed ownership", async () => {
    mockRepo.exists.mockResolvedValue({ id: DECK_ID });
    mockRepo.cardRequirements.mockResolvedValue([
      { cardId: "c0000000-0001-4000-a000-000000000001", zone: "main", quantity: 4 },
      { cardId: "c0000000-0002-4000-a000-000000000001", zone: "sideboard", quantity: 2 },
    ]);
    mockRepo.availableCopiesByCard.mockResolvedValue([
      { cardId: "c0000000-0001-4000-a000-000000000001", count: 3 },
    ]);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/availability`);
    const json = await res.json();
    expect(json.items).toHaveLength(2);
    expect(json.items[0]).toEqual({
      cardId: "c0000000-0001-4000-a000-000000000001",
      zone: "main",
      needed: 4,
      owned: 3,
      shortfall: 1,
    });
    expect(json.items[1]).toEqual({
      cardId: "c0000000-0002-4000-a000-000000000001",
      zone: "sideboard",
      needed: 2,
      owned: 0,
      shortfall: 2,
    });
  });
});

describe("GET /api/v1/decks — wanted filter false", () => {
  beforeEach(() => {
    mockRepo.listForUser.mockReset();
  });

  it("passes wanted=false when query is not 'true'", async () => {
    mockRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/v1/decks?wanted=false");
    expect(mockRepo.listForUser).toHaveBeenCalledWith(USER_ID, {
      wantedOnly: false,
      includeArchived: false,
    });
  });

  it("passes wanted=false when query param absent", async () => {
    mockRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/v1/decks");
    expect(mockRepo.listForUser).toHaveBeenCalledWith(USER_ID, {
      wantedOnly: false,
      includeArchived: false,
    });
  });

  it("passes includeArchived=true when query says so", async () => {
    mockRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/v1/decks?includeArchived=true");
    expect(mockRepo.listForUser).toHaveBeenCalledWith(USER_ID, {
      wantedOnly: false,
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
      isWanted: false,
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
    const json = await res.json();
    expect(json.format).toBe("freeform");
  });

  it("updates isWanted field", async () => {
    const updated = { ...dbDeck, isWanted: true };
    mockRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/decks/${DECK_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isWanted: true }),
    });
    expect(res.status).toBe(200);
    expect(mockRepo.update).toHaveBeenCalledWith(DECK_ID, USER_ID, { isWanted: true });
  });

  it("updates isPublic field", async () => {
    const updated = { ...dbDeck, isPublic: true };
    mockRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/decks/${DECK_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: true }),
    });
    expect(res.status).toBe(200);
    expect(mockRepo.update).toHaveBeenCalledWith(DECK_ID, USER_ID, { isPublic: true });
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
    const json = await res.json();
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
    const json = await res.json();
    expect(json.deck.id).toBe(DECK_ID);
    expect(json.cards).toEqual([]);
  });
});

describe("POST /api/v1/decks/:id/share", () => {
  beforeEach(() => {
    mockRepo.setShareToken.mockReset();
  });

  it("returns 200 with a fresh share token and isPublic=true", async () => {
    const sharedDeck = { ...dbDeck, isPublic: true, shareToken: "will-be-replaced" };
    mockRepo.setShareToken.mockResolvedValue(sharedDeck);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/share`, { method: "POST" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.shareToken).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(json.isPublic).toBe(true);
    expect(mockRepo.setShareToken).toHaveBeenCalledWith(DECK_ID, USER_ID, json.shareToken, true);
  });

  it("returns 404 when the deck is not owned by the caller", async () => {
    mockRepo.setShareToken.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/decks/${DECK_ID}/share`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("mints a different token each call (rotation on re-share)", async () => {
    mockRepo.setShareToken.mockResolvedValue({ ...dbDeck, isPublic: true });
    const res1 = await app.request(`/api/v1/decks/${DECK_ID}/share`, { method: "POST" });
    const r1 = await res1.json();
    const res2 = await app.request(`/api/v1/decks/${DECK_ID}/share`, { method: "POST" });
    const r2 = await res2.json();
    expect(r1.shareToken).not.toBe(r2.shareToken);
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
    const json = await res.json();
    expect(json.deckId).toBe(cloned.id);
    expect(mockRepo.cloneFromShareToken).toHaveBeenCalledWith("abc123", USER_ID);
  });

  it("returns 404 when the token is missing or the deck is not public", async () => {
    mockRepo.cloneFromShareToken.mockResolvedValue(undefined);
    const res = await app.request("/api/v1/decks/share/unknown/clone", { method: "POST" });
    expect(res.status).toBe(404);
  });
});
