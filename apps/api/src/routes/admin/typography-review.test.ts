import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { typographyReviewRoute } from "./typography-review";

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockCatalog = {
  cards: vi.fn(),
  cardErrata: vi.fn(),
  printings: vi.fn(),
  printingById: vi.fn(),
};

const mockMutations = {
  updateCardById: vi.fn(),
  getCardErrata: vi.fn(),
  upsertCardErrata: vi.fn(),
  updatePrintingFieldById: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const CARD_ID = "a0000000-0001-4000-a000-0000000000aa";
const PRINTING_ID = "a0000000-0001-4000-a000-0000000000bb";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", { catalog: mockCatalog, candidateMutations: mockMutations } as never);
    await next();
  })
  .route("/api/v1", typographyReviewRoute);

const baseCard = {
  id: CARD_ID,
  slug: "card-001",
  name: "Plain Name",
  type: "unit",
  might: null,
  energy: null,
  power: null,
  mightBonus: null,
  keywords: [],
  tags: [],
  comment: null,
  domains: [],
  superTypes: [],
};

const basePrinting = {
  id: PRINTING_ID,
  cardId: CARD_ID,
  setId: "set-id",
  shortCode: "SET-001",
  rarity: "common",
  artVariant: "normal",
  isSigned: false,
  finish: "normal",
  artist: "Artist",
  publicCode: "SET-001",
  printedRulesText: null,
  printedEffectText: null,
  flavorText: null,
  printedName: null,
  printedYear: null,
  language: "EN",
  markerSlugs: [],
  comment: null,
  canonicalRank: 0,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockCatalog.cardErrata.mockResolvedValue([]);
  mockCatalog.printings.mockResolvedValue([]);
});

describe("GET /api/v1/typography-review", () => {
  it("flags an apostrophe in a card name", async () => {
    mockCatalog.cards.mockResolvedValue([{ ...baseCard, name: "Jinx's Wrath" }]);

    const res = await app.request("/api/v1/typography-review");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.diffs).toContainEqual({
      entity: "card",
      id: CARD_ID,
      name: "Jinx's Wrath",
      field: "name",
      current: "Jinx's Wrath",
      proposed: "Jinx’s Wrath",
    });
  });

  it("flags an apostrophe in a card tag", async () => {
    mockCatalog.cards.mockResolvedValue([{ ...baseCard, tags: ["Hero's Quest", "Plain"] }]);

    const res = await app.request("/api/v1/typography-review");
    const json = await res.json();
    expect(json.diffs).toContainEqual({
      entity: "card",
      id: CARD_ID,
      name: baseCard.name,
      field: "tags",
      current: "Hero's Quest, Plain",
      proposed: "Hero’s Quest, Plain",
    });
  });

  it("flags an apostrophe in a printing's printedName", async () => {
    mockCatalog.cards.mockResolvedValue([baseCard]);
    mockCatalog.printings.mockResolvedValue([{ ...basePrinting, printedName: "Jinx's Wrath" }]);

    const res = await app.request("/api/v1/typography-review");
    const json = await res.json();
    expect(json.diffs).toContainEqual({
      entity: "printing",
      id: PRINTING_ID,
      name: baseCard.name,
      field: "printedName",
      current: "Jinx's Wrath",
      proposed: "Jinx’s Wrath",
    });
  });

  it("emits no diff when names and tags already use curly quotes", async () => {
    mockCatalog.cards.mockResolvedValue([
      { ...baseCard, name: "Jinx’s Wrath", tags: ["Hero’s Quest"] },
    ]);

    const res = await app.request("/api/v1/typography-review");
    const json = await res.json();
    expect(json.diffs).toEqual([]);
  });
});

describe("POST /api/v1/typography-review/accept", () => {
  it("updates card.name when entity=card and field=name", async () => {
    mockMutations.updateCardById.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/typography-review/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "card",
        id: CARD_ID,
        field: "name",
        proposed: "Jinx’s Wrath",
      }),
    });

    expect(res.status).toBe(204);
    expect(mockMutations.updateCardById).toHaveBeenCalledWith(CARD_ID, {
      name: "Jinx’s Wrath",
    });
  });

  it("re-derives the tags array from current DB state on accept", async () => {
    mockCatalog.cards.mockResolvedValue([{ ...baseCard, tags: ["Hero's Quest", "Plain"] }]);
    mockMutations.updateCardById.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/typography-review/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "card",
        id: CARD_ID,
        field: "tags",
        proposed: "ignored-by-server",
      }),
    });

    expect(res.status).toBe(204);
    expect(mockMutations.updateCardById).toHaveBeenCalledWith(CARD_ID, {
      tags: ["Hero’s Quest", "Plain"],
    });
  });

  it("returns 404 when accepting tags for an unknown card", async () => {
    mockCatalog.cards.mockResolvedValue([]);

    const res = await app.request("/api/v1/typography-review/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "card",
        id: CARD_ID,
        field: "tags",
        proposed: "",
      }),
    });

    expect(res.status).toBe(404);
    expect(mockMutations.updateCardById).not.toHaveBeenCalled();
  });

  it("still routes errata fields through upsertCardErrata", async () => {
    mockMutations.getCardErrata.mockResolvedValue({
      cardId: CARD_ID,
      correctedRulesText: "old",
      correctedEffectText: null,
      source: null,
      sourceUrl: null,
      effectiveDate: null,
    });
    mockMutations.upsertCardErrata.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/typography-review/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "card",
        id: CARD_ID,
        field: "correctedRulesText",
        proposed: "new’",
      }),
    });

    expect(res.status).toBe(204);
    expect(mockMutations.upsertCardErrata).toHaveBeenCalled();
    expect(mockMutations.updateCardById).not.toHaveBeenCalled();
  });
});
