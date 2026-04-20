import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { publicDecksRoute } from "./decks";

const mockRepo = {
  findByShareToken: vi.fn(
    () =>
      Promise.resolve(undefined) as Promise<
        { deck: Record<string, unknown>; ownerName: string | null } | undefined
      >,
  ),
  cardsForDeck: vi.fn(() => Promise.resolve([] as object[])),
};

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("repos", { decks: mockRepo } as never);
    await next();
  })
  .route("/api/v1", publicDecksRoute)
  .onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 404);
    }
    throw err;
  });

const DECK_ID = "a0000000-0001-4000-a000-000000000010";
const USER_ID = "a0000000-0001-4000-a000-000000000001";
const NOW = new Date("2026-04-20T00:00:00Z");

const dbDeck = {
  id: DECK_ID,
  userId: USER_ID,
  name: "Fury Aggro",
  description: "A fast opener",
  format: "constructed" as const,
  isWanted: false,
  isPublic: true,
  shareToken: "tok-abc",
  createdAt: NOW,
  updatedAt: NOW,
};

const dbCard = {
  cardId: "c0000000-0001-4000-a000-000000000001",
  zone: "main" as const,
  quantity: 4,
  preferredPrintingId: null,
};

describe("GET /api/v1/decks/share/:token", () => {
  beforeEach(() => {
    mockRepo.findByShareToken.mockReset();
    mockRepo.cardsForDeck.mockReset();
  });

  it("returns 200 with the public deck detail when the token resolves", async () => {
    mockRepo.findByShareToken.mockResolvedValue({ deck: dbDeck, ownerName: "Alice" });
    mockRepo.cardsForDeck.mockResolvedValue([dbCard]);

    const res = await app.request("/api/v1/decks/share/tok-abc");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deck.id).toBe(DECK_ID);
    expect(json.deck.name).toBe("Fury Aggro");
    expect(json.cards).toHaveLength(1);
    expect(json.cards[0].cardId).toBe(dbCard.cardId);
    expect(json.owner.displayName).toBe("Alice");
  });

  it("excludes owner-only fields (shareToken, isPublic) from the response", async () => {
    mockRepo.findByShareToken.mockResolvedValue({ deck: dbDeck, ownerName: "Alice" });
    mockRepo.cardsForDeck.mockResolvedValue([]);

    const res = await app.request("/api/v1/decks/share/tok-abc");
    const json = await res.json();
    expect(json.deck).not.toHaveProperty("shareToken");
    expect(json.deck).not.toHaveProperty("isPublic");
    expect(json.deck).not.toHaveProperty("userId");
  });

  it("falls back to 'Anonymous' when the owner has no display name", async () => {
    mockRepo.findByShareToken.mockResolvedValue({ deck: dbDeck, ownerName: null });
    mockRepo.cardsForDeck.mockResolvedValue([]);

    const res = await app.request("/api/v1/decks/share/tok-abc");
    const json = await res.json();
    expect(json.owner.displayName).toBe("Anonymous");
  });

  it("returns 404 when the token is not found or the deck is not public", async () => {
    mockRepo.findByShareToken.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/decks/share/unknown");
    expect(res.status).toBe(404);
    expect(mockRepo.cardsForDeck).not.toHaveBeenCalled();
  });

  it("passes the owner user id to cardsForDeck for defense-in-depth scoping", async () => {
    mockRepo.findByShareToken.mockResolvedValue({ deck: dbDeck, ownerName: "Alice" });
    mockRepo.cardsForDeck.mockResolvedValue([]);

    await app.request("/api/v1/decks/share/tok-abc");
    expect(mockRepo.cardsForDeck).toHaveBeenCalledWith(DECK_ID, USER_ID);
  });
});
