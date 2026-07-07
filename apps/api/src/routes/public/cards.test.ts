import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { cardsRouter } from "./cards";

const mockCatalogRepo = {
  cardBySlug: vi.fn(() => Promise.resolve(undefined as Record<string, unknown> | undefined)),
  printingsByCardId: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
  printingImagesByCardId: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
  cardBansByCardId: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
  cardErrataByCardId: vi.fn(() =>
    Promise.resolve(undefined as Record<string, unknown> | undefined),
  ),
  setsByIds: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
  markersList: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
};

const mockDistributionChannelsRepo = {
  listForPrintingIds: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
  listAll: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", {
    catalog: mockCatalogRepo,
    distributionChannels: mockDistributionChannelsRepo,
    // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
  } as any);
  await next();
});
registerRouterForTest(app, cardsRouter);

const CARD_ID = "c0000000-0001-4000-a000-000000000001";
const SET_ID = "s0000000-0001-4000-a000-000000000001";
const PRINTING_ID = "p0000000-0001-4000-a000-000000000001";

const dbCard = {
  id: CARD_ID,
  slug: "jinx-rebel",
  name: "Jinx, Rebel",
  type: "Unit",
  types: ["Unit"],
  superTypes: ["Champion"],
  domains: ["Chaos"],
  might: 5,
  energy: 5,
  power: null,
  keywords: [],
  tags: [],
  mightBonus: null,
};

const dbPrinting = {
  id: PRINTING_ID,
  shortCode: "OGN-202",
  setId: SET_ID,
  rarity: "Epic",
  artVariant: "normal",
  isSigned: false,
  markerSlugs: [],
  finish: "foil",
  size: "standard",
  artist: "Kudos Productions",
  publicCode: "OGN-202/298",
  printedRulesText: null,
  printedEffectText: null,
  flavorText: null,
  printedName: null,
  printedYear: 2025,
  language: "EN",
  comment: null,
  canonicalRank: 1,
  cardId: CARD_ID,
};

const dbSet = {
  id: SET_ID,
  slug: "OGN",
  name: "Origins",
  releasedAt: "2025-10-31",
  released: true,
  setType: "main" as const,
};

const dbBan = {
  formatId: "f0000000-0001-4000-a000-000000000001",
  formatName: "Constructed",
  bannedAt: "2026-01-15",
  reason: "Power level",
};

describe("GET /api/v1/cards/:cardSlug", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCatalogRepo.printingsByCardId.mockResolvedValue([]);
    mockCatalogRepo.printingImagesByCardId.mockResolvedValue([]);
    mockCatalogRepo.cardBansByCardId.mockResolvedValue([]);
    mockCatalogRepo.cardErrataByCardId.mockResolvedValue(undefined);
    mockCatalogRepo.setsByIds.mockResolvedValue([]);
    mockCatalogRepo.markersList.mockResolvedValue([]);
    mockDistributionChannelsRepo.listForPrintingIds.mockResolvedValue([]);
    mockDistributionChannelsRepo.listAll.mockResolvedValue([]);
  });

  it("returns 200 with the card, its printings, and sets", async () => {
    mockCatalogRepo.cardBySlug.mockResolvedValue(dbCard);
    mockCatalogRepo.printingsByCardId.mockResolvedValue([dbPrinting]);
    mockCatalogRepo.setsByIds.mockResolvedValue([dbSet]);

    const res = await app.request("/api/v1/cards/jinx-rebel");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.card.id).toBe(CARD_ID);
    expect(json.card.slug).toBe("jinx-rebel");
    expect(json.card.errata).toBeNull();
    expect(json.card.bans).toEqual([]);
    expect(json.printings).toHaveLength(1);
    expect(json.printings[0].id).toBe(PRINTING_ID);
    expect(json.printings[0].markers).toEqual([]);
    expect(json.printings[0].distributionChannels).toEqual([]);
    expect(json.printings[0].images).toEqual([]);
    expect(json.sets).toHaveLength(1);
    expect(json.sets[0].id).toBe(SET_ID);
  });

  it("maps bans onto the card response", async () => {
    mockCatalogRepo.cardBySlug.mockResolvedValue(dbCard);
    mockCatalogRepo.printingsByCardId.mockResolvedValue([dbPrinting]);
    mockCatalogRepo.setsByIds.mockResolvedValue([dbSet]);
    mockCatalogRepo.cardBansByCardId.mockResolvedValue([dbBan]);

    const res = await app.request("/api/v1/cards/jinx-rebel");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.card.bans).toHaveLength(1);
    expect(json.card.bans[0]).toMatchObject({
      formatId: dbBan.formatId,
      formatName: dbBan.formatName,
      bannedAt: dbBan.bannedAt,
      reason: dbBan.reason,
    });
  });

  it("maps errata onto the card response when present", async () => {
    mockCatalogRepo.cardBySlug.mockResolvedValue(dbCard);
    mockCatalogRepo.printingsByCardId.mockResolvedValue([dbPrinting]);
    mockCatalogRepo.setsByIds.mockResolvedValue([dbSet]);
    mockCatalogRepo.cardErrataByCardId.mockResolvedValue({
      correctedRulesText: "Corrected",
      correctedEffectText: null,
      source: "Riot",
      sourceUrl: null,
      effectiveDate: new Date("2026-01-01T00:00:00Z"),
    });

    const res = await app.request("/api/v1/cards/jinx-rebel");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.card.errata).toMatchObject({
      correctedRulesText: "Corrected",
      source: "Riot",
    });
  });

  it("returns NOT_FOUND for an unknown slug", async () => {
    mockCatalogRepo.cardBySlug.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/cards/does-not-exist");
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toBe("Card not found: does-not-exist");
    expect(mockCatalogRepo.printingsByCardId).not.toHaveBeenCalled();
  });
});

describe("cards route registration", () => {
  it("registers the card-detail route and serves a 200", async () => {
    const mountedApp = new Hono<{ Variables: Variables }>();
    mountedApp.use("*", async (c, next) => {
      c.set("repos", {
        catalog: mockCatalogRepo,
        distributionChannels: mockDistributionChannelsRepo,
        // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
      } as any);
      await next();
    });
    registerRouterForTest(mountedApp, cardsRouter);

    mockCatalogRepo.cardBySlug.mockResolvedValue(dbCard);
    mockCatalogRepo.printingsByCardId.mockResolvedValue([]);
    mockCatalogRepo.setsByIds.mockResolvedValue([]);

    const res = await mountedApp.request("/api/v1/cards/jinx-rebel");
    expect(res.status).toBe(200);
  });
});
