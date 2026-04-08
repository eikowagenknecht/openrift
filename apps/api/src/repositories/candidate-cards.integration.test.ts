import { afterAll, describe, expect, it } from "vitest";

import { CARD_FURY_UNIT, OGS_SET, PRINTING_1, PRINTING_2 } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { candidateCardsRepo } from "./candidate-cards.js";

const ctx = createDbContext("a0000000-0034-4000-a000-000000000001");

describe.skipIf(!ctx)("candidateCardsRepo (integration)", () => {
  const { db } = ctx!;
  const repo = candidateCardsRepo(db);

  // ── Seed IDs from fixtures/constants.ts ──────────────────────────────────
  const SEED_SET_ID = OGS_SET.id;
  const SEED_CARD_ANNIE_ID = CARD_FURY_UNIT.id;
  const SEED_PRINTING_ANNIE_ID = PRINTING_1.id;
  const SEED_PRINTING_FIRESTORM_ID = PRINTING_2.id;

  // ── Test candidate card + printing IDs (deterministic UUIDs) ──────────────
  const CC_ID_1 = "cc000034-0001-4000-a000-000000000001"; // matches 'anniefiery' normName
  const CC_ID_2 = "cc000034-0002-4000-a000-000000000001"; // matches 'firestorm' normName
  const CC_ID_3 = "cc000034-0003-4000-a000-000000000001"; // no match — unique name
  const CP_ID_1 = "c0000034-0001-4000-a000-000000000001";
  const CP_ID_2 = "c0000034-0002-4000-a000-000000000001";
  const CP_ID_3 = "c0000034-0003-4000-a000-000000000001"; // unlinked (no printingId)
  const CP_ID_4 = "c0000034-0004-4000-a000-000000000001"; // for CC_ID_3

  const PROVIDER = "test-cc-34";

  // ── Setup: insert test candidate cards + printings ────────────────────────

  // We use a self-invoking block to run setup once before tests.
  // Vitest doesn't guarantee beforeAll order across parallel files,
  // but createDbContext gives us a shared DB.

  afterAll(async () => {
    // Clean up in reverse FK order
    await db
      .deleteFrom("candidatePrintings")
      .where("id", "in", [CP_ID_1, CP_ID_2, CP_ID_3, CP_ID_4])
      .execute();
    await db.deleteFrom("candidateCards").where("id", "in", [CC_ID_1, CC_ID_2, CC_ID_3]).execute();
  });

  // Insert test data — runs before each describe block because vitest runs
  // `it` blocks sequentially within a describe.
  it("setup: inserts test candidate cards and printings", async () => {
    // Candidate card matching 'Annie, Fiery' (normName = anniefiery)
    await db
      .insertInto("candidateCards")
      .values({
        id: CC_ID_1,
        provider: PROVIDER,
        name: "Annie, Fiery",
        type: "Unit",
        superTypes: ["Champion"],
        domains: ["Fury"],
        might: 4,
        energy: 5,
        power: 1,
        mightBonus: null,
        rulesText: "Test rules text",
        effectText: null,
        tags: ["Annie"],
        externalId: "ext-cc-34-001",
      })
      .execute();

    // Candidate card matching 'Firestorm'
    await db
      .insertInto("candidateCards")
      .values({
        id: CC_ID_2,
        provider: PROVIDER,
        name: "Firestorm",
        type: "Spell",
        superTypes: [],
        domains: ["Fury"],
        might: null,
        energy: 6,
        power: 1,
        mightBonus: null,
        rulesText: null,
        effectText: null,
        tags: [],
        externalId: "ext-cc-34-002",
      })
      .execute();

    // Candidate card with NO matching card
    await db
      .insertInto("candidateCards")
      .values({
        id: CC_ID_3,
        provider: PROVIDER,
        name: "Zzz Unique Unmatched Card 34",
        type: "Unit",
        superTypes: [],
        domains: ["Calm"],
        might: 3,
        energy: 3,
        power: 1,
        mightBonus: null,
        rulesText: null,
        effectText: null,
        tags: [],
        externalId: "ext-cc-34-003",
      })
      .execute();

    // Candidate printing linked to a real printing
    await db
      .insertInto("candidatePrintings")
      .values({
        id: CP_ID_1,
        candidateCardId: CC_ID_1,
        printingId: SEED_PRINTING_ANNIE_ID,
        shortCode: "OGS-001",
        setId: SEED_SET_ID,
        setName: "Proving Grounds",
        rarity: "Epic",
        artVariant: "normal",
        isSigned: false,
        finish: "normal",
        artist: "Test Artist",
        externalId: "ext-cp-34-001",
        flavorText: null,
        printedEffectText: null,
      })
      .execute();

    // Another linked printing
    await db
      .insertInto("candidatePrintings")
      .values({
        id: CP_ID_2,
        candidateCardId: CC_ID_2,
        printingId: SEED_PRINTING_FIRESTORM_ID,
        shortCode: "OGS-002",
        setId: SEED_SET_ID,
        setName: "Proving Grounds",
        rarity: "Uncommon",
        artVariant: "normal",
        isSigned: false,
        finish: "normal",
        artist: "Test Artist 2",
        externalId: "ext-cp-34-002",
        flavorText: null,
        printedEffectText: null,
      })
      .execute();

    // Unlinked printing (no printingId) — for coverage of "unlinked" queries
    await db
      .insertInto("candidatePrintings")
      .values({
        id: CP_ID_3,
        candidateCardId: CC_ID_1,
        printingId: null,
        shortCode: "OGS-099",
        setId: SEED_SET_ID,
        setName: "Proving Grounds",
        rarity: "Common",
        artVariant: null,
        isSigned: null,
        finish: "foil",
        artist: null,
        externalId: "ext-cp-34-003",
        flavorText: null,
        printedEffectText: null,
      })
      .execute();

    // Printing for the unmatched card
    await db
      .insertInto("candidatePrintings")
      .values({
        id: CP_ID_4,
        candidateCardId: CC_ID_3,
        printingId: null,
        shortCode: "ZZZ-001",
        setId: null,
        setName: null,
        rarity: null,
        artVariant: null,
        isSigned: null,
        finish: null,
        artist: null,
        externalId: "ext-cp-34-004",
        flavorText: null,
        printedEffectText: null,
      })
      .execute();
  });

  // ── listCardsWithMissingImages (lines 151-169) ────────────────────────────

  it("listCardsWithMissingImages returns cards lacking active front images", async () => {
    const result = await repo.listCardsWithMissingImages();
    expect(Array.isArray(result)).toBe(true);
    // All seed printings lack printing_images rows, so all should appear
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("cardId");
    expect(result[0]).toHaveProperty("slug");
    expect(result[0]).toHaveProperty("name");
  });

  // ── listCandidatePrintingsForSourceList (lines 186-196) ───────────────────

  it("listCandidatePrintingsForSourceList returns candidate printings", async () => {
    const result = await repo.listCandidatePrintingsForSourceList();
    expect(Array.isArray(result)).toBe(true);
    const ours = result.filter((row) => row.candidateCardId === CC_ID_1);
    expect(ours.length).toBeGreaterThanOrEqual(1);
    expect(ours[0]).toHaveProperty("shortCode");
    expect(ours[0]).toHaveProperty("checkedAt");
    expect(ours[0]).toHaveProperty("printingId");
  });

  // ── distinctArtists (lines 190-198 proxy — actually 190-198 covered, but
  //    the return rows.map line 197 needs coverage) ──────────────────────────

  it("distinctArtists returns an array of strings", async () => {
    const artists = await repo.distinctArtists();
    expect(Array.isArray(artists)).toBe(true);
    expect(artists.length).toBeGreaterThan(0);
    // All entries should be strings
    for (const artist of artists) {
      expect(typeof artist).toBe("string");
    }
  });

  // ── listOrphanCards (lines 240-246) ───────────────────────────────────────

  it("listOrphanCards with excludeIds returns cards not in the list", async () => {
    const result = await repo.listOrphanCards([SEED_CARD_ANNIE_ID]);
    expect(Array.isArray(result)).toBe(true);
    // Annie should be excluded
    const annieInResult = result.find((card) => card.id === SEED_CARD_ANNIE_ID);
    expect(annieInResult).toBeUndefined();
    // But other cards should be present
    expect(result.length).toBeGreaterThan(0);
  });

  it("listOrphanCards with empty excludeIds returns all cards", async () => {
    const result = await repo.listOrphanCards([]);
    expect(result.length).toBeGreaterThan(0);
    const annie = result.find((card) => card.id === SEED_CARD_ANNIE_ID);
    expect(annie).toBeDefined();
  });

  // ── listOrphanPrintingSetInfo (lines 251-261) ─────────────────────────────

  it("listOrphanPrintingSetInfo returns set info for given cardIds", async () => {
    const result = await repo.listOrphanPrintingSetInfo([SEED_CARD_ANNIE_ID]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toHaveProperty("cardId");
    expect(result[0]).toHaveProperty("slug");
    expect(result[0]).toHaveProperty("releasedAt");
  });

  it("listOrphanPrintingSetInfo returns [] for empty cardIds", async () => {
    const result = await repo.listOrphanPrintingSetInfo([]);
    expect(result).toEqual([]);
  });

  // ── listSuggestionsByNormName (lines 266-275) ─────────────────────────────

  it("listSuggestionsByNormName returns matching cards by normName", async () => {
    const result = await repo.listSuggestionsByNormName(["anniefiery"]);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(SEED_CARD_ANNIE_ID);
    expect(result[0]).toHaveProperty("slug");
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("norm");
  });

  it("listSuggestionsByNormName returns [] for empty input", async () => {
    const result = await repo.listSuggestionsByNormName([]);
    expect(result).toEqual([]);
  });

  // ── listAliasSuggestions (lines 280-290) ──────────────────────────────────

  it("listAliasSuggestions returns [] for empty input", async () => {
    const result = await repo.listAliasSuggestions([]);
    expect(result).toEqual([]);
  });

  it("listAliasSuggestions returns [] for non-aliased normNames", async () => {
    const result = await repo.listAliasSuggestions(["nonexistentnormname"]);
    expect(result).toEqual([]);
  });

  // ── listPrintingShortCodes (lines 295-303) ────────────────────────────────

  it("listPrintingShortCodes returns shortCodes for given cardIds", async () => {
    const result = await repo.listPrintingShortCodes([SEED_CARD_ANNIE_ID]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toHaveProperty("cardId");
    expect(result[0]).toHaveProperty("shortCode");
  });

  it("listPrintingShortCodes returns [] for empty input", async () => {
    const result = await repo.listPrintingShortCodes([]);
    expect(result).toEqual([]);
  });

  // ── listUnlinkedCandidatePrintingsForCards (lines 308-338) ────────────────

  it("listUnlinkedCandidatePrintingsForCards returns unlinked printings", async () => {
    const result = await repo.listUnlinkedCandidatePrintingsForCards(["anniefiery"]);
    expect(Array.isArray(result)).toBe(true);
    // Our CP_ID_3 is unlinked (printingId=null) for anniefiery normName
    const unlinked = result.filter((row) => row.shortCode === "OGS-099");
    expect(unlinked.length).toBe(1);
    expect(unlinked[0]).toHaveProperty("cardId");
    expect(unlinked[0]).toHaveProperty("setId");
    expect(unlinked[0]).toHaveProperty("rarity");
    expect(unlinked[0]).toHaveProperty("finish");
  });

  it("listUnlinkedCandidatePrintingsForCards returns [] for empty input", async () => {
    const result = await repo.listUnlinkedCandidatePrintingsForCards([]);
    expect(result).toEqual([]);
  });

  // ── listPrintingsForCards (lines 355-383) ─────────────────────────────────

  it("listPrintingsForCards returns printings with set slug", async () => {
    const result = await repo.listPrintingsForCards([SEED_CARD_ANNIE_ID]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("cardId");
    expect(result[0]).toHaveProperty("setSlug");
    expect(result[0]).toHaveProperty("rarity");
    expect(result[0]).toHaveProperty("finish");
    expect(result[0]).toHaveProperty("artVariant");
    expect(result[0]).toHaveProperty("isSigned");
    expect(result[0]).toHaveProperty("promoTypeId");
  });

  it("listPrintingsForCards returns [] for empty input", async () => {
    const result = await repo.listPrintingsForCards([]);
    expect(result).toEqual([]);
  });

  // ── listCardIdsWithMissingImages (lines 399-419) ──────────────────────────

  it("listCardIdsWithMissingImages returns card IDs missing front images", async () => {
    const result = await repo.listCardIdsWithMissingImages([SEED_CARD_ANNIE_ID]);
    expect(Array.isArray(result)).toBe(true);
    // Annie's printing has no printing_images rows, so she should appear
    expect(result.length).toBe(1);
    expect(result[0].cardId).toBe(SEED_CARD_ANNIE_ID);
  });

  it("listCardIdsWithMissingImages returns [] for empty input", async () => {
    const result = await repo.listCardIdsWithMissingImages([]);
    expect(result).toEqual([]);
  });

  // ── listPendingShortCodes (lines 424-433) ─────────────────────────────────

  it("listPendingShortCodes returns shortCodes for candidate printings", async () => {
    const result = await repo.listPendingShortCodes(["anniefiery"]);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toHaveProperty("norm");
    expect(result[0]).toHaveProperty("shortCode");
  });

  it("listPendingShortCodes returns [] for empty input", async () => {
    const result = await repo.listPendingShortCodes([]);
    expect(result).toEqual([]);
  });

  // ── cardBySlug (line 440) ─────────────────────────────────────────────────

  it("cardBySlug returns a card for existing slug", async () => {
    const result = await repo.cardBySlug("OGS-001");
    expect(result).toBeDefined();
    expect(result!.id).toBe(SEED_CARD_ANNIE_ID);
  });

  it("cardBySlug returns undefined for nonexistent slug", async () => {
    const result = await repo.cardBySlug("NONEXISTENT-SLUG");
    expect(result).toBeUndefined();
  });

  // ── printingShortCodesForCard (line 503) ──────────────────────────────────

  it("printingShortCodesForCard returns short codes for a card", async () => {
    const result = await repo.printingShortCodesForCard(SEED_CARD_ANNIE_ID);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toHaveProperty("shortCode");
  });

  // ── candidateCardsByNormNames (lines 508-518) ─────────────────────────────

  it("candidateCardsByNormNames returns matching candidate cards", async () => {
    const result = await repo.candidateCardsByNormNames(["anniefiery"]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const ours = result.find((card) => card.id === CC_ID_1);
    expect(ours).toBeDefined();
    expect(ours!.provider).toBe(PROVIDER);
  });

  it("candidateCardsByNormNames returns [] for empty input", async () => {
    const result = await repo.candidateCardsByNormNames([]);
    expect(result).toEqual([]);
  });

  // ── candidateCardsByNormNamesOrPrintingShortCodes (lines 526-547) ─────────

  it("candidateCardsByNormNamesOrPrintingShortCodes matches by normName", async () => {
    const result = await repo.candidateCardsByNormNamesOrPrintingShortCodes(
      ["anniefiery"],
      ["NONEXISTENT"],
    );
    const ours = result.find((card) => card.id === CC_ID_1);
    expect(ours).toBeDefined();
  });

  it("candidateCardsByNormNamesOrPrintingShortCodes matches by shortCode", async () => {
    const result = await repo.candidateCardsByNormNamesOrPrintingShortCodes(
      ["nonexistentnorm"],
      ["OGS-001"],
    );
    // CC_ID_1 has a candidate printing with shortCode OGS-001
    const ours = result.find((card) => card.id === CC_ID_1);
    expect(ours).toBeDefined();
  });

  // ── printingsForCard (lines 552-562) ──────────────────────────────────────

  it("printingsForCard returns printings with promoTypeSlug", async () => {
    const result = await repo.printingsForCard(SEED_CARD_ANNIE_ID);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("promoTypeSlug");
  });

  // ── candidatePrintingsForCandidateCards (lines 601-616) ───────────────────

  it("candidatePrintingsForCandidateCards returns printings for given IDs", async () => {
    const result = await repo.candidatePrintingsForCandidateCards([CC_ID_1]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const ours = result.filter((row) => row.candidateCardId === CC_ID_1);
    expect(ours.length).toBeGreaterThanOrEqual(1);
  });

  it("candidatePrintingsForCandidateCards returns [] for empty input", async () => {
    const result = await repo.candidatePrintingsForCandidateCards([]);
    expect(result).toEqual([]);
  });

  // ── candidatePrintingsForDetail (lines 650, 652-685) ──────────────────────

  it("candidatePrintingsForDetail returns detail fields", async () => {
    const result = await repo.candidatePrintingsForDetail([CC_ID_1]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("candidateCardId");
    expect(result[0]).toHaveProperty("printingId");
    expect(result[0]).toHaveProperty("shortCode");
    expect(result[0]).toHaveProperty("setId");
    expect(result[0]).toHaveProperty("setName");
    expect(result[0]).toHaveProperty("rarity");
    expect(result[0]).toHaveProperty("imageUrl");
    expect(result[0]).toHaveProperty("externalId");
    expect(result[0]).toHaveProperty("extraData");
    expect(result[0]).toHaveProperty("checkedAt");
  });

  it("candidatePrintingsForDetail returns [] for empty input", async () => {
    const result = await repo.candidatePrintingsForDetail([]);
    expect(result).toEqual([]);
  });

  // ── promoTypeSlugsByIds (lines 689-692) ───────────────────────────────────

  it("promoTypeSlugsByIds returns [] for empty input", async () => {
    const result = await repo.promoTypeSlugsByIds([]);
    expect(result).toEqual([]);
  });

  it("promoTypeSlugsByIds returns [] for nonexistent IDs", async () => {
    const result = await repo.promoTypeSlugsByIds(["00000000-0000-0000-0000-000000000000"]);
    expect(result).toEqual([]);
  });

  // ── printingImagesForPrintings (lines 697-705) ────────────────────────────

  it("printingImagesForPrintings returns [] for empty input", async () => {
    const result = await repo.printingImagesForPrintings([]);
    expect(result).toEqual([]);
  });

  it("printingImagesForPrintings returns images (or []) for seed printings", async () => {
    const result = await repo.printingImagesForPrintings([SEED_PRINTING_ANNIE_ID]);
    expect(Array.isArray(result)).toBe(true);
    // Seed has no printing_images, so likely empty — but the query path is exercised
  });

  // ── printingImagesForDetail (line 719) ────────────────────────────────────

  it("printingImagesForDetail returns [] for empty input", async () => {
    const result = await repo.printingImagesForDetail([]);
    expect(result).toEqual([]);
  });

  // ── setSlugsByIds (lines 730-733) ─────────────────────────────────────────

  it("setSlugsByIds returns slugs for known set IDs", async () => {
    const result = await repo.setSlugsByIds([SEED_SET_ID]);
    expect(result.length).toBe(1);
    expect(result[0].slug).toBe("OGS");
  });

  it("setSlugsByIds returns [] for empty input", async () => {
    const result = await repo.setSlugsByIds([]);
    expect(result).toEqual([]);
  });

  // ── setInfoByIds (line 748) ───────────────────────────────────────────────

  it("setInfoByIds returns set info for known IDs", async () => {
    const result = await repo.setInfoByIds([SEED_SET_ID]);
    expect(result.length).toBe(1);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("slug");
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("releasedAt");
    expect(result[0]).toHaveProperty("printedTotal");
  });

  it("setInfoByIds returns [] for empty input", async () => {
    const result = await repo.setInfoByIds([]);
    expect(result).toEqual([]);
  });

  // ── setPrintedTotalBySlugs (line 762) ─────────────────────────────────────

  it("setPrintedTotalBySlugs returns totals for known slugs", async () => {
    const result = await repo.setPrintedTotalBySlugs(["OGS"]);
    expect(result.length).toBe(1);
    expect(result[0].slug).toBe("OGS");
    expect(result[0]).toHaveProperty("printedTotal");
  });

  it("setPrintedTotalBySlugs returns [] for empty input", async () => {
    const result = await repo.setPrintedTotalBySlugs([]);
    expect(result).toEqual([]);
  });

  // ── candidateCardsByNormNameAndProvider (lines 774-782) ───────────────────

  it("candidateCardsByNormNameAndProvider returns unfiltered results", async () => {
    const result = await repo.candidateCardsByNormNameAndProvider("anniefiery", PROVIDER);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const ours = result.find((card) => card.id === CC_ID_1);
    expect(ours).toBeDefined();
  });

  it("candidateCardsByNormNameAndProvider returns [] for nonexistent combo", async () => {
    const result = await repo.candidateCardsByNormNameAndProvider("nonexistent", "no-provider");
    expect(result).toEqual([]);
  });

  // ── allCandidatePrintingsForCandidateCards (lines 787-796) ────────────────

  it("allCandidatePrintingsForCandidateCards returns all printings unfiltered", async () => {
    const result = await repo.allCandidatePrintingsForCandidateCards([CC_ID_1]);
    expect(result.length).toBeGreaterThanOrEqual(2); // CP_ID_1 + CP_ID_3
    const ourIds = result.map((row) => row.id);
    expect(ourIds).toContain(CP_ID_1);
    expect(ourIds).toContain(CP_ID_3);
  });

  it("allCandidatePrintingsForCandidateCards returns [] for empty input", async () => {
    const result = await repo.allCandidatePrintingsForCandidateCards([]);
    expect(result).toEqual([]);
  });

  // ── candidateCardsByNormName (lines 801-808) ──────────────────────────────

  it("candidateCardsByNormName returns candidates by exact normName", async () => {
    const result = await repo.candidateCardsByNormName("anniefiery");
    expect(result.length).toBeGreaterThanOrEqual(1);
    const ours = result.find((card) => card.id === CC_ID_1);
    expect(ours).toBeDefined();
  });

  it("candidateCardsByNormName returns [] for nonexistent normName", async () => {
    const result = await repo.candidateCardsByNormName("zzzznonexistent");
    expect(result).toEqual([]);
  });

  // ── candidatePrintingsForUnmatched (lines 870-883) ────────────────────────

  it("candidatePrintingsForUnmatched returns printings ordered by shortCode", async () => {
    const result = await repo.candidatePrintingsForUnmatched([CC_ID_1]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Verify ordering: shortCodes should be ascending
    for (let idx = 1; idx < result.length; idx++) {
      expect(result[idx].shortCode >= result[idx - 1].shortCode).toBe(true);
    }
  });

  it("candidatePrintingsForUnmatched returns [] for empty input", async () => {
    const result = await repo.candidatePrintingsForUnmatched([]);
    expect(result).toEqual([]);
  });

  // ── candidateCardsForDetail (lines ~813-863) — covers both string and array overloads

  it("candidateCardsForDetail with string normName", async () => {
    const result = await repo.candidateCardsForDetail("anniefiery");
    expect(result.length).toBeGreaterThanOrEqual(1);
    const ours = result.find((card) => card.id === CC_ID_1);
    expect(ours).toBeDefined();
    expect(ours!).toHaveProperty("provider");
    expect(ours!).toHaveProperty("name");
    expect(ours!).toHaveProperty("type");
    expect(ours!).toHaveProperty("superTypes");
    expect(ours!).toHaveProperty("domains");
    expect(ours!).toHaveProperty("rulesText");
    expect(ours!).toHaveProperty("effectText");
    expect(ours!).toHaveProperty("tags");
    expect(ours!).toHaveProperty("externalId");
  });

  it("candidateCardsForDetail with array of normNames", async () => {
    const result = await repo.candidateCardsForDetail(["anniefiery", "firestorm"]);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const ourIds = result.map((card) => card.id);
    expect(ourIds).toContain(CC_ID_1);
    expect(ourIds).toContain(CC_ID_2);
  });

  // ── printingsForDetail (lines 567-594 — adjacent uncovered block) ─────────

  it("printingsForDetail returns printings without timestamps", async () => {
    const result = await repo.printingsForDetail(SEED_CARD_ANNIE_ID);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("cardId");
    expect(result[0]).toHaveProperty("setId");
    expect(result[0]).toHaveProperty("shortCode");
    expect(result[0]).toHaveProperty("rarity");
    expect(result[0]).toHaveProperty("finish");
    expect(result[0]).not.toHaveProperty("createdAt");
    expect(result[0]).not.toHaveProperty("updatedAt");
  });

  // ── exportCards / exportPrintings ─────────────────────────────────────────

  it("exportCards returns all cards ordered by name", async () => {
    const result = await repo.exportCards();
    expect(result.length).toBeGreaterThan(0);
    const names = result.map((card) => card.name);
    expect(names).toEqual([...names].sort());
  });

  it("exportPrintings returns printings with set info and image data", async () => {
    const result = await repo.exportPrintings();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("setSlug");
    expect(result[0]).toHaveProperty("setName");
    expect(result[0]).toHaveProperty("imageId");
    expect(result[0]).toHaveProperty("rehostedUrl");
    expect(result[0]).toHaveProperty("originalUrl");
  });
});
