import { afterAll, describe, expect, it } from "vitest";

import {
  CARD_FURY_UNIT,
  OGS_SET,
  PRINTING_1,
  PRINTING_2,
} from "../../../test/fixtures/constants.js";
import { createDbContext } from "../../../test/integration-context.js";
import { candidateCardsRepo } from "./candidate-cards.js";

const ctx = createDbContext("a0000000-0034-4000-a000-000000000001");

describe.skipIf(!ctx)("candidateCardsRepo (integration)", () => {
  const { db } = ctx!;
  const repo = candidateCardsRepo(db);

  const SEED_SET_ID = OGS_SET.id;
  const SEED_CARD_ANNIE_ID = CARD_FURY_UNIT.id;
  const SEED_PRINTING_ANNIE_ID = PRINTING_1.id;
  const SEED_PRINTING_FIRESTORM_ID = PRINTING_2.id;

  const CC_ID_1 = "cc000034-0001-4000-a000-000000000001";
  const CC_ID_2 = "cc000034-0002-4000-a000-000000000001";
  const CC_ID_3 = "cc000034-0003-4000-a000-000000000001";
  const CP_ID_1 = "c0000034-0001-4000-a000-000000000001";
  const CP_ID_2 = "c0000034-0002-4000-a000-000000000001";
  const CP_ID_3 = "c0000034-0003-4000-a000-000000000001";
  const CP_ID_4 = "c0000034-0004-4000-a000-000000000001";
  const CP_ID_5 = "c0000034-0005-4000-a000-000000000001";
  const CP_ID_6 = "c0000034-0006-4000-a000-000000000001";

  const PROVIDER = "test-cc-34";

  afterAll(async () => {
    await db
      .deleteFrom("candidatePrintings")
      .where("id", "in", [CP_ID_1, CP_ID_2, CP_ID_3, CP_ID_4, CP_ID_5, CP_ID_6])
      .execute();
    await db.deleteFrom("candidateCards").where("id", "in", [CC_ID_1, CC_ID_2, CC_ID_3]).execute();
  });

  // Insert test data — runs before each describe block because vitest runs
  // `it` blocks sequentially within a describe.
  it("setup: inserts test candidate cards and printings", async () => {
    await db
      .insertInto("candidateCards")
      .values({
        id: CC_ID_1,
        provider: PROVIDER,
        name: "Annie, Fiery",
        types: ["unit"],
        superTypes: ["champion"],
        domains: ["fury"],
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

    await db
      .insertInto("candidateCards")
      .values({
        id: CC_ID_2,
        provider: PROVIDER,
        name: "Firestorm",
        types: ["spell"],
        superTypes: [],
        domains: ["fury"],
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

    await db
      .insertInto("candidateCards")
      .values({
        id: CC_ID_3,
        provider: PROVIDER,
        name: "Zzz Unique Unmatched Card 34",
        types: ["unit"],
        superTypes: [],
        domains: ["calm"],
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

    await db
      .insertInto("candidatePrintings")
      .values({
        id: CP_ID_1,
        candidateCardId: CC_ID_1,
        printingId: SEED_PRINTING_ANNIE_ID,
        shortCode: "OGS-001",
        setId: SEED_SET_ID,
        setName: "Proving Grounds",
        rarity: "epic",
        artVariant: "normal",
        isSigned: false,
        finish: "normal",
        artist: "Test Artist",
        externalId: "ext-cp-34-001",
        flavorText: null,
        printedEffectText: null,
      })
      .execute();

    await db
      .insertInto("candidatePrintings")
      .values({
        id: CP_ID_2,
        candidateCardId: CC_ID_2,
        printingId: SEED_PRINTING_FIRESTORM_ID,
        shortCode: "OGS-002",
        setId: SEED_SET_ID,
        setName: "Proving Grounds",
        rarity: "uncommon",
        artVariant: "normal",
        isSigned: false,
        finish: "normal",
        artist: "Test Artist 2",
        externalId: "ext-cp-34-002",
        flavorText: null,
        printedEffectText: null,
      })
      .execute();

    await db
      .insertInto("candidatePrintings")
      .values({
        id: CP_ID_3,
        candidateCardId: CC_ID_1,
        printingId: null,
        shortCode: "OGS-099",
        setId: SEED_SET_ID,
        setName: "Proving Grounds",
        rarity: "common",
        artVariant: null,
        isSigned: null,
        finish: "foil",
        artist: null,
        externalId: "ext-cp-34-003",
        flavorText: null,
        printedEffectText: null,
      })
      .execute();

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

    // SC is inserted before EN so heap order alone would put SC first;
    // the ordering test below relies on that.
    await db
      .insertInto("candidatePrintings")
      .values({
        id: CP_ID_5,
        candidateCardId: CC_ID_3,
        printingId: null,
        shortCode: "ZZZ-002",
        setId: null,
        setName: null,
        rarity: null,
        artVariant: null,
        isSigned: null,
        finish: null,
        artist: null,
        language: "SC",
        externalId: "ext-cp-34-005",
        flavorText: null,
        printedEffectText: null,
      })
      .execute();
    await db
      .insertInto("candidatePrintings")
      .values({
        id: CP_ID_6,
        candidateCardId: CC_ID_3,
        printingId: null,
        shortCode: "ZZZ-002",
        setId: null,
        setName: null,
        rarity: null,
        artVariant: null,
        isSigned: null,
        finish: null,
        artist: null,
        language: "EN",
        externalId: "ext-cp-34-006",
        flavorText: null,
        printedEffectText: null,
      })
      .execute();
  });

  it("listCardsWithMissingImages returns cards lacking active front images", async () => {
    await db
      .updateTable("printingImages")
      .set({ isActive: false })
      .where("printingId", "=", SEED_PRINTING_ANNIE_ID)
      .where("face", "=", "front")
      .where("isActive", "=", true)
      .execute();

    const result = await repo.listCardsWithMissingImages();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("cardId");
    expect(result[0]).toHaveProperty("slug");
    expect(result[0]).toHaveProperty("name");

    const annie = result.find((r) => r.cardId === SEED_CARD_ANNIE_ID);
    expect(annie).toBeDefined();
    expect(annie?.byLanguage).toContainEqual(
      expect.objectContaining({ language: "EN", count: expect.any(Number) }),
    );
    expect(annie?.byLanguage.find((e) => e.language === "EN")?.count).toBeGreaterThan(0);

    await db
      .updateTable("printingImages")
      .set({ isActive: true })
      .where("printingId", "=", SEED_PRINTING_ANNIE_ID)
      .where("face", "=", "front")
      .execute();
  });

  it("listCandidatePrintingsForSourceList returns candidate printings", async () => {
    const result = await repo.listCandidatePrintingsForSourceList();
    expect(Array.isArray(result)).toBe(true);
    const ours = result.filter((row) => row.candidateCardId === CC_ID_1);
    expect(ours.length).toBeGreaterThanOrEqual(1);
    expect(ours[0]).toHaveProperty("shortCode");
    expect(ours[0]).toHaveProperty("checkedAt");
    expect(ours[0]).toHaveProperty("printingId");
  });

  it("listCandidatePrintingsForSourceList orders by language sort order", async () => {
    const result = await repo.listCandidatePrintingsForSourceList();
    const ours = result.filter((row) => row.candidateCardId === CC_ID_3);
    expect(ours.map((r) => [r.shortCode, r.language])).toEqual([
      ["ZZZ-002", "EN"], // EN (sort_order 1) before SC (sort_order 3)...
      ["ZZZ-002", "SC"], // ...despite the SC row being inserted first
      ["ZZZ-001", null], // unknown language sorts last
    ]);
  });

  it("distinctArtists returns an array of strings", async () => {
    const artists = await repo.distinctArtists();
    expect(Array.isArray(artists)).toBe(true);
    expect(artists.length).toBeGreaterThan(0);
    for (const artist of artists) {
      expect(typeof artist).toBe("string");
    }
  });

  it("cardBySlug returns a card for existing slug", async () => {
    const result = await repo.cardBySlug(CARD_FURY_UNIT.slug);
    expect(result).toBeDefined();
    expect(result!.id).toBe(SEED_CARD_ANNIE_ID);
  });

  it("cardBySlug returns undefined for nonexistent slug", async () => {
    const result = await repo.cardBySlug("NONEXISTENT-SLUG");
    expect(result).toBeUndefined();
  });

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
    expect(result[0]).toHaveProperty("printedYear");
    expect(result[0]).toHaveProperty("externalId");
    expect(result[0]).toHaveProperty("extraData");
    expect(result[0]).toHaveProperty("checkedAt");
  });

  it("candidatePrintingsForDetail returns [] for empty input", async () => {
    const result = await repo.candidatePrintingsForDetail([]);
    expect(result).toEqual([]);
  });

  it("candidatePrintingsForDetail orders by language sort order like accepted printings", async () => {
    const result = await repo.candidatePrintingsForDetail([CC_ID_3]);
    expect(result.map((r) => [r.shortCode, r.language])).toEqual([
      ["ZZZ-002", "EN"], // EN (sort_order 1) before SC (sort_order 3)...
      ["ZZZ-002", "SC"], // ...despite the SC row being inserted first
      ["ZZZ-001", null], // unknown language sorts last
    ]);
  });

  it("markerSlugsByIds returns [] for empty input", async () => {
    const result = await repo.markerSlugsByIds([]);
    expect(result).toEqual([]);
  });

  it("markerSlugsByIds returns [] for nonexistent IDs", async () => {
    const result = await repo.markerSlugsByIds(["00000000-0000-0000-0000-000000000000"]);
    expect(result).toEqual([]);
  });

  it("printingImagesForDetail returns [] for empty input", async () => {
    const result = await repo.printingImagesForDetail([]);
    expect(result).toEqual([]);
  });

  it("setInfoByIds returns set info for known IDs", async () => {
    const result = await repo.setInfoByIds([SEED_SET_ID]);
    expect(result.length).toBe(1);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("slug");
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("printedTotal");
  });

  it("setInfoByIds returns [] for empty input", async () => {
    const result = await repo.setInfoByIds([]);
    expect(result).toEqual([]);
  });

  it("setPrintedTotalBySlugs returns totals for known slugs", async () => {
    const result = await repo.setPrintedTotalBySlugs(["OGS"]);
    expect(result.length).toBe(1);
    expect(result[0]!.slug).toBe("OGS");
    expect(result[0]).toHaveProperty("printedTotal");
  });

  it("setPrintedTotalBySlugs returns [] for empty input", async () => {
    const result = await repo.setPrintedTotalBySlugs([]);
    expect(result).toEqual([]);
  });

  it("allCandidatePrintingsForCandidateCards returns all printings unfiltered", async () => {
    const result = await repo.allCandidatePrintingsForCandidateCards([CC_ID_1]);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const ourIds = result.map((row) => row.id);
    expect(ourIds).toContain(CP_ID_1);
    expect(ourIds).toContain(CP_ID_3);
  });

  it("allCandidatePrintingsForCandidateCards returns [] for empty input", async () => {
    const result = await repo.allCandidatePrintingsForCandidateCards([]);
    expect(result).toEqual([]);
  });

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

  it("candidateCardsForDetail with string normName", async () => {
    const result = await repo.candidateCardsForDetail("anniefiery");
    expect(result.length).toBeGreaterThanOrEqual(1);
    const ours = result.find((card) => card.id === CC_ID_1);
    expect(ours).toBeDefined();
    expect(ours!).toHaveProperty("provider");
    expect(ours!).toHaveProperty("name");
    expect(ours!).toHaveProperty("types");
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
