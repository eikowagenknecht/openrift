import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { promosRouter } from "./promos";

const mockCatalogRepo = {
  channelDistributedPrintings: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
  cardsByIds: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
  cardBansByCardIds: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
  cardErrataByCardIds: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
  printingImagesByPrintingIds: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
  markersList: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
};

const mockDistributionChannelsRepo = {
  listAll: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
  listForPrintingIds: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
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
registerRouterForTest(app, promosRouter);

const CARD_ID = "c0000000-0001-4000-a000-000000000001";
const SET_ID = "s0000000-0001-4000-a000-000000000001";
const PRINTING_ID = "p0000000-0001-4000-a000-000000000001";
const CHANNEL_ID = "ch000000-0001-4000-a000-000000000001";

const dbChannel = {
  id: CHANNEL_ID,
  slug: "nexus-night",
  label: "Nexus Night",
  description: null,
  kind: "event" as const,
  parentId: null,
  childrenLabel: null,
};

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

// One channel link for the printing, resolved by listForPrintingIds, so the
// rollup-count branch is exercised.
const dbChannelLink = {
  printingId: PRINTING_ID,
  channelId: CHANNEL_ID,
  channelSlug: "nexus-night",
  channelLabel: "Nexus Night",
  channelDescription: null,
  channelKind: "event",
  channelParentId: null,
  channelChildrenLabel: null,
  distributionNote: null,
};

describe("GET /api/v1/promos", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCatalogRepo.channelDistributedPrintings.mockResolvedValue([]);
    mockCatalogRepo.cardsByIds.mockResolvedValue([]);
    mockCatalogRepo.cardBansByCardIds.mockResolvedValue([]);
    mockCatalogRepo.cardErrataByCardIds.mockResolvedValue([]);
    mockCatalogRepo.printingImagesByPrintingIds.mockResolvedValue([]);
    mockCatalogRepo.markersList.mockResolvedValue([]);
    mockDistributionChannelsRepo.listAll.mockResolvedValue([]);
    mockDistributionChannelsRepo.listForPrintingIds.mockResolvedValue([]);
  });

  it("returns an empty payload when there are no channel-distributed printings", async () => {
    const res = await app.request("/api/v1/promos");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.channels).toEqual([]);
    expect(json.cards).toEqual({});
    expect(json.printings).toEqual([]);
  });

  it("returns channels, cards keyed by id, and printings with channel rollup counts", async () => {
    mockDistributionChannelsRepo.listAll.mockResolvedValue([dbChannel]);
    mockCatalogRepo.channelDistributedPrintings.mockResolvedValue([dbPrinting]);
    mockCatalogRepo.cardsByIds.mockResolvedValue([dbCard]);
    mockDistributionChannelsRepo.listForPrintingIds.mockResolvedValue([dbChannelLink]);

    const res = await app.request("/api/v1/promos");
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.channels).toHaveLength(1);
    expect(json.channels[0]).toMatchObject({
      id: CHANNEL_ID,
      slug: "nexus-night",
      cardCount: 1,
      printingCount: 1,
    });

    expect(Object.keys(json.cards)).toEqual([CARD_ID]);
    expect(json.cards[CARD_ID].slug).toBe("jinx-rebel");
    expect(json.cards[CARD_ID].errata).toBeNull();
    expect(json.cards[CARD_ID].bans).toEqual([]);

    expect(json.printings).toHaveLength(1);
    expect(json.printings[0].id).toBe(PRINTING_ID);
    expect(json.printings[0].distributionChannels).toHaveLength(1);
    expect(json.printings[0].distributionChannels[0].channel.id).toBe(CHANNEL_ID);
  });

  it("maps bans and errata onto the keyed cards", async () => {
    mockDistributionChannelsRepo.listAll.mockResolvedValue([dbChannel]);
    mockCatalogRepo.channelDistributedPrintings.mockResolvedValue([dbPrinting]);
    mockCatalogRepo.cardsByIds.mockResolvedValue([dbCard]);
    mockCatalogRepo.cardBansByCardIds.mockResolvedValue([
      {
        cardId: CARD_ID,
        formatId: "f0000000-0001-4000-a000-000000000001",
        formatName: "Constructed",
        bannedAt: "2026-01-15",
        reason: "Power level",
      },
    ]);
    mockCatalogRepo.cardErrataByCardIds.mockResolvedValue([
      {
        cardId: CARD_ID,
        correctedRulesText: "Corrected",
        correctedEffectText: null,
        source: "Riot",
        sourceUrl: null,
        effectiveDate: new Date("2026-01-01T00:00:00Z"),
      },
    ]);

    const res = await app.request("/api/v1/promos");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cards[CARD_ID].bans).toHaveLength(1);
    expect(json.cards[CARD_ID].bans[0].formatName).toBe("Constructed");
    expect(json.cards[CARD_ID].errata).toMatchObject({
      correctedRulesText: "Corrected",
      source: "Riot",
    });
  });
});

describe("promos route registration", () => {
  it("registers the promos route and serves a 200", async () => {
    const mountedApp = new Hono<{ Variables: Variables }>();
    mountedApp.use("*", async (c, next) => {
      c.set("repos", {
        catalog: mockCatalogRepo,
        distributionChannels: mockDistributionChannelsRepo,
        // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
      } as any);
      await next();
    });
    registerRouterForTest(mountedApp, promosRouter);

    mockCatalogRepo.channelDistributedPrintings.mockResolvedValue([]);
    mockDistributionChannelsRepo.listAll.mockResolvedValue([]);

    const res = await mountedApp.request("/api/v1/promos");
    expect(res.status).toBe(200);
  });
});
