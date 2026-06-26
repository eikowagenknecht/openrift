import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { Hono } from "hono";
import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildApiContext } from "../../orpc/context.js";
import type { Variables } from "../../types.js";
import { setsRouter } from "./sets";

const mockCatalogRepo = {
  sets: vi.fn(() => Promise.resolve([] as object[])),
  setCoverImageIds: vi.fn(() => Promise.resolve(new Map<string, string>())),
  setCountsAll: vi.fn(() =>
    Promise.resolve(new Map<string, { cardCount: number; printingCount: number }>()),
  ),
  setBySlug: vi.fn(
    () => Promise.resolve(undefined) as Promise<Record<string, unknown> | undefined>,
  ),
  printingsBySetId: vi.fn(() => Promise.resolve([] as object[])),
  printingImagesBySetId: vi.fn(() => Promise.resolve([] as object[])),
  cardsByIds: vi.fn(() => Promise.resolve([] as object[])),
  cardBansByCardIds: vi.fn(() => Promise.resolve([] as object[])),
  cardErrataByCardIds: vi.fn(() => Promise.resolve([] as object[])),
  markersList: vi.fn(() => Promise.resolve([] as object[])),
};

const mockDistributionChannelsRepo = {
  listForPrintingIds: vi.fn(() => Promise.resolve([] as object[])),
  listAll: vi.fn(() => Promise.resolve([] as object[])),
};

const handler = new OpenAPIHandler(setsRouter);

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", {
    catalog: mockCatalogRepo,
    distributionChannels: mockDistributionChannelsRepo,
    // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
  } as any);
  await next();
});

const handle = async (c: Context<{ Variables: Variables }>) => {
  const { matched, response } = await handler.handle(c.req.raw, { context: buildApiContext(c) });
  if (matched && response) {
    return response;
  }
  return c.notFound();
};

for (const path of ["/api/v1/sets", "/api/v1/sets/:setSlug"]) {
  app.all(path, handle);
}

const SET_ID = "019cfc3b-0369-7890-a450-7859471cc3f6";
const CARD_ID = "019cfc3b-0389-744b-837c-792fd586300e";
const PRINTING_ID = "019cfc3b-03d3-7dac-86c9-27900cd43727";

const dbSet = {
  id: SET_ID,
  slug: "OGN",
  name: "Origins",
  releasedAt: "2025-10-31",
  released: true,
  setType: "main" as const,
};

const dbCard = {
  id: CARD_ID,
  slug: "jinx-rebel",
  name: "Jinx, Rebel",
  type: "Unit",
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

describe("GET /api/v1/sets", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with sets, counts, and cover image ids merged in", async () => {
    mockCatalogRepo.sets.mockResolvedValue([dbSet]);
    mockCatalogRepo.setCoverImageIds.mockResolvedValue(new Map([[SET_ID, "img-1"]]));
    mockCatalogRepo.setCountsAll.mockResolvedValue(
      new Map([[SET_ID, { cardCount: 312, printingCount: 468 }]]),
    );

    const res = await app.request("/api/v1/sets");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sets).toHaveLength(1);
    expect(json.sets[0]).toMatchObject({
      id: SET_ID,
      slug: "OGN",
      cardCount: 312,
      printingCount: 468,
      coverImageId: "img-1",
    });
  });

  it("defaults counts to 0 and cover image to null when missing", async () => {
    mockCatalogRepo.sets.mockResolvedValue([dbSet]);
    mockCatalogRepo.setCoverImageIds.mockResolvedValue(new Map());
    mockCatalogRepo.setCountsAll.mockResolvedValue(new Map());

    const res = await app.request("/api/v1/sets");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sets[0]).toMatchObject({
      cardCount: 0,
      printingCount: 0,
      coverImageId: null,
    });
  });
});

describe("GET /api/v1/sets/:setSlug", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCatalogRepo.markersList.mockResolvedValue([]);
    mockDistributionChannelsRepo.listForPrintingIds.mockResolvedValue([]);
    mockDistributionChannelsRepo.listAll.mockResolvedValue([]);
  });

  it("returns 200 with the set, its cards keyed by id, and its printings", async () => {
    mockCatalogRepo.setBySlug.mockResolvedValue(dbSet);
    mockCatalogRepo.printingsBySetId.mockResolvedValue([dbPrinting]);
    mockCatalogRepo.printingImagesBySetId.mockResolvedValue([
      { printingId: PRINTING_ID, face: "front", imageId: "abc" },
    ]);
    mockCatalogRepo.cardsByIds.mockResolvedValue([dbCard]);
    mockCatalogRepo.cardBansByCardIds.mockResolvedValue([]);
    mockCatalogRepo.cardErrataByCardIds.mockResolvedValue([]);

    const res = await app.request("/api/v1/sets/OGN");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.set.id).toBe(SET_ID);
    expect(json.cards[CARD_ID]).toMatchObject({ slug: "jinx-rebel", errata: null, bans: [] });
    expect(json.printings).toHaveLength(1);
    expect(json.printings[0]).toMatchObject({
      id: PRINTING_ID,
      shortCode: "OGN-202",
      markers: [],
      distributionChannels: [],
    });
    expect(json.printings[0].images).toEqual([{ face: "front", imageId: "abc" }]);
    expect(mockCatalogRepo.setBySlug).toHaveBeenCalledWith("OGN");
  });

  it("returns 404 with the not-found message for an unknown slug", async () => {
    mockCatalogRepo.setBySlug.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/sets/missing");
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toBe("Set not found: missing");
    expect(mockCatalogRepo.printingsBySetId).not.toHaveBeenCalled();
  });
});
