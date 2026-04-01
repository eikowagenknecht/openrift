/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Repos, Transact } from "../deps.js";
import { ingestCandidates } from "./ingest-candidates.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockTransact(trxRepos: Repos): Transact {
  return (fn) => fn(trxRepos) as any;
}

function createMockIngestRepo(overrides: Record<string, unknown> = {}) {
  return {
    allCandidateCardsForProvider: vi.fn().mockResolvedValue([]),
    allCardNorms: vi.fn().mockResolvedValue([]),
    allCardNameAliases: vi.fn().mockResolvedValue([]),
    allPrintingKeys: vi.fn().mockResolvedValue([]),
    candidatePrintingsByCandidateCardIds: vi.fn().mockResolvedValue([]),
    ignoredCandidateCards: vi.fn().mockResolvedValue([]),
    ignoredCandidatePrintings: vi.fn().mockResolvedValue([]),
    allPrintingLinkOverrides: vi.fn().mockResolvedValue([]),
    insertCandidateCard: vi.fn().mockResolvedValue("new-cc-id"),
    updateCandidateCard: vi.fn().mockResolvedValue(undefined),
    insertCandidatePrinting: vi.fn().mockResolvedValue("new-cp-id"),
    updateCandidatePrinting: vi.fn().mockResolvedValue(undefined),
    deleteCandidateCards: vi.fn().mockResolvedValue(undefined),
    deleteCandidatePrintings: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockPromoTypesRepo(overrides: Record<string, unknown> = {}) {
  return {
    getBySlug: vi.fn().mockResolvedValue({ id: "promo-type-id", slug: "promo" }),
    ...overrides,
  };
}

function createMockRepos(
  ingestOverrides: Record<string, unknown> = {},
  promoOverrides: Record<string, unknown> = {},
): Repos {
  return {
    ingest: createMockIngestRepo(ingestOverrides),
    promoTypes: createMockPromoTypesRepo(promoOverrides),
  } as unknown as Repos;
}

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
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
    tags: [],
    short_code: "OGN-001",
    external_id: "ext-card-1",
    extra_data: null,
    printings: [],
    ...overrides,
  };
}

function makePrinting(overrides: Record<string, unknown> = {}) {
  return {
    short_code: "OGN-001",
    set_id: "origin",
    set_name: "Origin Set",
    collector_number: 1,
    rarity: "Common",
    art_variant: "normal",
    is_signed: false,
    is_promo: false,
    finish: "normal",
    artist: "Jane Doe",
    public_code: "001",
    printed_rules_text: null,
    printed_effect_text: null,
    image_url: null,
    flavor_text: null,
    external_id: "ext-print-1",
    extra_data: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ingestCandidates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Validation ──────────────────────────────────────────────────────────

  it("throws when provider is empty", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    await expect(ingestCandidates(transact, "", [])).rejects.toThrow(
      "provider name must not be empty",
    );
  });

  it("throws when provider is whitespace-only", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    await expect(ingestCandidates(transact, "   ", [])).rejects.toThrow(
      "provider name must not be empty",
    );
  });

  // ── Empty input ─────────────────────────────────────────────────────────

  it("returns zeros when no cards provided", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const result = await ingestCandidates(transact, "gallery", []);
    expect(result.provider).toBe("gallery");
    expect(result.newCards).toBe(0);
    expect(result.updates).toBe(0);
    expect(result.unchanged).toBe(0);
    expect(result.errors).toEqual([]);
  });

  // ── New card insertion ──────────────────────────────────────────────────

  it("inserts a new candidate card", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const card = makeCard();
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.newCards).toBe(1);
    expect(result.newCardDetails).toHaveLength(1);
    expect(result.newCardDetails[0]).toEqual({ name: "Fireball", shortCode: "OGN-001" });
    expect((repos.ingest as any).insertCandidateCard).toHaveBeenCalledTimes(1);
  });

  it("inserts new card with short_code and extra_data", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const card = makeCard({
      short_code: "SC-001",
      extra_data: { key: "value" },
    });
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.newCards).toBe(1);
    const insertCall = (repos.ingest as any).insertCandidateCard.mock.calls[0][0];
    expect(insertCall.shortCode).toBe("SC-001");
    expect(insertCall.extraData).toEqual({ key: "value" });
  });

  it("sets shortCode to null when short_code is null on insert", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const card = makeCard({ short_code: null });
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.newCards).toBe(1);
    const insertCall = (repos.ingest as any).insertCandidateCard.mock.calls[0][0];
    expect(insertCall.shortCode).toBeNull();
  });

  it("omits shortCode from insert when short_code is undefined", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const card = makeCard();
    delete (card as any).short_code;
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.newCards).toBe(1);
    const insertCall = (repos.ingest as any).insertCandidateCard.mock.calls[0][0];
    expect(insertCall).not.toHaveProperty("shortCode");
  });

  it("sets extraData to null for empty object extra_data on insert", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const card = makeCard({ extra_data: {} });
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.newCards).toBe(1);
    const insertCall = (repos.ingest as any).insertCandidateCard.mock.calls[0][0];
    expect(insertCall.extraData).toBeNull();
  });

  // ── Existing card update ────────────────────────────────────────────────

  it("updates existing candidate card when fields change", async () => {
    const repos = createMockRepos({
      allCandidateCardsForProvider: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          externalId: "ext-card-1",
          name: "Old Name",
          type: "Spell",
          superTypes: [],
          domains: ["Fury"],
          might: 3,
          energy: 2,
          power: null,
          mightBonus: null,
          rulesText: "Deal damage",
          effectText: null,
          tags: [],
          shortCode: "OGN-001",
          extraData: null,
        },
      ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({ name: "Fireball Updated" });
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.updates).toBe(1);
    expect(result.updatedCards).toHaveLength(1);
    expect(result.updatedCards[0].name).toBe("Fireball Updated");
    expect((repos.ingest as any).updateCandidateCard).toHaveBeenCalledTimes(1);
  });

  it("reports unchanged when card data matches", async () => {
    const repos = createMockRepos({
      allCandidateCardsForProvider: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          externalId: "ext-card-1",
          name: "Fireball",
          type: "Spell",
          superTypes: [],
          domains: ["Fury"],
          might: 3,
          energy: 2,
          power: null,
          mightBonus: null,
          rulesText: "Deal damage",
          effectText: null,
          tags: [],
          shortCode: "OGN-001",
          extraData: null,
        },
      ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard();
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.unchanged).toBe(1);
    expect(result.updates).toBe(0);
  });

  it("resets checkedAt to null on card update", async () => {
    const repos = createMockRepos({
      allCandidateCardsForProvider: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          externalId: "ext-card-1",
          name: "Old",
          type: "Spell",
          superTypes: [],
          domains: ["Fury"],
          might: 3,
          energy: 2,
          power: null,
          mightBonus: null,
          rulesText: "Deal damage",
          effectText: null,
          tags: [],
          shortCode: "OGN-001",
          extraData: null,
        },
      ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({ name: "New" });
    await ingestCandidates(transact, "gallery", [card]);

    const updateCall = (repos.ingest as any).updateCandidateCard.mock.calls[0][1];
    expect(updateCall.checkedAt).toBeNull();
  });

  // ── Card validation errors ──────────────────────────────────────────────

  it("records validation error and skips card with invalid name", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const card = makeCard({ name: "" });
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("name:");
    expect(result.newCards).toBe(0);
  });

  // ── Ignored cards ───────────────────────────────────────────────────────

  it("skips ignored candidate cards", async () => {
    const repos = createMockRepos({
      ignoredCandidateCards: vi.fn().mockResolvedValue([{ externalId: "ext-card-1" }]),
    });
    const transact = mockTransact(repos);
    const card = makeCard();
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.newCards).toBe(0);
    expect(result.unchanged).toBe(0);
  });

  // ── New printing insertion ──────────────────────────────────────────────

  it("inserts a new candidate printing", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const card = makeCard({ printings: [makePrinting()] });
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.newPrintings).toBe(1);
    expect(result.newPrintingDetails).toHaveLength(1);
    expect(result.newPrintingDetails[0].shortCode).toBe("OGN-001");
    expect((repos.ingest as any).insertCandidatePrinting).toHaveBeenCalledTimes(1);
  });

  it("resolves printingId when card and printing match by composite key", async () => {
    const repos = createMockRepos({
      allCardNorms: vi.fn().mockResolvedValue([{ normName: "fireball", id: "card-uuid" }]),
      allPrintingKeys: vi
        .fn()
        .mockResolvedValue([
          {
            shortCode: "OGN-001",
            finish: "normal",
            promoTypeId: null,
            id: "printing-uuid",
            language: "EN",
          },
        ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({
      printings: [makePrinting({ rarity: "Common", finish: "normal" })],
    });
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.newPrintings).toBe(1);
    const insertCall = (repos.ingest as any).insertCandidatePrinting.mock.calls[0][0];
    expect(insertCall.printingId).toBe("printing-uuid");
  });

  it("resolves card via alias when direct normName does not match", async () => {
    const repos = createMockRepos({
      allCardNameAliases: vi
        .fn()
        .mockResolvedValue([{ normName: "fireball", cardId: "card-uuid" }]),
      allPrintingKeys: vi
        .fn()
        .mockResolvedValue([
          {
            shortCode: "OGN-001",
            finish: "normal",
            promoTypeId: null,
            id: "printing-uuid",
            language: "EN",
          },
        ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({
      printings: [makePrinting({ rarity: "Common", finish: "normal" })],
    });
    await ingestCandidates(transact, "gallery", [card]);

    const insertCall = (repos.ingest as any).insertCandidatePrinting.mock.calls[0][0];
    expect(insertCall.printingId).toBe("printing-uuid");
  });

  it("sets promoTypeId when is_promo is true", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const card = makeCard({
      printings: [makePrinting({ is_promo: true })],
    });
    await ingestCandidates(transact, "gallery", [card]);

    const insertCall = (repos.ingest as any).insertCandidatePrinting.mock.calls[0][0];
    expect(insertCall.promoTypeId).toBe("promo-type-id");
  });

  it("sets promoTypeId to null when is_promo is false", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const card = makeCard({
      printings: [makePrinting({ is_promo: false })],
    });
    await ingestCandidates(transact, "gallery", [card]);

    const insertCall = (repos.ingest as any).insertCandidatePrinting.mock.calls[0][0];
    expect(insertCall.promoTypeId).toBeNull();
  });

  it("sets printingId to null when card not matched", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const card = makeCard({
      printings: [makePrinting({ rarity: "Common", finish: "normal" })],
    });
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.newPrintings).toBe(1);
    const insertCall = (repos.ingest as any).insertCandidatePrinting.mock.calls[0][0];
    expect(insertCall.printingId).toBeNull();
  });

  // ── Printing validation errors ──────────────────────────────────────────

  it("records validation error for invalid printing and continues", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const card = makeCard({
      printings: [
        makePrinting({ short_code: "" }),
        makePrinting({ short_code: "VALID-001", external_id: "ext-print-2" }),
      ],
    });
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("short_code:");
    expect(result.newPrintings).toBe(1);
  });

  // ── Ignored printings ──────────────────────────────────────────────────

  it("skips all-finish ignored candidate printings", async () => {
    const repos = createMockRepos({
      ignoredCandidatePrintings: vi
        .fn()
        .mockResolvedValue([{ externalId: "ext-print-1", finish: null }]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({ printings: [makePrinting()] });
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.newPrintings).toBe(0);
  });

  it("skips finish-specific ignored candidate printings", async () => {
    const repos = createMockRepos({
      ignoredCandidatePrintings: vi
        .fn()
        .mockResolvedValue([{ externalId: "ext-print-1", finish: "normal" }]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({ printings: [makePrinting({ finish: "normal" })] });
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.newPrintings).toBe(0);
  });

  it("does not skip printing when finish-specific ignore does not match", async () => {
    const repos = createMockRepos({
      ignoredCandidatePrintings: vi
        .fn()
        .mockResolvedValue([{ externalId: "ext-print-1", finish: "foil" }]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({ printings: [makePrinting({ finish: "normal" })] });
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.newPrintings).toBe(1);
  });

  // ── Existing printing update ────────────────────────────────────────────

  it("updates existing candidate printing when fields change", async () => {
    const repos = createMockRepos({
      allCandidateCardsForProvider: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          externalId: "ext-card-1",
          name: "Fireball",
          type: "Spell",
          superTypes: [],
          domains: ["Fury"],
          might: 3,
          energy: 2,
          power: null,
          mightBonus: null,
          rulesText: "Deal damage",
          effectText: null,
          tags: [],
          shortCode: "OGN-001",
          extraData: null,
        },
      ]),
      candidatePrintingsByCandidateCardIds: vi.fn().mockResolvedValue([
        {
          id: "cp-1",
          candidateCardId: "cc-1",
          externalId: "ext-print-1",
          shortCode: "OGN-001",
          setId: "origin",
          setName: "Origin Set",
          collectorNumber: 1,
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          promoTypeId: null,
          finish: "normal",
          artist: "Old Artist",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          extraData: null,
          printingId: null,
        },
      ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({
      printings: [makePrinting({ artist: "New Artist" })],
    });
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.printingUpdates).toBe(1);
    expect(result.updatedPrintings).toHaveLength(1);
    expect(result.updatedPrintings[0].shortCode).toBe("OGN-001");
    expect((repos.ingest as any).updateCandidatePrinting).toHaveBeenCalledTimes(1);
  });

  it("reports printingsUnchanged for existing printing with no changes", async () => {
    const repos = createMockRepos({
      allCandidateCardsForProvider: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          externalId: "ext-card-1",
          name: "Fireball",
          type: "Spell",
          superTypes: [],
          domains: ["Fury"],
          might: 3,
          energy: 2,
          power: null,
          mightBonus: null,
          rulesText: "Deal damage",
          effectText: null,
          tags: [],
          shortCode: "OGN-001",
          extraData: null,
        },
      ]),
      candidatePrintingsByCandidateCardIds: vi.fn().mockResolvedValue([
        {
          id: "cp-1",
          candidateCardId: "cc-1",
          externalId: "ext-print-1",
          shortCode: "OGN-001",
          setId: "origin",
          setName: "Origin Set",
          collectorNumber: 1,
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          promoTypeId: null,
          finish: "normal",
          artist: "Jane Doe",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          extraData: null,
          printingId: "already-linked",
        },
      ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({ printings: [makePrinting()] });
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.printingsUnchanged).toBe(1);
    expect(result.printingUpdates).toBe(0);
  });

  it("links printing via override when fields are unchanged", async () => {
    const repos = createMockRepos({
      allCandidateCardsForProvider: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          externalId: "ext-card-1",
          name: "Fireball",
          type: "Spell",
          superTypes: [],
          domains: ["Fury"],
          might: 3,
          energy: 2,
          power: null,
          mightBonus: null,
          rulesText: "Deal damage",
          effectText: null,
          tags: [],
          shortCode: "OGN-001",
          extraData: null,
        },
      ]),
      candidatePrintingsByCandidateCardIds: vi.fn().mockResolvedValue([
        {
          id: "cp-1",
          candidateCardId: "cc-1",
          externalId: "ext-print-1",
          shortCode: "OGN-001",
          setId: "origin",
          setName: "Origin Set",
          collectorNumber: 1,
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          promoTypeId: null,
          finish: "normal",
          artist: "Jane Doe",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          extraData: null,
          printingId: null,
        },
      ]),
      allCardNorms: vi.fn().mockResolvedValue([{ normName: "fireball", id: "card-uuid" }]),
      allPrintingKeys: vi
        .fn()
        .mockResolvedValue([
          {
            shortCode: "OGN-001",
            finish: "normal",
            promoTypeId: null,
            id: "printing-uuid",
            language: "EN",
          },
        ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({ printings: [makePrinting()] });
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.printingsUnchanged).toBe(1);
    const updateCall = (repos.ingest as any).updateCandidatePrinting.mock.calls[0][1];
    expect(updateCall.printingId).toBe("printing-uuid");
  });

  it("uses link override to resolve printingId", async () => {
    const repos = createMockRepos({
      allPrintingLinkOverrides: vi
        .fn()
        .mockResolvedValue([
          { externalId: "ext-print-1", finish: "normal", printingId: "override-printing-uuid" },
        ]),
      allCardNorms: vi.fn().mockResolvedValue([{ normName: "fireball", id: "card-uuid" }]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({
      printings: [makePrinting({ finish: "normal", rarity: "Common" })],
    });
    await ingestCandidates(transact, "gallery", [card]);

    const insertCall = (repos.ingest as any).insertCandidatePrinting.mock.calls[0][0];
    expect(insertCall.printingId).toBe("override-printing-uuid");
  });

  it("also links updated printing via resolve when previously unlinked", async () => {
    const repos = createMockRepos({
      allCandidateCardsForProvider: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          externalId: "ext-card-1",
          name: "Fireball",
          type: "Spell",
          superTypes: [],
          domains: ["Fury"],
          might: 3,
          energy: 2,
          power: null,
          mightBonus: null,
          rulesText: "Deal damage",
          effectText: null,
          tags: [],
          shortCode: "OGN-001",
          extraData: null,
        },
      ]),
      candidatePrintingsByCandidateCardIds: vi.fn().mockResolvedValue([
        {
          id: "cp-1",
          candidateCardId: "cc-1",
          externalId: "ext-print-1",
          shortCode: "OGN-001",
          setId: "origin",
          setName: "Origin Set",
          collectorNumber: 1,
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          promoTypeId: null,
          finish: "normal",
          artist: "Old Artist",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          extraData: null,
          printingId: null,
        },
      ]),
      allCardNorms: vi.fn().mockResolvedValue([{ normName: "fireball", id: "card-uuid" }]),
      allPrintingKeys: vi
        .fn()
        .mockResolvedValue([
          {
            shortCode: "OGN-001",
            finish: "normal",
            promoTypeId: null,
            id: "printing-uuid",
            language: "EN",
          },
        ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({
      printings: [makePrinting({ artist: "New Artist" })],
    });
    await ingestCandidates(transact, "gallery", [card]);

    const updateCall = (repos.ingest as any).updateCandidatePrinting.mock.calls[0][1];
    expect(updateCall.printingId).toBe("printing-uuid");
  });

  it("does not overwrite existing printingId on update even if resolved", async () => {
    const repos = createMockRepos({
      allCandidateCardsForProvider: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          externalId: "ext-card-1",
          name: "Fireball",
          type: "Spell",
          superTypes: [],
          domains: ["Fury"],
          might: 3,
          energy: 2,
          power: null,
          mightBonus: null,
          rulesText: "Deal damage",
          effectText: null,
          tags: [],
          shortCode: "OGN-001",
          extraData: null,
        },
      ]),
      candidatePrintingsByCandidateCardIds: vi.fn().mockResolvedValue([
        {
          id: "cp-1",
          candidateCardId: "cc-1",
          externalId: "ext-print-1",
          shortCode: "OGN-001",
          setId: "origin",
          setName: "Origin Set",
          collectorNumber: 1,
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          promoTypeId: null,
          finish: "normal",
          artist: "Old Artist",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          extraData: null,
          printingId: "already-linked",
        },
      ]),
      allCardNorms: vi.fn().mockResolvedValue([{ normName: "fireball", id: "card-uuid" }]),
      allPrintingKeys: vi
        .fn()
        .mockResolvedValue([
          {
            shortCode: "OGN-001",
            finish: "normal",
            promoTypeId: null,
            id: "printing-uuid",
            language: "EN",
          },
        ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({
      printings: [makePrinting({ artist: "New Artist" })],
    });
    await ingestCandidates(transact, "gallery", [card]);

    const updateCall = (repos.ingest as any).updateCandidatePrinting.mock.calls[0][1];
    expect(updateCall).not.toHaveProperty("printingId");
  });

  // ── Removal ─────────────────────────────────────────────────────────────

  it("removes candidate cards no longer in the upload", async () => {
    const repos = createMockRepos({
      allCandidateCardsForProvider: vi.fn().mockResolvedValue([
        {
          id: "cc-old",
          externalId: "ext-old",
          name: "Old Card",
          shortCode: "OLD-001",
          type: "Unit",
          superTypes: [],
          domains: [],
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          rulesText: null,
          effectText: null,
          tags: [],
          extraData: null,
        },
      ]),
    });
    const transact = mockTransact(repos);
    const result = await ingestCandidates(transact, "gallery", []);

    expect(result.removedCards).toBe(1);
    expect(result.removedCardDetails).toHaveLength(1);
    expect(result.removedCardDetails[0].name).toBe("Old Card");
    expect((repos.ingest as any).deleteCandidateCards).toHaveBeenCalledWith(["cc-old"]);
  });

  it("removes candidate printings no longer in the upload", async () => {
    const repos = createMockRepos({
      allCandidateCardsForProvider: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          externalId: "ext-card-1",
          name: "Fireball",
          type: "Spell",
          superTypes: [],
          domains: ["Fury"],
          might: 3,
          energy: 2,
          power: null,
          mightBonus: null,
          rulesText: "Deal damage",
          effectText: null,
          tags: [],
          shortCode: "OGN-001",
          extraData: null,
        },
      ]),
      candidatePrintingsByCandidateCardIds: vi.fn().mockResolvedValue([
        {
          id: "cp-old",
          candidateCardId: "cc-1",
          externalId: "ext-old-print",
          shortCode: "OLD-P001",
          setId: "origin",
          setName: "Origin Set",
          collectorNumber: 1,
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          promoTypeId: null,
          finish: "normal",
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          extraData: null,
          printingId: null,
        },
      ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({ printings: [] });
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.removedPrintings).toBe(1);
    expect(result.removedPrintingDetails).toHaveLength(1);
    expect(result.removedPrintingDetails[0].name).toBe("Fireball");
    expect(result.removedPrintingDetails[0].shortCode).toBe("OLD-P001");
    expect((repos.ingest as any).deleteCandidatePrintings).toHaveBeenCalledWith(["cp-old"]);
  });

  it("uses 'unknown' for name when removed printing's card is not found", async () => {
    const repos = createMockRepos({
      allCandidateCardsForProvider: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          externalId: "ext-card-1",
          name: "Fireball",
          type: "Spell",
          superTypes: [],
          domains: ["Fury"],
          might: 3,
          energy: 2,
          power: null,
          mightBonus: null,
          rulesText: "Deal damage",
          effectText: null,
          tags: [],
          shortCode: "OGN-001",
          extraData: null,
        },
      ]),
      candidatePrintingsByCandidateCardIds: vi.fn().mockResolvedValue([
        {
          id: "cp-orphan",
          candidateCardId: "cc-gone",
          externalId: "ext-orphan",
          shortCode: "ORPHAN-001",
          setId: "origin",
          setName: "Origin Set",
          collectorNumber: 1,
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          promoTypeId: null,
          finish: "normal",
          artist: "A",
          publicCode: "001",
          printedRulesText: null,
          printedEffectText: null,
          imageUrl: null,
          flavorText: null,
          extraData: null,
          printingId: null,
        },
      ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard();
    const result = await ingestCandidates(transact, "gallery", [card]);

    expect(result.removedPrintingDetails[0].name).toBe("unknown");
  });

  // ── Default promo type ──────────────────────────────────────────────────

  it("handles null default promo type gracefully", async () => {
    const repos = createMockRepos({}, { getBySlug: vi.fn().mockResolvedValue(null) });
    const transact = mockTransact(repos);
    const card = makeCard({
      printings: [makePrinting({ is_promo: true })],
    });
    await ingestCandidates(transact, "gallery", [card]);

    const insertCall = (repos.ingest as any).insertCandidatePrinting.mock.calls[0][0];
    expect(insertCall.promoTypeId).toBeNull();
  });

  // ── Empty rules_text normalization ──────────────────────────────────────

  it("normalizes empty rules_text to null", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const card = makeCard({ rules_text: "" });
    await ingestCandidates(transact, "gallery", [card]);

    const insertCall = (repos.ingest as any).insertCandidateCard.mock.calls[0][0];
    expect(insertCall.rulesText).toBeNull();
  });

  it("normalizes empty printed_rules_text on printing to null", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const card = makeCard({
      printings: [makePrinting({ printed_rules_text: "" })],
    });
    await ingestCandidates(transact, "gallery", [card]);

    const insertCall = (repos.ingest as any).insertCandidatePrinting.mock.calls[0][0];
    expect(insertCall.printedRulesText).toBeNull();
  });

  // ── Multiple cards and printings ────────────────────────────────────────

  it("processes multiple cards with multiple printings", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const cards = [
      makeCard({
        name: "Card A",
        external_id: "ext-a",
        printings: [
          makePrinting({ external_id: "p-a1", short_code: "OGN-001" }),
          makePrinting({ external_id: "p-a2", short_code: "OGN-002" }),
        ],
      }),
      makeCard({
        name: "Card B",
        external_id: "ext-b",
        printings: [makePrinting({ external_id: "p-b1", short_code: "OGN-003" })],
      }),
    ];
    const result = await ingestCandidates(transact, "gallery", cards);

    expect(result.newCards).toBe(2);
    expect(result.newPrintings).toBe(3);
  });

  // ── jsonOrNull edge cases ──────────────────────────────────────────────

  it("preserves non-empty extra_data object on insert", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const card = makeCard({ extra_data: { key: "value" } });
    await ingestCandidates(transact, "gallery", [card]);

    const insertCall = (repos.ingest as any).insertCandidateCard.mock.calls[0][0];
    expect(insertCall.extraData).toEqual({ key: "value" });
  });

  it("converts null extra_data to null", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const card = makeCard({ extra_data: null });
    await ingestCandidates(transact, "gallery", [card]);

    const insertCall = (repos.ingest as any).insertCandidateCard.mock.calls[0][0];
    expect(insertCall.extraData).toBeNull();
  });

  // ── Printing with promo + card match builds correct key ────────────────

  it("builds promo printing key with is_promo", async () => {
    const repos = createMockRepos({
      allCardNorms: vi.fn().mockResolvedValue([{ normName: "fireball", id: "card-uuid" }]),
      allPrintingKeys: vi.fn().mockResolvedValue([
        {
          shortCode: "OGN-001",
          finish: "normal",
          promoTypeId: "promo-type-id",
          id: "promo-printing-uuid",
          language: "EN",
        },
      ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({
      printings: [makePrinting({ is_promo: true, rarity: "Common", finish: "normal" })],
    });
    await ingestCandidates(transact, "gallery", [card]);

    const insertCall = (repos.ingest as any).insertCandidatePrinting.mock.calls[0][0];
    expect(insertCall.printingId).toBe("promo-printing-uuid");
  });

  it("does not build key when rarity or finish is missing", async () => {
    const repos = createMockRepos({
      allCardNorms: vi.fn().mockResolvedValue([{ normName: "fireball", id: "card-uuid" }]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({
      printings: [makePrinting({ rarity: null, finish: null })],
    });
    await ingestCandidates(transact, "gallery", [card]);

    const insertCall = (repos.ingest as any).insertCandidatePrinting.mock.calls[0][0];
    expect(insertCall.printingId).toBeNull();
  });

  // ── Short_code and extra_data on update ────────────────────────────────

  it("includes shortCode in update when short_code is provided", async () => {
    const repos = createMockRepos({
      allCandidateCardsForProvider: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          externalId: "ext-card-1",
          name: "Old",
          type: "Spell",
          superTypes: [],
          domains: ["Fury"],
          might: 3,
          energy: 2,
          power: null,
          mightBonus: null,
          rulesText: "Deal damage",
          effectText: null,
          tags: [],
          shortCode: "OGN-001",
          extraData: null,
        },
      ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({ name: "New", short_code: "NEW-001" });
    await ingestCandidates(transact, "gallery", [card]);

    const updateCall = (repos.ingest as any).updateCandidateCard.mock.calls[0][1];
    expect(updateCall.shortCode).toBe("NEW-001");
  });

  it("omits extraData from update when extra_data is undefined", async () => {
    const repos = createMockRepos({
      allCandidateCardsForProvider: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          externalId: "ext-card-1",
          name: "Old",
          type: "Spell",
          superTypes: [],
          domains: ["Fury"],
          might: 3,
          energy: 2,
          power: null,
          mightBonus: null,
          rulesText: "Deal damage",
          effectText: null,
          tags: [],
          shortCode: "OGN-001",
          extraData: null,
        },
      ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({ name: "New" });
    delete (card as any).extra_data;
    await ingestCandidates(transact, "gallery", [card]);

    const updateCall = (repos.ingest as any).updateCandidateCard.mock.calls[0][1];
    expect(updateCall).not.toHaveProperty("extraData");
  });

  it("normalizes non-empty object values through camelCaseKeys during comparison", async () => {
    // When comparing existing extraData (camelCase from DB) against incoming
    // extra_data (snake_case from provider), normalize() calls camelCaseKeys()
    // on the incoming object to ensure consistent comparison.
    const repos = createMockRepos({
      allCandidateCardsForProvider: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          externalId: "ext-card-1",
          name: "Fireball",
          type: "Spell",
          superTypes: [],
          domains: ["Fury"],
          might: 3,
          energy: 2,
          power: null,
          mightBonus: null,
          rulesText: "Deal damage",
          effectText: null,
          tags: [],
          shortCode: "OGN-001",
          extraData: { someKey: "old" },
        },
      ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({
      extra_data: { some_key: "new" },
    });
    const result = await ingestCandidates(transact, "gallery", [card]);

    // camelCaseKeys converts {some_key: "new"} to {someKey: "new"} for comparison,
    // which differs from {someKey: "old"}, so update is detected
    expect(result.updates).toBe(1);
    expect(result.updatedCards).toHaveLength(1);
  });

  it("normalizes empty object extra_data to null during comparison", async () => {
    const repos = createMockRepos({
      allCandidateCardsForProvider: vi.fn().mockResolvedValue([
        {
          id: "cc-1",
          externalId: "ext-card-1",
          name: "Fireball",
          type: "Spell",
          superTypes: [],
          domains: ["Fury"],
          might: 3,
          energy: 2,
          power: null,
          mightBonus: null,
          rulesText: "Deal damage",
          effectText: null,
          tags: [],
          shortCode: "OGN-001",
          extraData: { someKey: "val" },
        },
      ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({ extra_data: {} });
    const result = await ingestCandidates(transact, "gallery", [card]);

    // normalize({}) returns null (empty object case), which differs from {someKey: "val"}
    expect(result.updates).toBe(1);
  });

  // ── Link override takes priority ──────────────────────────────────────

  it("link override takes priority over auto-resolved printingId", async () => {
    const repos = createMockRepos({
      allCardNorms: vi.fn().mockResolvedValue([{ normName: "fireball", id: "card-uuid" }]),
      allPrintingKeys: vi
        .fn()
        .mockResolvedValue([
          {
            shortCode: "OGN-001",
            finish: "normal",
            promoTypeId: null,
            id: "auto-uuid",
            language: "EN",
          },
        ]),
      allPrintingLinkOverrides: vi
        .fn()
        .mockResolvedValue([
          { externalId: "ext-print-1", finish: "normal", printingId: "override-uuid" },
        ]),
    });
    const transact = mockTransact(repos);
    const card = makeCard({
      printings: [makePrinting({ rarity: "Common", finish: "normal" })],
    });
    await ingestCandidates(transact, "gallery", [card]);

    const insertCall = (repos.ingest as any).insertCandidatePrinting.mock.calls[0][0];
    expect(insertCall.printingId).toBe("override-uuid");
  });

  // ── image_url handling ────────────────────────────────────────────────

  it("normalizes null image_url to null", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const card = makeCard({
      printings: [makePrinting({ image_url: null })],
    });
    await ingestCandidates(transact, "gallery", [card]);

    const insertCall = (repos.ingest as any).insertCandidatePrinting.mock.calls[0][0];
    expect(insertCall.imageUrl).toBeNull();
  });

  // ── No removal when nothing is old ──────────────────────────────────────

  it("does not call delete when nothing to remove", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    await ingestCandidates(transact, "gallery", [makeCard()]);

    expect((repos.ingest as any).deleteCandidateCards).not.toHaveBeenCalled();
    expect((repos.ingest as any).deleteCandidatePrintings).not.toHaveBeenCalled();
  });
});
