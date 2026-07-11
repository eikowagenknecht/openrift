/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildCandidateCardList,
  buildCardDetail,
  buildExport,
  buildUnmatchedDetail,
} from "../../../services/candidate-queries.js";
import { registerRouterForTest } from "../../../test/mount-router.js";
import type { Variables } from "../../../types.js";
import { adminCardQueriesRouter } from "./queries";

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

const mockMarketplaceMapping = {
  variantsForCard: vi.fn().mockResolvedValue([]),
};

// ---------------------------------------------------------------------------
// Test app — mount the oRPC router directly (without the requireAdmin gate).
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  // requireAdmin isn't mounted here; emulate the access it would resolve for
  // a full admin (handlers read it for card-review provider scoping).
  c.set("adminAccess", { isAdmin: true, sections: [] });
  c.set("repos", {
    candidateCards: mockCandidateCards,
    providerSettings: mockProviderSettings,
    marketplaceMapping: mockMarketplaceMapping,
  } as never);
  await next();
});
registerRouterForTest(app, adminCardQueriesRouter);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/v1/cards/all-cards", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with all cards", async () => {
    const cards = [
      {
        id: "card-1",
        slug: "fireball",
        name: "Fireball",
        type: "spell",
        types: ["spell"],
        setSlugs: ["ogn"],
      },
      { id: "card-2", slug: "bolt", name: "Bolt", type: "spell", types: ["spell"], setSlugs: [] },
    ];
    mockCandidateCards.listAllCards.mockResolvedValue(cards);

    const res = await app.request("/api/admin/v1/cards/all-cards");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(cards);
  });

  it("returns empty array when no cards exist", async () => {
    mockCandidateCards.listAllCards.mockResolvedValue([]);

    const res = await app.request("/api/admin/v1/cards/all-cards");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });
});

describe("GET /api/admin/v1/cards/provider-names", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with distinct provider names", async () => {
    mockCandidateCards.distinctProviderNames.mockResolvedValue(["gallery", "ocr"]);

    const res = await app.request("/api/admin/v1/cards/provider-names");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(["gallery", "ocr"]);
  });

  it("returns empty array when no providers exist", async () => {
    mockCandidateCards.distinctProviderNames.mockResolvedValue([]);

    const res = await app.request("/api/admin/v1/cards/provider-names");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });
});

describe("GET /api/admin/v1/cards/distinct-artists", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with distinct artist names", async () => {
    mockCandidateCards.distinctArtists.mockResolvedValue(["Jane Doe", "John Smith"]);

    const res = await app.request("/api/admin/v1/cards/distinct-artists");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(["Jane Doe", "John Smith"]);
  });
});

describe("GET /api/admin/v1/cards/provider-stats", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with provider statistics, coercing a Date lastUpdated to ISO", async () => {
    // The driver returns the `max(timestamptz)` as a native Date despite the
    // repo's `sql<string>` type; the handler coerces it to ISO for the schema.
    mockCandidateCards.providerStats.mockResolvedValue([
      {
        provider: "gallery",
        cardCount: 100,
        printingCount: 200,
        lastUpdated: new Date("2026-01-15T08:30:00.000Z"),
      },
    ]);

    const res = await app.request("/api/admin/v1/cards/provider-stats");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([
      {
        provider: "gallery",
        cardCount: 100,
        printingCount: 200,
        lastUpdated: "2026-01-15T08:30:00.000Z",
      },
    ]);
  });
});

describe("GET /api/admin/v1/cards (candidate list)", () => {
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
        setSlugs: ["ogn"],
        candidateCount: 1,
        uncheckedCardCount: 0,
        uncheckedPrintingCount: 0,
        hasFavorite: true,
        favoriteStagingShortCodes: [],
        suggestedCardSlug: null,
        hasUserSubmission: false,
      },
    ];
    mockBuildCandidateCardList.mockResolvedValue(candidates);

    const res = await app.request("/api/admin/v1/cards");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(candidates);
    expect(mockBuildCandidateCardList).toHaveBeenCalledWith(
      mockCandidateCards,
      expect.any(Set),
      null,
    );
  });
});

describe("GET /api/admin/v1/cards/export", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with export data", async () => {
    const exportData = [
      {
        card: {
          name: "Fireball",
          types: ["spell"],
          super_types: [],
          domains: [],
          might: null,
          energy: null,
          power: null,
          might_bonus: null,
          rules_text: null,
          effect_text: null,
          tags: [],
          short_code: "fireball",
          external_id: "card-1",
          extra_data: null,
        },
        printings: [],
      },
    ];
    mockBuildExport.mockResolvedValue(exportData);

    const res = await app.request("/api/admin/v1/cards/export");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(exportData);
    expect(mockBuildExport).toHaveBeenCalledWith(mockCandidateCards);
  });
});

describe("GET /api/admin/v1/cards/:cardSlug", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with candidate card detail", async () => {
    const detail = {
      card: {
        id: "card-1",
        slug: "fireball",
        name: "Fireball",
        type: "spell",
        types: ["spell"],
        superTypes: [],
        domains: [],
        might: null,
        energy: null,
        power: null,
        mightBonus: null,
        keywords: [],
        errata: null,
        tags: [],
        comment: null,
      },
      displayName: "Fireball",
      sources: [],
      printings: [],
      candidatePrintings: [],
      candidatePrintingGroups: [],
      expectedCardId: "OGN-001",
      printingImages: [],
      setTotals: {},
      marketplaceMappings: [],
    };
    mockBuildCandidateCardDetail.mockResolvedValue(detail);

    const res = await app.request("/api/admin/v1/cards/fireball");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.displayName).toBe("Fireball");
    expect(mockBuildCandidateCardDetail).toHaveBeenCalledWith(
      mockCandidateCards,
      mockMarketplaceMapping,
      "fireball",
      null,
    );
  });

  it("passes the correct cardSlug parameter", async () => {
    // oxlint-disable-next-line no-explicit-any -- partial detail fixture
    mockBuildCandidateCardDetail.mockResolvedValue({ card: null } as any);

    await app.request("/api/admin/v1/cards/abandon");

    expect(mockBuildCandidateCardDetail).toHaveBeenCalledWith(
      mockCandidateCards,
      mockMarketplaceMapping,
      "abandon",
      null,
    );
  });
});

describe("GET /api/admin/v1/cards/new/:name", () => {
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
    // oxlint-disable-next-line no-explicit-any -- partial detail fixture
    mockBuildUnmatchedDetail.mockResolvedValue(detail as any);

    const res = await app.request("/api/admin/v1/cards/new/newcard");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.displayName).toBe("New Card");
    expect(mockBuildUnmatchedDetail).toHaveBeenCalledWith(mockCandidateCards, "newcard", null);
  });

  it("decodes URI-encoded name parameter", async () => {
    // oxlint-disable-next-line no-explicit-any -- partial detail fixture
    mockBuildUnmatchedDetail.mockResolvedValue({ displayName: "Card Name" } as any);

    await app.request("/api/admin/v1/cards/new/card%20name");

    expect(mockBuildUnmatchedDetail).toHaveBeenCalledWith(mockCandidateCards, "card name", null);
  });

  it("handles special characters in name", async () => {
    // oxlint-disable-next-line no-explicit-any -- partial detail fixture
    mockBuildUnmatchedDetail.mockResolvedValue({ displayName: "Ki'Ryn" } as any);

    await app.request("/api/admin/v1/cards/new/ki%27ryn");

    expect(mockBuildUnmatchedDetail).toHaveBeenCalledWith(mockCandidateCards, "ki'ryn", null);
  });
});
