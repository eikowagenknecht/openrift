import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { adminTypographyReviewRouter } from "./typography-review";

const mockCatalog = {
  cards: vi.fn(),
  cardErrata: vi.fn(),
  printings: vi.fn(),
  printingById: vi.fn(),
};

const mockMutations = {
  updateCardById: vi.fn(),
  updatePrintingById: vi.fn(),
};

const mockCardErrata = {
  getByCardId: vi.fn(),
  upsert: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const CARD_ID = "a0000000-0001-4000-a000-0000000000aa";
const PRINTING_ID = "a0000000-0001-4000-a000-0000000000bb";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", {
    catalog: mockCatalog,
    catalogMutations: mockMutations,
    cardErrata: mockCardErrata,
    keywords: { listCostKeywords: vi.fn().mockResolvedValue(["Equip", "Repeat"]) },
  } as never);
  await next();
});
registerRouterForTest(app, adminTypographyReviewRouter);

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

describe("GET /api/admin/v1/typography-review", () => {
  it("flags an apostrophe in a card name", async () => {
    mockCatalog.cards.mockResolvedValue([{ ...baseCard, name: "Jinx's Wrath" }]);

    const res = await app.request("/api/admin/v1/typography-review");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.diffs).toContainEqual({
      target: { entity: "card", id: CARD_ID, field: "name" },
      name: "Jinx's Wrath",
      current: "Jinx's Wrath",
      proposed: "Jinx’s Wrath",
    });
  });

  it("flags an apostrophe in a card tag", async () => {
    mockCatalog.cards.mockResolvedValue([{ ...baseCard, tags: ["Hero's Quest", "Plain"] }]);

    const res = await app.request("/api/admin/v1/typography-review");
    const json = await readJson(res);
    expect(json.diffs).toContainEqual({
      target: { entity: "card", id: CARD_ID, field: "tags" },
      name: baseCard.name,
      current: "Hero's Quest, Plain",
      proposed: "Hero’s Quest, Plain",
    });
  });

  it("flags an apostrophe in a printing's printedName", async () => {
    mockCatalog.cards.mockResolvedValue([baseCard]);
    mockCatalog.printings.mockResolvedValue([{ ...basePrinting, printedName: "Jinx's Wrath" }]);

    const res = await app.request("/api/admin/v1/typography-review");
    const json = await readJson(res);
    expect(json.diffs).toContainEqual({
      target: { entity: "printing", id: PRINTING_ID, field: "printedName" },
      name: baseCard.name,
      current: "Jinx's Wrath",
      proposed: "Jinx’s Wrath",
    });
  });

  it("emits no diff when names and tags already use curly quotes", async () => {
    mockCatalog.cards.mockResolvedValue([
      { ...baseCard, name: "Jinx’s Wrath", tags: ["Hero’s Quest"] },
    ]);

    const res = await app.request("/api/admin/v1/typography-review");
    const json = await readJson(res);
    expect(json.diffs).toEqual([]);
  });
});

describe("POST /api/admin/v1/typography-review/accept", () => {
  it("updates card.name when entity=card and field=name", async () => {
    mockMutations.updateCardById.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/typography-review/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: { entity: "card", id: CARD_ID, field: "name" },
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

    const res = await app.request("/api/admin/v1/typography-review/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: { entity: "card", id: CARD_ID, field: "tags" },
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

    const res = await app.request("/api/admin/v1/typography-review/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: { entity: "card", id: CARD_ID, field: "tags" },
        proposed: "",
      }),
    });

    expect(res.status).toBe(404);
    expect(mockMutations.updateCardById).not.toHaveBeenCalled();
  });

  it("still routes errata fields through cardErrata.upsert", async () => {
    mockCardErrata.getByCardId.mockResolvedValue({
      cardId: CARD_ID,
      correctedRulesText: "old",
      correctedEffectText: null,
      source: null,
      sourceUrl: null,
      effectiveDate: null,
    });
    mockCardErrata.upsert.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/typography-review/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: { entity: "card", id: CARD_ID, field: "correctedRulesText" },
        proposed: "new’",
      }),
    });

    expect(res.status).toBe(204);
    expect(mockCardErrata.upsert).toHaveBeenCalled();
    expect(mockMutations.updateCardById).not.toHaveBeenCalled();
  });

  it("carries a set effective date through the errata upsert unchanged", async () => {
    mockCardErrata.getByCardId.mockResolvedValue({
      cardId: CARD_ID,
      correctedRulesText: "old",
      correctedEffectText: null,
      source: "riot-patch-notes",
      sourceUrl: null,
      effectiveDate: "2026-01-01",
    });
    mockCardErrata.upsert.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/typography-review/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: { entity: "card", id: CARD_ID, field: "correctedRulesText" },
        proposed: "new’",
      }),
    });

    expect(res.status).toBe(204);
    expect(mockCardErrata.upsert).toHaveBeenCalledWith(
      CARD_ID,
      expect.objectContaining({ effectiveDate: "2026-01-01", correctedRulesText: "new’" }),
    );
  });

  it("writes a printing field through the typed printing update", async () => {
    mockCatalog.printingById.mockResolvedValue(basePrinting);
    mockMutations.updatePrintingById.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/typography-review/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: { entity: "printing", id: PRINTING_ID, field: "flavorText" },
        proposed: "Jinx’s laugh",
      }),
    });

    expect(res.status).toBe(204);
    expect(mockMutations.updatePrintingById).toHaveBeenCalledWith(PRINTING_ID, {
      flavorText: "Jinx’s laugh",
    });
  });

  it("rejects a card field submitted against a printing", async () => {
    const res = await app.request("/api/admin/v1/typography-review/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: { entity: "printing", id: PRINTING_ID, field: "tags" },
        proposed: "anything",
      }),
    });

    expect(res.status).toBe(400);
    expect(mockCatalog.printingById).not.toHaveBeenCalled();
    expect(mockMutations.updatePrintingById).not.toHaveBeenCalled();
  });

  it("rejects an arbitrary printings column", async () => {
    const res = await app.request("/api/admin/v1/typography-review/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: { entity: "printing", id: PRINTING_ID, field: "cardId" },
        proposed: "a0000000-0001-4000-a000-0000000000cc",
      }),
    });

    expect(res.status).toBe(400);
    expect(mockMutations.updatePrintingById).not.toHaveBeenCalled();
  });
});
