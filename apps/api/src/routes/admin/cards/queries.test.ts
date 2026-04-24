/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildCandidateCardList,
  buildExport,
  buildCardDetail,
  buildUnmatchedDetail,
} from "../../../services/candidate-queries.js";
import { queriesRoute } from "./queries";

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

vi.mock("../../../services/candidate-queries.js", () => ({
  buildCandidateCardList: vi.fn(),
  buildExport: vi.fn(),
  buildCardDetail: vi.fn(),
  buildUnmatchedDetail: vi.fn(),
}));

const mockBuildCandidateCardList = vi.mocked(buildCandidateCardList);
const mockBuildExport = vi.mocked(buildExport);
const mockBuildCandidateCardDetail = vi.mocked(buildCardDetail);
const mockBuildUnmatchedDetail = vi.mocked(buildUnmatchedDetail);

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockCandidateCards = {
  listAllCards: vi.fn(),
  distinctProviderNames: vi.fn(),
  distinctArtists: vi.fn(),
  providerStats: vi.fn(),
};

const mockProviderSettings = {
  favoriteProviders: vi.fn().mockResolvedValue(new Set(["gallery"])),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const mockMarketplaceMapping = {
  variantsForCard: vi.fn().mockResolvedValue([]),
};

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", {
      candidateCards: mockCandidateCards,
      providerSettings: mockProviderSettings,
      marketplaceMapping: mockMarketplaceMapping,
    } as never);
    await next();
  })
  .route("/api/v1", queriesRoute);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/all-cards", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with all cards", async () => {
    const cards = [
      { id: "card-1", slug: "fireball", name: "Fireball", type: "Spell" },
      { id: "card-2", slug: "bolt", name: "Bolt", type: "Spell" },
    ];
    mockCandidateCards.listAllCards.mockResolvedValue(cards);

    const res = await app.request("/api/v1/all-cards");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(cards);
  });

  it("returns empty array when no cards exist", async () => {
    mockCandidateCards.listAllCards.mockResolvedValue([]);

    const res = await app.request("/api/v1/all-cards");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });
});

describe("GET /api/v1/provider-names", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with distinct provider names", async () => {
    mockCandidateCards.distinctProviderNames.mockResolvedValue(["gallery", "ocr"]);

    const res = await app.request("/api/v1/provider-names");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(["gallery", "ocr"]);
  });

  it("returns empty array when no providers exist", async () => {
    mockCandidateCards.distinctProviderNames.mockResolvedValue([]);

    const res = await app.request("/api/v1/provider-names");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });
});

describe("GET /api/v1/distinct-artists", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with distinct artist names", async () => {
    mockCandidateCards.distinctArtists.mockResolvedValue(["Jane Doe", "John Smith"]);

    const res = await app.request("/api/v1/distinct-artists");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(["Jane Doe", "John Smith"]);
  });
});

describe("GET /api/v1/provider-stats", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with provider statistics", async () => {
    const stats = [
      { provider: "gallery", cardCount: 100, printingCount: 200, lastUpdated: "2026-01-15" },
    ];
    mockCandidateCards.providerStats.mockResolvedValue(stats);

    const res = await app.request("/api/v1/provider-stats");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(stats);
  });
});

describe("GET /api/v1/", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with candidate card list", async () => {
    mockProviderSettings.favoriteProviders.mockResolvedValue(new Set(["gallery"]));
    const candidates = [
      {
        cardSlug: "fireball",
        name: "Fireball",
        normalizedName: "fireball",
        shortCodes: ["OGN-001"],
        stagingShortCodes: [],
        candidateCount: 1,
        uncheckedCardCount: 0,
        uncheckedPrintingCount: 0,
        hasFavorite: true,
        favoriteStagingShortCodes: [],
        suggestedCardSlug: null,
      },
    ];
    mockBuildCandidateCardList.mockResolvedValue(candidates);

    const res = await app.request("/api/v1");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(candidates);
    expect(mockBuildCandidateCardList).toHaveBeenCalledWith(mockCandidateCards, expect.any(Set));
  });
});

describe("GET /api/v1/export", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with export data", async () => {
    const exportData = [
      {
        card: { name: "Fireball", type: "Spell" },
        printings: [],
      },
    ];
    mockBuildExport.mockResolvedValue(exportData as any);

    const res = await app.request("/api/v1/export");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(exportData);
    expect(mockBuildExport).toHaveBeenCalledWith(mockCandidateCards);
  });
});

describe("GET /api/v1/:cardSlug", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with candidate card detail", async () => {
    const detail = {
      card: { id: "card-1", slug: "fireball", name: "Fireball" },
      displayName: "Fireball",
      sources: [],
      printings: [],
      candidatePrintings: [],
      candidatePrintingGroups: [],
      expectedCardId: "OGN-001",
      printingImages: [],
      setTotals: {},
    };
    mockBuildCandidateCardDetail.mockResolvedValue(detail as any);

    const res = await app.request("/api/v1/fireball");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.displayName).toBe("Fireball");
    expect(mockBuildCandidateCardDetail).toHaveBeenCalledWith(
      mockCandidateCards,
      mockMarketplaceMapping,
      "fireball",
    );
  });

  it("passes the correct cardSlug parameter", async () => {
    mockBuildCandidateCardDetail.mockResolvedValue({ card: null } as any);

    await app.request("/api/v1/abandon");

    expect(mockBuildCandidateCardDetail).toHaveBeenCalledWith(
      mockCandidateCards,
      mockMarketplaceMapping,
      "abandon",
    );
  });
});

describe("GET /api/v1/new/:name", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with unmatched detail", async () => {
    const detail = {
      displayName: "New Card",
      sources: [],
      candidatePrintings: [],
      candidatePrintingGroups: [],
      defaultCardId: "",
      setTotals: {},
    };
    mockBuildUnmatchedDetail.mockResolvedValue(detail as any);

    const res = await app.request("/api/v1/new/newcard");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.displayName).toBe("New Card");
    expect(mockBuildUnmatchedDetail).toHaveBeenCalledWith(mockCandidateCards, "newcard");
  });

  it("decodes URI-encoded name parameter", async () => {
    mockBuildUnmatchedDetail.mockResolvedValue({ displayName: "Card Name" } as any);

    await app.request("/api/v1/new/card%20name");

    expect(mockBuildUnmatchedDetail).toHaveBeenCalledWith(mockCandidateCards, "card name");
  });

  it("handles special characters in name", async () => {
    mockBuildUnmatchedDetail.mockResolvedValue({ displayName: "Ki'Ryn" } as any);

    await app.request("/api/v1/new/ki%27ryn");

    expect(mockBuildUnmatchedDetail).toHaveBeenCalledWith(mockCandidateCards, "ki'ryn");
  });
});
