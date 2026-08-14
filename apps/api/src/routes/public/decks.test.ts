import { WellKnown } from "@openrift/shared";
import { getDeckFromCode } from "@piltoverarchive/riftbound-deck-codes";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { publicDecksRouter } from "./decks";

const mockRepo = {
  findByShareToken: vi.fn(
    () =>
      Promise.resolve(undefined) as Promise<
        { deck: Record<string, unknown>; ownerName: string | null; ownerEmail: string } | undefined
      >,
  ),
  cardsForDeck: vi.fn(() => Promise.resolve([] as object[])),
};

const mockDeckPlansRepo = {
  getForDeck: vi.fn(() => Promise.resolve({ plan: undefined, matchups: [] as object[] })),
};

const mockCatalogRepo = {
  cardsByIds: vi.fn(() => Promise.resolve([] as object[])),
  cardBansByCardIds: vi.fn(() => Promise.resolve([] as { cardId: string; formatId: string }[])),
};

const mockCanonicalPrintingsRepo = {
  resolvePrintingMetaForRows: vi.fn(() => Promise.resolve([] as object[])),
  shortCodesForRows: vi.fn((rows: { cardId: string; preferredPrintingId: string | null }[]) =>
    Promise.resolve(
      rows.map((row) => ({
        cardId: row.cardId,
        preferredPrintingId: row.preferredPrintingId,
        shortCode: null as string | null,
      })),
    ),
  ),
};

const mockCustomTagsRepo = {
  assignmentsForCardIds: vi.fn(() => Promise.resolve(new Map<string, string[]>())),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", {
    decks: mockRepo,
    deckPlans: mockDeckPlansRepo,
    catalog: mockCatalogRepo,
    canonicalPrintings: mockCanonicalPrintingsRepo,
    customTags: mockCustomTagsRepo,
    // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
  } as any);
  await next();
});
registerRouterForTest(app, publicDecksRouter);

const DECK_ID = "a0000000-0001-4000-a000-000000000010";
const USER_ID = "a0000000-0001-4000-a000-000000000001";
const NOW = new Date("2026-04-20T00:00:00Z");

const dbDeck = {
  id: DECK_ID,
  userId: USER_ID,
  name: "Fury Aggro",
  description: "A fast opener",
  format: "constructed" as const,
  formatConfig: null,
  oddsConfig: null,
  isPublic: true,
  shareToken: "tok-abc",
  coverCardId: null,
  coverPrintingId: null,
  coverPosition: null,
  links: [],
  createdAt: NOW,
  updatedAt: NOW,
};

const dbCard = {
  cardId: "c0000000-0001-4000-a000-000000000001",
  zone: "main" as const,
  quantity: 4,
  preferredPrintingId: null,
};

const cardMeta = {
  id: dbCard.cardId,
  slug: "fury-aggro-legend",
  name: "Fury Aggro Legend",
  type: "legend",
  types: ["legend"],
  might: null,
  energy: null,
  power: null,
  mightBonus: null,
  maxCopiesOverride: null,
  keywords: [],
  tags: [],
  domains: ["fury"],
  superTypes: ["champion"],
  comment: null,
};

const printingMeta = {
  cardId: dbCard.cardId,
  preferredPrintingId: null,
  resolvedPrintingId: "p0000000-0001-4000-a000-000000000001",
  shortCode: "OGS-001",
  imageId: "abc",
};

describe("GET /api/v1/decks/share/:token", () => {
  beforeEach(() => {
    mockRepo.findByShareToken.mockReset();
    mockRepo.cardsForDeck.mockReset();
    mockCatalogRepo.cardsByIds.mockReset();
    mockCatalogRepo.cardsByIds.mockResolvedValue([]);
    mockCanonicalPrintingsRepo.resolvePrintingMetaForRows.mockReset();
    mockCanonicalPrintingsRepo.resolvePrintingMetaForRows.mockResolvedValue([]);
    mockCustomTagsRepo.assignmentsForCardIds.mockReset();
    mockCustomTagsRepo.assignmentsForCardIds.mockResolvedValue(new Map());
    mockCatalogRepo.cardBansByCardIds.mockReset();
    mockCatalogRepo.cardBansByCardIds.mockResolvedValue([]);
  });

  it("marks a base-banned card so the share page can validate bans", async () => {
    mockRepo.findByShareToken.mockResolvedValue({
      deck: dbDeck,
      ownerName: "Alice",
      ownerEmail: "alice@example.com",
    });
    mockRepo.cardsForDeck.mockResolvedValue([dbCard]);
    mockCatalogRepo.cardsByIds.mockResolvedValue([cardMeta]);
    mockCanonicalPrintingsRepo.resolvePrintingMetaForRows.mockResolvedValue([printingMeta]);
    mockCatalogRepo.cardBansByCardIds.mockResolvedValue([
      { cardId: dbCard.cardId, formatId: WellKnown.banFormat.CONSTRUCTED },
    ]);

    const json = await readJson(await app.request("/api/v1/decks/share/tok-abc"));
    expect(json.cards[0].banned).toBe(true);
  });

  it("leaves a mode-scoped ban off the card, since it does not invalidate a deck", async () => {
    mockRepo.findByShareToken.mockResolvedValue({
      deck: dbDeck,
      ownerName: "Alice",
      ownerEmail: "alice@example.com",
    });
    mockRepo.cardsForDeck.mockResolvedValue([dbCard]);
    mockCatalogRepo.cardsByIds.mockResolvedValue([cardMeta]);
    mockCanonicalPrintingsRepo.resolvePrintingMetaForRows.mockResolvedValue([printingMeta]);
    mockCatalogRepo.cardBansByCardIds.mockResolvedValue([
      { cardId: dbCard.cardId, formatId: WellKnown.banFormat.TWO_V_TWO },
    ]);

    const json = await readJson(await app.request("/api/v1/decks/share/tok-abc"));
    expect(json.cards[0].banned).toBe(false);
  });

  it("returns 200 with the enriched public deck detail when the token resolves", async () => {
    mockRepo.findByShareToken.mockResolvedValue({
      deck: dbDeck,
      ownerName: "Alice",
      ownerEmail: "alice@example.com",
    });
    mockRepo.cardsForDeck.mockResolvedValue([dbCard]);
    mockCatalogRepo.cardsByIds.mockResolvedValue([cardMeta]);
    mockCanonicalPrintingsRepo.resolvePrintingMetaForRows.mockResolvedValue([printingMeta]);

    const res = await app.request("/api/v1/decks/share/tok-abc");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.deck.id).toBe(DECK_ID);
    expect(json.deck.name).toBe("Fury Aggro");
    expect(json.cards).toHaveLength(1);
    expect(json.cards[0]).toMatchObject({
      cardId: dbCard.cardId,
      cardName: cardMeta.name,
      cardSlug: cardMeta.slug,
      cardType: cardMeta.type,
      resolvedPrintingId: printingMeta.resolvedPrintingId,
      shortCode: printingMeta.shortCode,
      imageId: printingMeta.imageId,
    });
    expect(json.owner.displayName).toBe("Alice");
  });

  it("excludes owner-only fields (shareToken, isPublic) from the response", async () => {
    mockRepo.findByShareToken.mockResolvedValue({
      deck: dbDeck,
      ownerName: "Alice",
      ownerEmail: "alice@example.com",
    });
    mockRepo.cardsForDeck.mockResolvedValue([]);

    const res = await app.request("/api/v1/decks/share/tok-abc");
    const json = await readJson(res);
    expect(json.deck).not.toHaveProperty("shareToken");
    expect(json.deck).not.toHaveProperty("isPublic");
    expect(json.deck).not.toHaveProperty("userId");
  });

  it("falls back to 'Anonymous' when the owner has no display name", async () => {
    mockRepo.findByShareToken.mockResolvedValue({
      deck: dbDeck,
      ownerName: null,
      ownerEmail: "alice@example.com",
    });
    mockRepo.cardsForDeck.mockResolvedValue([]);

    const res = await app.request("/api/v1/decks/share/tok-abc");
    const json = await readJson(res);
    expect(json.owner.displayName).toBe("Anonymous");
  });

  it("returns 404 when the token is not found or the deck is not public", async () => {
    mockRepo.findByShareToken.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/decks/share/unknown");
    expect(res.status).toBe(404);
    expect(mockRepo.cardsForDeck).not.toHaveBeenCalled();
  });

  it("passes the owner user id to cardsForDeck for defense-in-depth scoping", async () => {
    mockRepo.findByShareToken.mockResolvedValue({
      deck: dbDeck,
      ownerName: "Alice",
      ownerEmail: "alice@example.com",
    });
    mockRepo.cardsForDeck.mockResolvedValue([]);

    await app.request("/api/v1/decks/share/tok-abc");
    expect(mockRepo.cardsForDeck).toHaveBeenCalledWith(DECK_ID, USER_ID);
  });
});

describe("POST /api/v1/decks/encode", () => {
  // Sequential short codes (already 3-digit, so they round-trip through the
  // Piltover codec unchanged), or null for cards listed in `missing`.
  function stubShortCodes(missing = new Set<string>()) {
    mockCanonicalPrintingsRepo.shortCodesForRows.mockImplementation((rows) =>
      Promise.resolve(
        rows.map((row, index) => ({
          cardId: row.cardId,
          preferredPrintingId: row.preferredPrintingId,
          shortCode: missing.has(row.cardId) ? null : `OGN-00${index + 1}`,
        })),
      ),
    );
  }

  const encodeCards = [
    {
      cardId: "leg",
      zone: "legend",
      quantity: 1,
      preferredPrintingId: null,
      cardName: "The Legend",
      cardType: "legend",
      superTypes: [],
      domains: ["fury"],
    },
    {
      cardId: "champ",
      zone: "champion",
      quantity: 1,
      preferredPrintingId: null,
      cardName: "A Champion",
      cardType: "unit",
      superTypes: ["champion"],
      domains: ["fury"],
    },
    {
      cardId: "unit-a",
      zone: "main",
      quantity: 3,
      preferredPrintingId: null,
      cardName: "Unit A",
      cardType: "unit",
      superTypes: [],
      domains: ["fury"],
    },
  ];

  function encodeRequest(body: unknown) {
    return app.request("/api/v1/decks/encode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    mockCanonicalPrintingsRepo.shortCodesForRows.mockReset();
    stubShortCodes();
  });

  it("encodes a Piltover deck code (default format) that decodes back to the cards", async () => {
    const res = await encodeRequest({ cards: encodeCards });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.warnings).toEqual([]);

    const decoded = getDeckFromCode(json.code);
    // Champion is counted into mainDeck (+1) and marked as the chosen champion.
    expect(decoded.chosenChampion).toBe("OGN-002");
    const mainCounts = new Map(
      decoded.mainDeck.map((card: { cardCode: string; count: number }) => [
        card.cardCode,
        card.count,
      ]),
    );
    expect(mainCounts.get("OGN-001")).toBe(1); // legend
    expect(mainCounts.get("OGN-002")).toBe(1); // champion marker
    expect(mainCounts.get("OGN-003")).toBe(3); // unit A x3
  });

  it("encodes the human-readable text format", async () => {
    const res = await encodeRequest({ format: "text", cards: encodeCards });
    const json = await readJson(res);
    expect(json.code).toContain("Legend:");
    expect(json.code).toContain("MainDeck:");
    expect(json.code).toContain("3 Unit A");
  });

  it("warns about cards with no resolvable short code", async () => {
    stubShortCodes(new Set(["unit-a"]));
    const res = await encodeRequest({ format: "tts", cards: encodeCards });
    const json = await readJson(res);
    expect(json.warnings).toEqual([`Skipped "Unit A": no canonical printing found`]);
    expect(json.code).not.toContain("OGN-003");
  });

  it("rejects a malformed payload with a 4xx", async () => {
    const res = await encodeRequest({ cards: [{ cardId: "x" }] });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
