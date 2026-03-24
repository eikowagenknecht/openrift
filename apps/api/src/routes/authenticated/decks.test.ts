import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { decksRoute } from "./decks";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockRepo = {
  listForUser: vi.fn(() => Promise.resolve([] as object[])),
  create: vi.fn(() => Promise.resolve({} as object)),
  getByIdForUser: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  update: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  deleteByIdForUser: vi.fn(() => Promise.resolve({ numDeletedRows: 0n })),
  cardsWithDetails: vi.fn(() => Promise.resolve([] as object[])),
  getIdAndFormat: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  exists: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  cardRequirements: vi.fn(() => Promise.resolve([] as object[])),
  availableCopiesByCard: vi.fn(() => Promise.resolve([] as object[])),
  replaceCards: vi.fn(() => Promise.resolve()),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", { decks: mockRepo } as never);
    await next();
  })
  .route("/api", decksRoute)
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
  format: "standard",
  isWanted: false,
  isPublic: false,
  createdAt: now,
  updatedAt: now,
};

const dbDeckCard = {
  id: "a0000000-0001-4000-a000-000000000020",
  deckId: DECK_ID,
  cardId: "OGS-001",
  zone: "main",
  quantity: 4,
  cardName: "Fire Dragon",
  cardType: "Unit",
  domains: ["Fury"],
  energy: 5,
  might: 4,
  power: 6,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/decks", () => {
  beforeEach(() => {
    mockRepo.listForUser.mockReset();
  });

  it("returns 200 with list of decks", async () => {
    mockRepo.listForUser.mockResolvedValue([dbDeck]);
    const res = await app.request("/api/decks");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.decks).toHaveLength(1);
    expect(json.decks[0].name).toBe("Fury Aggro");
  });

  it("passes wanted filter", async () => {
    mockRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/decks?wanted=true");
    expect(mockRepo.listForUser).toHaveBeenCalledWith(USER_ID, true);
  });
});

describe("POST /api/decks", () => {
  beforeEach(() => {
    mockRepo.create.mockReset();
  });

  it("returns 201 with created deck", async () => {
    mockRepo.create.mockResolvedValue(dbDeck);
    const res = await app.request("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Fury Aggro", format: "standard" }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe("Fury Aggro");
  });

  it("creates with all optional fields", async () => {
    mockRepo.create.mockResolvedValue(dbDeck);
    const res = await app.request("/api/decks", {
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

describe("GET /api/decks/:id", () => {
  beforeEach(() => {
    mockRepo.getByIdForUser.mockReset();
    mockRepo.cardsWithDetails.mockReset();
  });

  it("returns 200 with deck and cards", async () => {
    mockRepo.getByIdForUser.mockResolvedValue(dbDeck);
    mockRepo.cardsWithDetails.mockResolvedValue([dbDeckCard]);
    const res = await app.request(`/api/decks/${DECK_ID}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deck.name).toBe("Fury Aggro");
    expect(json.cards).toHaveLength(1);
    expect(json.cards[0].cardId).toBe("OGS-001");
    expect(json.cards[0].zone).toBe("main");
    expect(json.cards[0].quantity).toBe(4);
  });

  it("returns 404 when not found", async () => {
    mockRepo.getByIdForUser.mockResolvedValue();
    const res = await app.request(`/api/decks/${DECK_ID}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/decks/:id", () => {
  beforeEach(() => {
    mockRepo.update.mockReset();
  });

  it("returns 200 with updated deck", async () => {
    const updated = { ...dbDeck, name: "Renamed" };
    mockRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/decks/${DECK_ID}`, {
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
    const res = await app.request(`/api/decks/${DECK_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/decks/:id", () => {
  beforeEach(() => {
    mockRepo.deleteByIdForUser.mockReset();
  });

  it("returns 204 when deleted", async () => {
    mockRepo.deleteByIdForUser.mockResolvedValue({ numDeletedRows: 1n });
    const res = await app.request(`/api/decks/${DECK_ID}`, { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  it("returns 404 when not found", async () => {
    mockRepo.deleteByIdForUser.mockResolvedValue({ numDeletedRows: 0n });
    const res = await app.request(`/api/decks/${DECK_ID}`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/decks/:id/cards", () => {
  beforeEach(() => {
    mockRepo.getIdAndFormat.mockReset();
    mockRepo.replaceCards.mockReset();
  });

  it("returns 204 when cards replaced successfully", async () => {
    mockRepo.getIdAndFormat.mockResolvedValue({ id: DECK_ID, format: "freeform" });
    const res = await app.request(`/api/decks/${DECK_ID}/cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cards: [{ cardId: "OGS-001", zone: "main", quantity: 4 }],
      }),
    });
    expect(res.status).toBe(204);
  });

  it("returns 204 with empty cards array", async () => {
    mockRepo.getIdAndFormat.mockResolvedValue({ id: DECK_ID, format: "freeform" });
    const res = await app.request(`/api/decks/${DECK_ID}/cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards: [] }),
    });
    expect(res.status).toBe(204);
  });

  it("returns 404 when deck not found", async () => {
    mockRepo.getIdAndFormat.mockResolvedValue();
    const res = await app.request(`/api/decks/${DECK_ID}/cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards: [] }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when standard deck has less than 40 main cards", async () => {
    mockRepo.getIdAndFormat.mockResolvedValue({ id: DECK_ID, format: "standard" });
    const res = await app.request(`/api/decks/${DECK_ID}/cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cards: [{ cardId: "OGS-001", zone: "main", quantity: 10 }],
      }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("at least 40");
  });

  it("returns 400 when standard deck has more than 8 sideboard cards", async () => {
    mockRepo.getIdAndFormat.mockResolvedValue({ id: DECK_ID, format: "standard" });
    const mainCards = Array.from({ length: 10 }, (_, i) => ({
      cardId: `card-${i}`,
      zone: "main",
      quantity: 4,
    }));
    const res = await app.request(`/api/decks/${DECK_ID}/cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cards: [...mainCards, { cardId: "side-1", zone: "sideboard", quantity: 9 }],
      }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("at most 8");
  });

  it("allows standard deck with valid counts", async () => {
    mockRepo.getIdAndFormat.mockResolvedValue({ id: DECK_ID, format: "standard" });
    const mainCards = Array.from({ length: 10 }, (_, i) => ({
      cardId: `card-${i}`,
      zone: "main",
      quantity: 4,
    }));
    const res = await app.request(`/api/decks/${DECK_ID}/cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cards: [...mainCards, { cardId: "side-1", zone: "sideboard", quantity: 8 }],
      }),
    });
    expect(res.status).toBe(204);
  });
});

describe("GET /api/decks/:id/availability", () => {
  beforeEach(() => {
    mockRepo.exists.mockReset();
    mockRepo.cardRequirements.mockReset();
    mockRepo.availableCopiesByCard.mockReset();
  });

  it("returns 200 with availability data", async () => {
    mockRepo.exists.mockResolvedValue({ id: DECK_ID });
    mockRepo.cardRequirements.mockResolvedValue([{ cardId: "OGS-001", zone: "main", quantity: 4 }]);
    mockRepo.availableCopiesByCard.mockResolvedValue([{ cardId: "OGS-001", count: 2 }]);
    const res = await app.request(`/api/decks/${DECK_ID}/availability`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.availability).toHaveLength(1);
    expect(json.availability[0].cardId).toBe("OGS-001");
    expect(json.availability[0].needed).toBe(4);
    expect(json.availability[0].owned).toBe(2);
    expect(json.availability[0].shortfall).toBe(2);
  });

  it("returns 0 shortfall when owned >= needed", async () => {
    mockRepo.exists.mockResolvedValue({ id: DECK_ID });
    mockRepo.cardRequirements.mockResolvedValue([{ cardId: "OGS-001", zone: "main", quantity: 2 }]);
    mockRepo.availableCopiesByCard.mockResolvedValue([{ cardId: "OGS-001", count: 5 }]);
    const res = await app.request(`/api/decks/${DECK_ID}/availability`);
    const json = await res.json();
    expect(json.availability[0].shortfall).toBe(0);
    expect(json.availability[0].owned).toBe(5);
  });

  it("returns 404 when deck not found", async () => {
    mockRepo.exists.mockResolvedValue();
    const res = await app.request(`/api/decks/${DECK_ID}/availability`);
    expect(res.status).toBe(404);
  });

  it("defaults owned to 0 when card not in available copies", async () => {
    mockRepo.exists.mockResolvedValue({ id: DECK_ID });
    mockRepo.cardRequirements.mockResolvedValue([
      { cardId: "UNKNOWN-001", zone: "main", quantity: 3 },
    ]);
    mockRepo.availableCopiesByCard.mockResolvedValue([]);
    const res = await app.request(`/api/decks/${DECK_ID}/availability`);
    const json = await res.json();
    expect(json.availability[0].owned).toBe(0);
    expect(json.availability[0].shortfall).toBe(3);
  });
});
