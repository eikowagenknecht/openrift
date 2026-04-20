/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { describe, expect, it, vi, beforeEach } from "vitest";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias
import { AppError } from "../errors.js";
import {
  buildCandidateCardList,
  buildExport,
  buildCardDetail,
  buildUnmatchedDetail,
} from "./candidate-queries.js";

// ---------------------------------------------------------------------------
// Mock repo factory
// ---------------------------------------------------------------------------

function createMockRepo(overrides: Record<string, unknown> = {}) {
  return {
    listCardsForSourceList: vi.fn().mockResolvedValue([]),
    listCandidateCardsForSourceList: vi.fn().mockResolvedValue([]),
    listPrintingsForSourceList: vi.fn().mockResolvedValue([]),
    listCandidatePrintingsForSourceList: vi.fn().mockResolvedValue([]),
    listAliasesForSourceList: vi.fn().mockResolvedValue([]),
    exportCards: vi.fn().mockResolvedValue([]),
    exportPrintings: vi.fn().mockResolvedValue([]),
    exportCardErrata: vi.fn().mockResolvedValue([]),
    cardForDetailBySlug: vi.fn().mockResolvedValue(undefined),
    cardErrataForDetail: vi.fn().mockResolvedValue(null),
    cardNameAliases: vi.fn().mockResolvedValue([]),
    candidateCardsForDetail: vi.fn().mockResolvedValue([]),
    candidatePrintingsForDetail: vi.fn().mockResolvedValue([]),
    printingsForDetail: vi.fn().mockResolvedValue([]),
    setInfoByIds: vi.fn().mockResolvedValue([]),
    setPrintedTotalBySlugs: vi.fn().mockResolvedValue([]),
    markerSlugsByIds: vi.fn().mockResolvedValue([]),
    distributionChannelSlugsForPrintings: vi.fn().mockResolvedValue([]),
    printingImagesForDetail: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as any;
}

function createMockMarketplaceRepo(overrides: Record<string, unknown> = {}) {
  return {
    variantsForCard: vi.fn().mockResolvedValue([]),
    stagingCandidatesForCard: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as any;
}

const mpRepo = () => createMockMarketplaceRepo();

// ---------------------------------------------------------------------------
// buildCandidateCardList
// ---------------------------------------------------------------------------

describe("buildCandidateCardList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns empty array when no cards or candidates exist", async () => {
    const repo = createMockRepo();
    const result = await buildCandidateCardList(repo, new Set(["gallery"]));
    expect(result).toEqual([]);
  });

  it("returns cards with matched candidate groups", async () => {
    const repo = createMockRepo({
      listCardsForSourceList: vi
        .fn()
        .mockResolvedValue([
          { id: "card-1", slug: "fireball", name: "Fireball", normName: "fireball" },
        ]),
      listCandidateCardsForSourceList: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          normName: "fireball",
          name: "Fireball",
          provider: "gallery",
          checkedAt: null,
        },
      ]),
      listPrintingsForSourceList: vi
        .fn()
        .mockResolvedValue([{ cardId: "card-1", shortCode: "OGN-001", language: "EN" }]),
      listCandidatePrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listAliasesForSourceList: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCandidateCardList(repo, new Set(["gallery"]));

    expect(result).toHaveLength(1);
    expect(result[0].cardSlug).toBe("fireball");
    expect(result[0].name).toBe("Fireball");
    expect(result[0].shortCodes).toEqual(["OGN-001"]);
    expect(result[0].candidateCount).toBe(1);
    expect(result[0].hasFavorite).toBe(true);
    expect(result[0].uncheckedCardCount).toBe(1);
  });

  it("matches candidate cards via aliases", async () => {
    const repo = createMockRepo({
      listCardsForSourceList: vi
        .fn()
        .mockResolvedValue([
          { id: "card-1", slug: "fireball", name: "Fireball", normName: "fireball" },
        ]),
      listCandidateCardsForSourceList: vi
        .fn()
        .mockResolvedValue([
          { id: "cc-1", normName: "firebal", name: "Firebal", provider: "ocr", checkedAt: null },
        ]),
      listPrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listCandidatePrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listAliasesForSourceList: vi
        .fn()
        .mockResolvedValue([{ normName: "firebal", cardId: "card-1" }]),
    });

    const result = await buildCandidateCardList(repo, new Set(["gallery"]));

    expect(result).toHaveLength(1);
    expect(result[0].cardSlug).toBe("fireball");
    expect(result[0].candidateCount).toBe(1);
  });

  it("reports unmatched candidate groups with null cardSlug", async () => {
    const repo = createMockRepo({
      listCardsForSourceList: vi.fn().mockResolvedValue([]),
      listCandidateCardsForSourceList: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          normName: "newcard",
          name: "New Card",
          provider: "gallery",
          checkedAt: null,
        },
      ]),
      listPrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listCandidatePrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listAliasesForSourceList: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCandidateCardList(repo, new Set(["gallery"]));

    expect(result).toHaveLength(1);
    expect(result[0].cardSlug).toBeNull();
    expect(result[0].name).toBe("New Card");
    expect(result[0].normalizedName).toBe("newcard");
  });

  it("counts unchecked printings across a candidate group", async () => {
    const repo = createMockRepo({
      listCardsForSourceList: vi
        .fn()
        .mockResolvedValue([
          { id: "card-1", slug: "fireball", name: "Fireball", normName: "fireball" },
        ]),
      listCandidateCardsForSourceList: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          normName: "fireball",
          name: "Fireball",
          provider: "gallery",
          checkedAt: null,
        },
      ]),
      listPrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listCandidatePrintingsForSourceList: vi.fn().mockResolvedValue([
        { candidateCardId: "cc-1", shortCode: "OGN-001", checkedAt: null, printingId: null },
        {
          candidateCardId: "cc-1",
          shortCode: "OGN-002",
          checkedAt: new Date(),
          printingId: null,
        },
        {
          candidateCardId: "cc-1",
          shortCode: "OGN-003",
          checkedAt: null,
          printingId: "printing-1",
        },
      ]),
      listAliasesForSourceList: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCandidateCardList(repo, new Set(["gallery"]));

    // OGN-001 (unchecked, unlinked) + OGN-003 (unchecked, linked) = 2
    expect(result[0].uncheckedPrintingCount).toBe(2);
    // stagingShortCodes still only includes unlinked printings
    expect(result[0].stagingShortCodes).toEqual(["OGN-001"]);
  });

  it("collects staging short codes only for unchecked unlinked candidate printings", async () => {
    const repo = createMockRepo({
      listCardsForSourceList: vi
        .fn()
        .mockResolvedValue([{ id: "card-1", slug: "bolt", name: "Bolt", normName: "bolt" }]),
      listCandidateCardsForSourceList: vi
        .fn()
        .mockResolvedValue([
          { id: "cc-1", normName: "bolt", name: "Bolt", provider: "ocr", checkedAt: null },
        ]),
      listPrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listCandidatePrintingsForSourceList: vi.fn().mockResolvedValue([
        { candidateCardId: "cc-1", shortCode: "SFD-100", checkedAt: null, printingId: null },
        { candidateCardId: "cc-1", shortCode: "SFD-101", checkedAt: null, printingId: null },
        {
          candidateCardId: "cc-1",
          shortCode: "SFD-102",
          checkedAt: new Date(),
          printingId: null,
        },
      ]),
      listAliasesForSourceList: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCandidateCardList(repo, new Set(["gallery"]));

    expect(result[0].stagingShortCodes).toEqual(["SFD-100", "SFD-101"]);
  });

  it("merges multiple candidate groups from aliases and direct match", async () => {
    const repo = createMockRepo({
      listCardsForSourceList: vi
        .fn()
        .mockResolvedValue([
          { id: "card-1", slug: "fireball", name: "Fireball", normName: "fireball" },
        ]),
      listCandidateCardsForSourceList: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          normName: "fireball",
          name: "Fireball",
          provider: "gallery",
          checkedAt: null,
        },
        { id: "cc-2", normName: "firebal", name: "Firebal", provider: "ocr", checkedAt: null },
      ]),
      listPrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listCandidatePrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listAliasesForSourceList: vi
        .fn()
        .mockResolvedValue([{ normName: "firebal", cardId: "card-1" }]),
    });

    const result = await buildCandidateCardList(repo, new Set(["gallery"]));

    expect(result).toHaveLength(1);
    expect(result[0].candidateCount).toBe(2);
  });

  it("returns suggestedCardSlug for unmatched entries matching card prefix", async () => {
    const repo = createMockRepo({
      listCardsForSourceList: vi
        .fn()
        .mockResolvedValue([
          { id: "card-1", slug: "fireball", name: "Fireball", normName: "fireball" },
        ]),
      listCandidateCardsForSourceList: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          normName: "fireballultimate",
          name: "Fireball Ultimate",
          provider: "gallery",
          checkedAt: null,
        },
      ]),
      listPrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listCandidatePrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listAliasesForSourceList: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCandidateCardList(repo, new Set(["gallery"]));

    expect(result).toHaveLength(2);
    const unmatched = result.find((r) => r.cardSlug === null);
    expect(unmatched?.suggestedCardSlug).toBe("fireball");
  });

  it("returns null suggestedCardSlug when no prefix match found", async () => {
    const repo = createMockRepo({
      listCardsForSourceList: vi
        .fn()
        .mockResolvedValue([
          { id: "card-1", slug: "fireball", name: "Fireball", normName: "fireball" },
        ]),
      listCandidateCardsForSourceList: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          normName: "zzznomatch",
          name: "No Match",
          provider: "gallery",
          checkedAt: null,
        },
      ]),
      listPrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listCandidatePrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listAliasesForSourceList: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCandidateCardList(repo, new Set(["gallery"]));
    const unmatched = result.find((r) => r.cardSlug === null);
    expect(unmatched?.suggestedCardSlug).toBeNull();
  });

  it("prefers longest normName prefix for suggested card slug", async () => {
    const repo = createMockRepo({
      listCardsForSourceList: vi.fn().mockResolvedValue([
        { id: "card-1", slug: "fire", name: "Fire", normName: "fire" },
        { id: "card-2", slug: "fireball", name: "Fireball", normName: "fireball" },
      ]),
      listCandidateCardsForSourceList: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          normName: "fireballultimate",
          name: "Fireball Ultimate",
          provider: "gallery",
          checkedAt: null,
        },
      ]),
      listPrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listCandidatePrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listAliasesForSourceList: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCandidateCardList(repo, new Set(["gallery"]));
    const unmatched = result.find((r) => r.cardSlug === null);
    expect(unmatched?.suggestedCardSlug).toBe("fireball");
  });

  it("handles multiple printings on the same card", async () => {
    const repo = createMockRepo({
      listCardsForSourceList: vi
        .fn()
        .mockResolvedValue([{ id: "card-1", slug: "bolt", name: "Bolt", normName: "bolt" }]),
      listCandidateCardsForSourceList: vi.fn().mockResolvedValue([]),
      listPrintingsForSourceList: vi.fn().mockResolvedValue([
        { cardId: "card-1", shortCode: "OGN-001", language: "EN" },
        { cardId: "card-1", shortCode: "OGN-002", language: "EN" },
      ]),
      listCandidatePrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listAliasesForSourceList: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCandidateCardList(repo, new Set(["gallery"]));

    expect(result[0].shortCodes).toEqual(["OGN-001", "OGN-002"]);
    expect(result[0].candidateCount).toBe(0);
    expect(result[0].hasFavorite).toBe(false);
  });

  it("reports hasFavorite false when no favorite provider", async () => {
    const repo = createMockRepo({
      listCardsForSourceList: vi
        .fn()
        .mockResolvedValue([{ id: "card-1", slug: "bolt", name: "Bolt", normName: "bolt" }]),
      listCandidateCardsForSourceList: vi
        .fn()
        .mockResolvedValue([
          { id: "cc-1", normName: "bolt", name: "Bolt", provider: "ocr", checkedAt: null },
        ]),
      listPrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listCandidatePrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listAliasesForSourceList: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCandidateCardList(repo, new Set(["gallery"]));
    expect(result[0].hasFavorite).toBe(false);
  });

  it("counts unchecked candidate cards only from favorite providers", async () => {
    const repo = createMockRepo({
      listCardsForSourceList: vi
        .fn()
        .mockResolvedValue([{ id: "card-1", slug: "bolt", name: "Bolt", normName: "bolt" }]),
      listCandidateCardsForSourceList: vi.fn().mockResolvedValue([
        { id: "cc-1", normName: "bolt", name: "Bolt", provider: "gallery", checkedAt: new Date() },
        { id: "cc-2", normName: "bolt", name: "Bolt", provider: "ocr", checkedAt: null },
      ]),
      listPrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listCandidatePrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listAliasesForSourceList: vi.fn().mockResolvedValue([]),
    });

    // "gallery" is checked, "ocr" is not a favorite, so unchecked count is 0
    const result = await buildCandidateCardList(repo, new Set(["gallery"]));
    expect(result[0].uncheckedCardCount).toBe(0);

    // With both as favorites, "ocr" is unchecked so count is 1
    const result2 = await buildCandidateCardList(repo, new Set(["gallery", "ocr"]));
    expect(result2[0].uncheckedCardCount).toBe(1);
  });

  it("handles card with no candidate group (null group)", async () => {
    const repo = createMockRepo({
      listCardsForSourceList: vi
        .fn()
        .mockResolvedValue([{ id: "card-1", slug: "bolt", name: "Bolt", normName: "bolt" }]),
      listCandidateCardsForSourceList: vi.fn().mockResolvedValue([]),
      listPrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listCandidatePrintingsForSourceList: vi.fn().mockResolvedValue([]),
      listAliasesForSourceList: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCandidateCardList(repo, new Set(["gallery"]));

    expect(result[0].candidateCount).toBe(0);
    expect(result[0].stagingShortCodes).toEqual([]);
    expect(result[0].uncheckedCardCount).toBe(0);
    expect(result[0].uncheckedPrintingCount).toBe(0);
    expect(result[0].hasFavorite).toBe(false);
    expect(result[0].suggestedCardSlug).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildExport
// ---------------------------------------------------------------------------

describe("buildExport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns empty array when no cards exist", async () => {
    const repo = createMockRepo();
    const result = await buildExport(repo);
    expect(result).toEqual([]);
  });

  it("maps card fields to snake_case export format", async () => {
    const repo = createMockRepo({
      exportCards: vi.fn().mockResolvedValue([
        {
          id: "card-1",
          slug: "OGN-001",
          name: "Fireball",
          type: "Spell",
          superTypes: [],
          domains: ["Fury"],
          might: 3,
          energy: 2,
          power: null,
          mightBonus: null,
          tags: ["burn"],
        },
      ]),
      exportPrintings: vi.fn().mockResolvedValue([]),
      exportCardErrata: vi.fn().mockResolvedValue([
        {
          cardId: "card-1",
          correctedRulesText: "Deal damage",
          correctedEffectText: null,
        },
      ]),
    });

    const result = await buildExport(repo);

    expect(result).toHaveLength(1);
    expect(result[0].card).toEqual({
      name: "Fireball",
      type: "Spell",
      super_types: [],
      domains: ["Fury"],
      might: 3,
      energy: 2,
      power: null,
      might_bonus: null,
      rules_text: "Deal damage",
      effect_text: null,
      tags: ["burn"],
      short_code: "OGN-001",
      external_id: "card-1",
      extra_data: null,
    });
  });

  it("maps printings to snake_case with image_url preference", async () => {
    const repo = createMockRepo({
      exportCards: vi.fn().mockResolvedValue([
        {
          id: "card-1",
          slug: "OGN-001",
          name: "Fireball",
          type: "Spell",
          superTypes: [],
          domains: ["Fury"],
          might: 3,
          energy: 2,
          power: null,
          mightBonus: null,
          tags: [],
        },
      ]),
      exportPrintings: vi.fn().mockResolvedValue([
        {
          id: "p-1",
          cardId: "card-1",
          shortCode: "OGN-001",
          setSlug: "origin",
          setName: "Origin Set",
          rarity: "Rare",
          artVariant: "normal",
          isSigned: false,
          finish: "normal",
          artist: "Jane Doe",
          publicCode: "001",
          printedRulesText: "Deal damage",
          printedEffectText: null,
          flavorText: "Burn it",
          originalUrl: "http://orig.com/img.jpg",
          rehostedUrl: null,
          imageId: null,
        },
      ]),
    });

    const result = await buildExport(repo);

    expect(result[0].printings).toHaveLength(1);
    expect(result[0].printings[0].image_url).toBe("http://orig.com/img.jpg");
    expect(result[0].printings[0].extra_data).toBeNull();
  });

  it("prefers originalUrl over rehostedUrl for image_url", async () => {
    const repo = createMockRepo({
      exportCards: vi.fn().mockResolvedValue([
        {
          id: "card-1",
          slug: "OGN-001",
          name: "X",
          type: "Unit",
          superTypes: [],
          domains: ["Fury"],
          might: 1,
          energy: 1,
          power: 1,
          mightBonus: null,
          tags: [],
        },
      ]),
      exportPrintings: vi.fn().mockResolvedValue([
        {
          id: "p-1",
          cardId: "card-1",
          shortCode: "OGN-001",
          setSlug: "origin",
          setName: "Origin",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          finish: "normal",
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          originalUrl: "http://orig.com",
          rehostedUrl: "http://rehost.com",
          imageId: null,
        },
      ]),
    });

    const result = await buildExport(repo);
    expect(result[0].printings[0].image_url).toBe("http://orig.com");
  });

  it("falls back to rehostedUrl when originalUrl is null", async () => {
    const repo = createMockRepo({
      exportCards: vi.fn().mockResolvedValue([
        {
          id: "card-1",
          slug: "OGN-001",
          name: "X",
          type: "Unit",
          superTypes: [],
          domains: ["Fury"],
          might: 1,
          energy: 1,
          power: 1,
          mightBonus: null,
          tags: [],
        },
      ]),
      exportPrintings: vi.fn().mockResolvedValue([
        {
          id: "p-1",
          cardId: "card-1",
          shortCode: "OGN-001",
          setSlug: "origin",
          setName: "Origin",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          finish: "normal",
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          originalUrl: null,
          rehostedUrl: "http://rehost.com",
          imageId: null,
        },
      ]),
    });

    const result = await buildExport(repo);
    expect(result[0].printings[0].image_url).toBe("http://rehost.com");
  });

  it("returns null image_url when both originalUrl and rehostedUrl are null", async () => {
    const repo = createMockRepo({
      exportCards: vi.fn().mockResolvedValue([
        {
          id: "card-1",
          slug: "X",
          name: "X",
          type: "Unit",
          superTypes: [],
          domains: ["Fury"],
          might: 1,
          energy: 1,
          power: 1,
          mightBonus: null,
          tags: [],
        },
      ]),
      exportPrintings: vi.fn().mockResolvedValue([
        {
          id: "p-1",
          cardId: "card-1",
          shortCode: "X-001",
          setSlug: "x",
          setName: "X",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          finish: "normal",
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          originalUrl: null,
          rehostedUrl: null,
          imageId: null,
        },
      ]),
    });

    const result = await buildExport(repo);
    expect(result[0].printings[0].image_url).toBeNull();
  });

  it("includes imageId in extra_data when present", async () => {
    const repo = createMockRepo({
      exportCards: vi.fn().mockResolvedValue([
        {
          id: "card-1",
          slug: "X",
          name: "X",
          type: "Unit",
          superTypes: [],
          domains: ["Fury"],
          might: 1,
          energy: 1,
          power: 1,
          mightBonus: null,
          tags: [],
        },
      ]),
      exportPrintings: vi.fn().mockResolvedValue([
        {
          id: "p-1",
          cardId: "card-1",
          shortCode: "X-001",
          setSlug: "x",
          setName: "X",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          finish: "normal",
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          originalUrl: null,
          rehostedUrl: null,
          imageId: "img-123",
        },
      ]),
    });

    const result = await buildExport(repo);
    expect(result[0].printings[0].extra_data).toEqual({ image_id: "img-123" });
  });

  it("groups printings by card id", async () => {
    const repo = createMockRepo({
      exportCards: vi.fn().mockResolvedValue([
        {
          id: "card-1",
          slug: "C1",
          name: "C1",
          type: "Unit",
          superTypes: [],
          domains: ["Fury"],
          might: 1,
          energy: 1,
          power: null,
          mightBonus: null,
          tags: [],
        },
        {
          id: "card-2",
          slug: "C2",
          name: "C2",
          type: "Spell",
          superTypes: [],
          domains: ["Calm"],
          might: null,
          energy: 2,
          power: null,
          mightBonus: null,
          tags: [],
        },
      ]),
      exportPrintings: vi.fn().mockResolvedValue([
        {
          id: "p-1",
          cardId: "card-1",
          shortCode: "C1-001",
          setSlug: "s",
          setName: "S",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          finish: "normal",
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          originalUrl: null,
          rehostedUrl: null,
          imageId: null,
        },
        {
          id: "p-2",
          cardId: "card-1",
          shortCode: "C1-002",
          setSlug: "s",
          setName: "S",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          finish: "foil",
          artist: "A",
          publicCode: "002",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          originalUrl: null,
          rehostedUrl: null,
          imageId: null,
        },
      ]),
    });

    const result = await buildExport(repo);

    expect(result[0].printings).toHaveLength(2);
    expect(result[1].printings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildCardDetail
// ---------------------------------------------------------------------------

describe("buildCardDetail", () => {
  /** Minimal matched card for tests that need candidates to be fetched. */
  const matchedCard = {
    id: "card-1",
    slug: "x",
    name: "X",
    normName: "x",
    type: null,
    superTypes: [] as string[],
    domains: [] as string[],
    might: null,
    energy: null,
    power: null,
    mightBonus: null,
    keywords: [] as string[],
    tags: [] as string[],
    comment: null,
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws MISSING_ALIAS when matched card has no aliases", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue({
        id: "card-1",
        slug: "fireball",
        name: "Fireball",
        normName: "fireball",
        type: "Spell",
        superTypes: [],
        domains: ["Fury"],
        might: 3,
        energy: 2,
        power: null,
        mightBonus: null,
        keywords: [],
        tags: [],
        comment: null,
      }),
      cardNameAliases: vi.fn().mockResolvedValue([]),
    });

    await expect(buildCardDetail(repo, mpRepo(), "fireball")).rejects.toThrow(AppError);
    await expect(buildCardDetail(repo, mpRepo(), "fireball")).rejects.toThrow("no name aliases");
  });

  it("returns card detail with all fields for matched card", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue({
        id: "card-1",
        slug: "fireball",
        name: "Fireball",
        normName: "fireball",
        type: "Spell",
        superTypes: [],
        domains: ["Fury"],
        might: 3,
        energy: 2,
        power: null,
        mightBonus: null,
        keywords: ["burn"],
        tags: [],
        comment: "a comment",
      }),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "fireball" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([]),
      printingsForDetail: vi.fn().mockResolvedValue([]),
      printingImagesForDetail: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "fireball");

    expect(result.card).not.toBeNull();
    expect(result.card?.slug).toBe("fireball");
    expect(result.displayName).toBe("Fireball");
  });

  it("returns null card for unmatched identifier", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue(undefined),
    });

    const result = await buildCardDetail(repo, mpRepo(), "unknowncard");

    expect(result.card).toBeNull();
    expect(result.sources).toHaveLength(0);
    expect(result.displayName).toBe("unknowncard");
  });

  it("uses shortest candidate name for unmatched displayName", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue({
        id: "card-1",
        slug: "somecard",
        name: "Some Card",
        normName: "somecard",
        type: null,
        superTypes: [],
        domains: [],
        might: null,
        energy: null,
        power: null,
        mightBonus: null,
        keywords: [],
        tags: [],
        comment: null,
      }),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "somecard" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          provider: "a",
          name: "Long Name Here",
          type: null,
          superTypes: [],
          domains: [],
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          rulesText: null,
          effectText: null,
          tags: [],
          shortCode: null,
          externalId: "e1",
          extraData: null,
          checkedAt: null,
        },
        {
          id: "cc-2",
          provider: "b",
          name: "Short",
          type: null,
          superTypes: [],
          domains: [],
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          rulesText: null,
          effectText: null,
          tags: [],
          shortCode: null,
          externalId: "e2",
          extraData: null,
          checkedAt: null,
        },
      ]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "somecard");
    expect(result.displayName).toBe("Some Card");
  });

  it("uses identifier as displayName when no candidates", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue(undefined),
      candidateCardsForDetail: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "unknownid");
    expect(result.displayName).toBe("unknownid");
  });

  it("formats printings with set slug and expectedPrintingId", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue({
        id: "card-1",
        slug: "fireball",
        name: "Fireball",
        normName: "fireball",
        type: "Spell",
        superTypes: [],
        domains: ["Fury"],
        might: 3,
        energy: 2,
        power: null,
        mightBonus: null,
        keywords: [],
        tags: [],
        comment: null,
      }),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "fireball" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([]),
      printingsForDetail: vi.fn().mockResolvedValue([
        {
          id: "p-1",
          slug: "OGN-001:normal:",
          cardId: "card-1",
          setId: "set-uuid-1",
          shortCode: "OGN-001",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [],
          finish: "normal",
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          comment: null,
          canonicalRank: 1,
        },
      ]),
      setInfoByIds: vi.fn().mockResolvedValue([
        {
          id: "set-uuid-1",
          slug: "origin",
          name: "Origin Set",
          releasedAt: "2026-01-01",
          printedTotal: 100,
        },
      ]),
      printingImagesForDetail: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "fireball");

    expect(result.printings).toHaveLength(1);
    expect(result.printings[0].setId).toBe("origin");
    expect(result.printings[0].setName).toBe("Origin Set");
    expect(result.printings[0].expectedPrintingId).toBe("OGN-001:normal:");
  });

  it("resolves promo type slugs for expectedPrintingId", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue({
        id: "card-1",
        slug: "fireball",
        name: "Fireball",
        normName: "fireball",
        type: "Spell",
        superTypes: [],
        domains: ["Fury"],
        might: 3,
        energy: 2,
        power: null,
        mightBonus: null,
        keywords: [],
        tags: [],
        comment: null,
      }),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "fireball" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([]),
      printingsForDetail: vi.fn().mockResolvedValue([
        {
          id: "p-1",
          slug: "OGN-001:foil:promo",
          cardId: "card-1",
          setId: "set-1",
          shortCode: "OGN-001",
          rarity: "Rare",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: ["promo"],
          finish: "foil",
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          comment: null,
          canonicalRank: 1,
        },
      ]),
      setInfoByIds: vi
        .fn()
        .mockResolvedValue([
          { id: "set-1", slug: "origin", name: "Origin", releasedAt: null, printedTotal: null },
        ]),
      markerSlugsByIds: vi.fn().mockResolvedValue([]),
      printingImagesForDetail: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "fireball");
    expect(result.printings[0].expectedPrintingId).toBe("OGN-001:foil:promo");
  });

  it("groups unlinked candidate printings into candidatePrintingGroups", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue(matchedCard),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "x" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          provider: "gallery",
          name: "X",
          type: null,
          superTypes: [],
          domains: [],
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          rulesText: null,
          effectText: null,
          tags: [],
          shortCode: null,
          externalId: "ext",
          extraData: null,
          checkedAt: null,
        },
      ]),
      candidatePrintingsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cp-1",
          candidateCardId: "cc-1",
          printingId: null,
          shortCode: "OGN-001",
          setId: "s1",
          setName: "S",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [],
          finish: "normal",
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          externalId: "ext-p1",
          extraData: null,
          checkedAt: null,
        },
        {
          id: "cp-2",
          candidateCardId: "cc-1",
          printingId: null,
          shortCode: "OGN-001",
          setId: "s1",
          setName: "S",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [],
          finish: "normal",
          artist: "B",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          externalId: "ext-p2",
          extraData: null,
          checkedAt: null,
        },
      ]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "x");

    expect(result.candidatePrintingGroups).toHaveLength(1);
    expect(result.candidatePrintingGroups[0].shortCodes).toEqual(["cp-1", "cp-2"]);
    expect(result.candidatePrintingGroups[0].expectedPrintingId).toBe("OGN-001:normal:");
  });

  it("excludes linked candidate printings from grouping", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue(matchedCard),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "x" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          provider: "gallery",
          name: "X",
          type: null,
          superTypes: [],
          domains: [],
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          rulesText: null,
          effectText: null,
          tags: [],
          shortCode: null,
          externalId: "ext",
          extraData: null,
          checkedAt: null,
        },
      ]),
      candidatePrintingsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cp-1",
          candidateCardId: "cc-1",
          printingId: "linked-printing",
          shortCode: "OGN-001",
          setId: "s1",
          setName: "S",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [],
          finish: "normal",
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          externalId: "ext-p1",
          extraData: null,
          checkedAt: null,
        },
      ]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "x");
    expect(result.candidatePrintingGroups).toHaveLength(0);
  });

  it("resolves finish from rarity when finish is null", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue(matchedCard),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "x" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          provider: "gallery",
          name: "X",
          type: null,
          superTypes: [],
          domains: [],
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          rulesText: null,
          effectText: null,
          tags: [],
          shortCode: null,
          externalId: "ext",
          extraData: null,
          checkedAt: null,
        },
      ]),
      candidatePrintingsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cp-1",
          candidateCardId: "cc-1",
          printingId: null,
          shortCode: "OGN-001",
          setId: "s1",
          setName: "S",
          rarity: "Rare",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [],
          finish: null,
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          externalId: "ext-p1",
          extraData: null,
          checkedAt: null,
        },
      ]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "x");
    expect(result.candidatePrintingGroups[0].expectedPrintingId).toBe("OGN-001:foil:");
  });

  it("resolves finish to normal for Common/Uncommon rarity", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue(matchedCard),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "x" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          provider: "gallery",
          name: "X",
          type: null,
          superTypes: [],
          domains: [],
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          rulesText: null,
          effectText: null,
          tags: [],
          shortCode: null,
          externalId: "ext",
          extraData: null,
          checkedAt: null,
        },
      ]),
      candidatePrintingsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cp-1",
          candidateCardId: "cc-1",
          printingId: null,
          shortCode: "OGN-001",
          setId: "s1",
          setName: "S",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [],
          finish: null,
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          externalId: "ext-p1",
          extraData: null,
          checkedAt: null,
        },
      ]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "x");
    expect(result.candidatePrintingGroups[0].expectedPrintingId).toBe("OGN-001:normal:");
  });

  it("resolves finish to empty string when both finish and rarity are null", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue(matchedCard),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "x" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          provider: "gallery",
          name: "X",
          type: null,
          superTypes: [],
          domains: [],
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          rulesText: null,
          effectText: null,
          tags: [],
          shortCode: null,
          externalId: "ext",
          extraData: null,
          checkedAt: null,
        },
      ]),
      candidatePrintingsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cp-1",
          candidateCardId: "cc-1",
          printingId: null,
          shortCode: "OGN-001",
          setId: "s1",
          setName: "S",
          rarity: null,
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [],
          finish: null,
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          externalId: "ext-p1",
          extraData: null,
          checkedAt: null,
        },
      ]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "x");
    expect(result.candidatePrintingGroups[0].expectedPrintingId).toBe("OGN-001::");
  });

  it("formats candidate card checkedAt as ISO string", async () => {
    const testDate = new Date("2026-01-15T10:30:00Z");
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue(matchedCard),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "x" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          provider: "gallery",
          name: "X",
          type: null,
          superTypes: [],
          domains: [],
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          rulesText: null,
          effectText: null,
          tags: [],
          shortCode: null,
          externalId: "ext",
          extraData: null,
          checkedAt: testDate,
        },
      ]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "x");
    expect(result.sources[0].checkedAt).toBe(testDate.toISOString());
  });

  it("returns null checkedAt when candidate card checkedAt is null", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue(matchedCard),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "x" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          provider: "gallery",
          name: "X",
          type: null,
          superTypes: [],
          domains: [],
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          rulesText: null,
          effectText: null,
          tags: [],
          shortCode: null,
          externalId: "ext",
          extraData: null,
          checkedAt: null,
        },
      ]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "x");
    expect(result.sources[0].checkedAt).toBeNull();
  });

  it("fetches set printed totals for unlinked candidate printings", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue(matchedCard),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "x" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          provider: "gallery",
          name: "X",
          type: null,
          superTypes: [],
          domains: [],
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          rulesText: null,
          effectText: null,
          tags: [],
          shortCode: null,
          externalId: "ext",
          extraData: null,
          checkedAt: null,
        },
      ]),
      candidatePrintingsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cp-1",
          candidateCardId: "cc-1",
          printingId: null,
          shortCode: "OGN-001",
          setId: "candidate-set-slug",
          setName: "S",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [],
          finish: "normal",
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          externalId: "ext-p1",
          extraData: null,
          checkedAt: null,
        },
      ]),
      setPrintedTotalBySlugs: vi
        .fn()
        .mockResolvedValue([{ slug: "candidate-set-slug", printedTotal: 200 }]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "x");
    expect(result.setTotals["candidate-set-slug"]).toBe(200);
    expect(repo.setPrintedTotalBySlugs).toHaveBeenCalledWith(["candidate-set-slug"]);
  });

  it("derives expectedCardId from earliest normal printing", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue({
        id: "card-1",
        slug: "fireball",
        name: "Fireball",
        normName: "fireball",
        type: "Spell",
        superTypes: [],
        domains: ["Fury"],
        might: 3,
        energy: 2,
        power: null,
        mightBonus: null,
        keywords: [],
        tags: [],
        comment: null,
      }),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "fireball" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([]),
      printingsForDetail: vi.fn().mockResolvedValue([
        {
          id: "p-1",
          slug: "SFD-113:normal:",
          cardId: "card-1",
          setId: "set-2",
          shortCode: "SFD-113",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [],
          finish: "normal",
          artist: "A",
          publicCode: "113",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          comment: null,
        },
        {
          id: "p-2",
          slug: "OGN-001:normal:",
          cardId: "card-1",
          setId: "set-1",
          shortCode: "OGN-001",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [],
          finish: "normal",
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          comment: null,
        },
      ]),
      setInfoByIds: vi.fn().mockResolvedValue([
        {
          id: "set-1",
          slug: "origin",
          name: "Origin",
          releasedAt: "2025-01-01",
          printedTotal: null,
        },
        {
          id: "set-2",
          slug: "second",
          name: "Second",
          releasedAt: "2026-01-01",
          printedTotal: null,
        },
      ]),
      printingImagesForDetail: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "fireball");
    expect(result.expectedCardId).toBe("fireball");
  });

  it("falls back to all printings when no normal variants exist", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue({
        id: "card-1",
        slug: "fireball",
        name: "Fireball",
        normName: "fireball",
        type: "Spell",
        superTypes: [],
        domains: ["Fury"],
        might: 3,
        energy: 2,
        power: null,
        mightBonus: null,
        keywords: [],
        tags: [],
        comment: null,
      }),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "fireball" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([]),
      printingsForDetail: vi.fn().mockResolvedValue([
        {
          id: "p-1",
          slug: "OGN-001a:foil:",
          cardId: "card-1",
          setId: "set-1",
          shortCode: "OGN-001a",
          rarity: "Rare",
          artVariant: "alternate",
          isSigned: false,
          markerSlugs: [],
          finish: "foil",
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          comment: null,
        },
      ]),
      setInfoByIds: vi.fn().mockResolvedValue([
        {
          id: "set-1",
          slug: "origin",
          name: "Origin",
          releasedAt: "2025-01-01",
          printedTotal: null,
        },
      ]),
      printingImagesForDetail: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "fireball");
    expect(result.expectedCardId).toBe("fireball");
  });

  it("derives expectedCardId from candidate printing groups when no printings", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue(matchedCard),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "x" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          provider: "gallery",
          name: "X",
          type: null,
          superTypes: [],
          domains: [],
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          rulesText: null,
          effectText: null,
          tags: [],
          shortCode: null,
          externalId: "ext",
          extraData: null,
          checkedAt: null,
        },
      ]),
      candidatePrintingsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cp-1",
          candidateCardId: "cc-1",
          printingId: null,
          shortCode: "OGN-002a",
          setId: "s1",
          setName: "S",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [],
          finish: "normal",
          artist: "A",
          publicCode: "002",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          externalId: "ext-p1",
          extraData: null,
          checkedAt: null,
        },
      ]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "x");
    expect(result.expectedCardId).toBe("x");
  });

  it("returns current slug as expectedCardId when no printings or groups", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue({
        id: "card-1",
        slug: "existing-slug",
        name: "X",
        normName: "x",
        type: "Unit",
        superTypes: [],
        domains: ["Fury"],
        might: 1,
        energy: 1,
        power: 1,
        mightBonus: null,
        keywords: [],
        tags: [],
        comment: null,
      }),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "x" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([]),
      printingsForDetail: vi.fn().mockResolvedValue([]),
      printingImagesForDetail: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "existing-slug");
    expect(result.expectedCardId).toBe("x");
  });

  it("returns empty string expectedCardId when no printings, groups, or slug", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue(undefined),
      candidateCardsForDetail: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "nothing");
    expect(result.expectedCardId).toBe("nothing");
  });

  it("sorts printings by canonicalRank", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue({
        id: "card-1",
        slug: "x",
        name: "X",
        normName: "x",
        type: "Unit",
        superTypes: [],
        domains: ["Fury"],
        might: 1,
        energy: 1,
        power: 1,
        mightBonus: null,
        keywords: [],
        tags: [],
        comment: null,
      }),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "x" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([]),
      // Mock returns out-of-order by canonicalRank (higher rank first) to
      // prove the service sorts ascending even when the repo doesn't.
      printingsForDetail: vi.fn().mockResolvedValue([
        {
          id: "p-2",
          slug: "OGN-002:normal:",
          cardId: "card-1",
          setId: "set-1",
          shortCode: "OGN-002",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [],
          finish: "normal",
          artist: "A",
          publicCode: "002",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          comment: null,
          canonicalRank: 2,
        },
        {
          id: "p-1",
          slug: "OGN-001:normal:",
          cardId: "card-1",
          setId: "set-1",
          shortCode: "OGN-001",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [],
          finish: "normal",
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          comment: null,
          canonicalRank: 1,
        },
      ]),
      setInfoByIds: vi
        .fn()
        .mockResolvedValue([
          { id: "set-1", slug: "origin", name: "Origin", releasedAt: null, printedTotal: null },
        ]),
      printingImagesForDetail: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "x");
    expect(result.printings.map((p) => p.id)).toEqual(["p-1", "p-2"]);
  });

  it("includes set totals for accepted printings", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue({
        id: "card-1",
        slug: "x",
        name: "X",
        normName: "x",
        type: "Unit",
        superTypes: [],
        domains: ["Fury"],
        might: 1,
        energy: 1,
        power: 1,
        mightBonus: null,
        keywords: [],
        tags: [],
        comment: null,
      }),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "x" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([]),
      printingsForDetail: vi.fn().mockResolvedValue([
        {
          id: "p-1",
          slug: "OGN-001:normal:",
          cardId: "card-1",
          setId: "set-1",
          shortCode: "OGN-001",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [],
          finish: "normal",
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          flavorText: null,
          comment: null,
        },
      ]),
      setInfoByIds: vi
        .fn()
        .mockResolvedValue([
          { id: "set-1", slug: "origin", name: "Origin", releasedAt: null, printedTotal: 150 },
        ]),
      printingImagesForDetail: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "x");
    expect(result.setTotals).toEqual({ origin: 150 });
  });

  it("does not duplicate set totals already fetched from accepted printings", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue({
        id: "card-1",
        slug: "x",
        name: "X",
        normName: "x",
        type: "Unit",
        superTypes: [],
        domains: ["Fury"],
        might: 1,
        energy: 1,
        power: 1,
        mightBonus: null,
        keywords: [],
        tags: [],
        comment: null,
      }),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "x" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          provider: "gallery",
          name: "X",
          type: null,
          superTypes: [],
          domains: [],
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          rulesText: null,
          effectText: null,
          tags: [],
          shortCode: null,
          externalId: "ext",
          extraData: null,
          checkedAt: null,
        },
      ]),
      candidatePrintingsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cp-1",
          candidateCardId: "cc-1",
          printingId: null,
          shortCode: "OGN-002",
          setId: "origin",
          setName: "Origin",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [],
          finish: "normal",
          artist: "A",
          publicCode: "002",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          externalId: "ext-p1",
          extraData: null,
          checkedAt: null,
        },
      ]),
      printingsForDetail: vi.fn().mockResolvedValue([]),
      setInfoByIds: vi.fn().mockResolvedValue([]),
      setPrintedTotalBySlugs: vi.fn().mockResolvedValue([{ slug: "origin", printedTotal: 150 }]),
      printingImagesForDetail: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "x");
    expect(result.setTotals).toEqual({ origin: 150 });
  });

  it("skips set totals query when no unlinked candidate printing sets differ", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue(undefined),
      candidateCardsForDetail: vi.fn().mockResolvedValue([]),
    });

    const result = await buildCardDetail(repo, mpRepo(), "nothing");
    expect(repo.setPrintedTotalBySlugs).not.toHaveBeenCalled();
    expect(result.setTotals).toEqual({});
  });
  it("passes through marketplace mappings and staging candidates for a matched card", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue({
        id: "card-1",
        slug: "x",
        name: "X",
        normName: "x",
        type: "Unit",
        superTypes: [],
        domains: ["Fury"],
        might: 1,
        energy: 1,
        power: 1,
        mightBonus: null,
        keywords: [],
        tags: [],
        comment: null,
      }),
      cardNameAliases: vi.fn().mockResolvedValue([{ normName: "x" }]),
      candidateCardsForDetail: vi.fn().mockResolvedValue([]),
      printingsForDetail: vi.fn().mockResolvedValue([]),
      printingImagesForDetail: vi.fn().mockResolvedValue([]),
    });
    const marketplaceRepo = createMockMarketplaceRepo({
      variantsForCard: vi.fn().mockResolvedValue([
        {
          targetPrintingId: "p-en",
          marketplace: "cardmarket",
          externalId: 123,
          productName: "X",
          finish: "normal",
          variantLanguage: null,
          ownerPrintingId: "p-en",
          ownerLanguage: "EN",
        },
        {
          targetPrintingId: "p-zh",
          marketplace: "cardmarket",
          externalId: 123,
          productName: "X",
          finish: "normal",
          variantLanguage: null,
          ownerPrintingId: "p-en",
          ownerLanguage: "EN",
        },
        {
          // unsupported marketplace — should be filtered out
          targetPrintingId: "p-en",
          marketplace: "ebay",
          externalId: 999,
          productName: "X",
          finish: "normal",
          variantLanguage: "EN",
          ownerPrintingId: "p-en",
          ownerLanguage: "EN",
        },
      ]),
      stagingCandidatesForCard: vi.fn().mockResolvedValue([
        {
          marketplace: "tcgplayer",
          externalId: 555,
          productName: "X",
          finish: "normal",
          language: "EN",
          groupId: 42,
          groupName: "Origin",
          marketCents: 100,
          lowCents: 80,
          recordedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ]),
    });

    const result = await buildCardDetail(repo, marketplaceRepo, "x");

    expect(marketplaceRepo.variantsForCard).toHaveBeenCalledWith("card-1");
    expect(marketplaceRepo.stagingCandidatesForCard).toHaveBeenCalledWith("card-1", ["x"]);
    expect(result.marketplaceMappings).toHaveLength(2);
    expect(result.marketplaceMappings[0]).toMatchObject({
      targetPrintingId: "p-en",
      marketplace: "cardmarket",
      externalId: 123,
      ownerPrintingId: "p-en",
    });
    expect(result.marketplaceMappings[1]).toMatchObject({
      targetPrintingId: "p-zh",
      marketplace: "cardmarket",
      ownerPrintingId: "p-en",
    });
    expect(result.marketplaceStagingCandidates).toEqual([
      {
        marketplace: "tcgplayer",
        externalId: 555,
        productName: "X",
        finish: "normal",
        language: "EN",
        groupId: 42,
        groupName: "Origin",
        marketCents: 100,
        lowCents: 80,
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("leaves marketplace fields empty when the card is unmatched", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue(undefined),
      candidateCardsForDetail: vi.fn().mockResolvedValue([]),
    });
    const marketplaceRepo = createMockMarketplaceRepo();

    const result = await buildCardDetail(repo, marketplaceRepo, "missing");

    expect(marketplaceRepo.variantsForCard).not.toHaveBeenCalled();
    expect(marketplaceRepo.stagingCandidatesForCard).not.toHaveBeenCalled();
    expect(result.marketplaceMappings).toEqual([]);
    expect(result.marketplaceStagingCandidates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildUnmatchedDetail
// ---------------------------------------------------------------------------

describe("buildUnmatchedDetail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns reshaped detail for unmatched candidates", async () => {
    const repo = createMockRepo({
      cardForDetailBySlug: vi.fn().mockResolvedValue(undefined),
      candidateCardsForDetail: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          provider: "gallery",
          name: "New Card",
          type: null,
          superTypes: [],
          domains: [],
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          rulesText: null,
          effectText: null,
          tags: [],
          shortCode: null,
          externalId: "ext",
          extraData: null,
          checkedAt: null,
        },
      ]),
    });

    const result = await buildUnmatchedDetail(repo, "newcard");

    expect(result.displayName).toBe("New Card");
    expect(result.sources).toHaveLength(1);
    expect(result).toHaveProperty("defaultCardId");
    expect(result).toHaveProperty("setTotals");
    expect(result).toHaveProperty("candidatePrintings");
    expect(result).toHaveProperty("candidatePrintingGroups");
    expect(result).not.toHaveProperty("card");
    expect(result).not.toHaveProperty("printings");
    expect(result).not.toHaveProperty("printingImages");
  });
});
