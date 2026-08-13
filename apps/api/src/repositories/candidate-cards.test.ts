import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { candidateCardsRepo } from "./candidate-cards.js";

const CARD = { id: "c-1", slug: "OGS-001", name: "Annie", type: "unit", types: ["unit"] };
const CARD_WITH_SETS = { ...CARD, setSlugs: ["ogs"] };
const CC = { id: "cc-1", provider: "test", name: "Annie", normName: "annie" };

describe("candidateCardsRepo", () => {
  // ── Simple list endpoints ──────────────────────────────────────────────────

  it("listAllCards returns cards with setSlugs", async () => {
    const db = createMockDb([CARD_WITH_SETS]);
    expect(await candidateCardsRepo(db).listAllCards()).toEqual([CARD_WITH_SETS]);
  });

  it("listCardsForSourceList returns cards", async () => {
    const db = createMockDb([{ id: "c-1", slug: "OGS-001", name: "Annie", normName: "annie" }]);
    expect(await candidateCardsRepo(db).listCardsForSourceList()).toHaveLength(1);
  });

  it("listAliasesForSourceList returns aliases", async () => {
    const db = createMockDb([{ normName: "annie", cardId: "c-1" }]);
    expect(await candidateCardsRepo(db).listAliasesForSourceList()).toHaveLength(1);
  });

  it("listCandidateCardsForSourceList returns candidate cards", async () => {
    const db = createMockDb([CC]);
    expect(await candidateCardsRepo(db).listCandidateCardsForSourceList()).toEqual([CC]);
  });

  it("listPrintingsForSourceList returns printings", async () => {
    const db = createMockDb([{ cardId: "c-1", shortCode: "OGS-001" }]);
    expect(await candidateCardsRepo(db).listPrintingsForSourceList()).toHaveLength(1);
  });

  it("listCardsWithMissingImages groups the per-language rows by card", async () => {
    const db = createMockDb([
      { cardId: "c-1", slug: "OGS-001", name: "Annie", language: "EN", count: 1 },
      { cardId: "c-1", slug: "OGS-001", name: "Annie", language: "DE", count: 2 },
    ]);
    expect(await candidateCardsRepo(db).listCardsWithMissingImages()).toEqual([
      {
        cardId: "c-1",
        slug: "OGS-001",
        name: "Annie",
        byLanguage: [
          { language: "EN", count: 1 },
          { language: "DE", count: 2 },
        ],
      },
    ]);
  });

  it("listCandidatePrintingsForSourceList returns candidate printings", async () => {
    const db = createMockDb([{ candidateCardId: "cc-1", shortCode: "OGS-001" }]);
    expect(await candidateCardsRepo(db).listCandidatePrintingsForSourceList()).toHaveLength(1);
  });

  it("distinctArtists returns string array", async () => {
    const db = createMockDb([{ artist: "Alice" }, { artist: "Bob" }]);
    const result = await candidateCardsRepo(db).distinctArtists();
    expect(result).toEqual(["Alice", "Bob"]);
  });

  it("distinctProviderNames returns string array", async () => {
    const db = createMockDb([{ provider: "tcgplayer" }]);
    const result = await candidateCardsRepo(db).distinctProviderNames();
    expect(result).toEqual(["tcgplayer"]);
  });

  it("providerStats returns formatted stats", async () => {
    const db = createMockDb([
      { provider: "test", cardCount: 10, printingCount: 20, lastUpdated: "2026-01-01" },
    ]);
    const result = await candidateCardsRepo(db).providerStats();
    expect(result).toEqual([
      { provider: "test", cardCount: 10, printingCount: 20, lastUpdated: "2026-01-01" },
    ]);
  });

  // ── Detail sub-queries ─────────────────────────────────────────────────────

  it("cardBySlug returns a card", async () => {
    const db = createMockDb([CARD]);
    expect(await candidateCardsRepo(db).cardBySlug("OGS-001")).toEqual(CARD);
  });

  it("cardForDetailBySlug returns card details", async () => {
    const db = createMockDb([{ id: "c-1", slug: "OGS-001", name: "Annie" }]);
    expect(await candidateCardsRepo(db).cardForDetailBySlug("OGS-001")).toBeDefined();
  });

  it("cardNameAliases returns aliases", async () => {
    const db = createMockDb([{ normName: "annie" }]);
    expect(await candidateCardsRepo(db).cardNameAliases("c-1")).toHaveLength(1);
  });

  it("printingsForDetail returns detail fields", async () => {
    const db = createMockDb([{ id: "p-1", slug: "OGS-001" }]);
    expect(await candidateCardsRepo(db).printingsForDetail("c-1")).toHaveLength(1);
  });

  it("candidatePrintingsForDetail returns detail fields", async () => {
    const db = createMockDb([{ id: "cp-1" }]);
    expect(await candidateCardsRepo(db).candidatePrintingsForDetail(["cc-1"])).toHaveLength(1);
  });

  it("candidatePrintingsForDetail returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).candidatePrintingsForDetail([])).toEqual([]);
  });

  it("markerSlugsByIds returns slugs", async () => {
    const db = createMockDb([{ id: "pt-1", slug: "promo" }]);
    expect(await candidateCardsRepo(db).markerSlugsByIds(["pt-1"])).toHaveLength(1);
  });

  it("markerSlugsByIds returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).markerSlugsByIds([])).toEqual([]);
  });

  it("printingImagesForDetail returns detail fields", async () => {
    const db = createMockDb([{ id: "pi-1" }]);
    expect(await candidateCardsRepo(db).printingImagesForDetail(["p-1"])).toHaveLength(1);
  });

  it("printingImagesForDetail returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).printingImagesForDetail([])).toEqual([]);
  });

  it("setInfoByIds returns info", async () => {
    const db = createMockDb([
      { id: "s-1", slug: "OGS", name: "Proving Grounds", releasedAt: null, printedTotal: null },
    ]);
    expect(await candidateCardsRepo(db).setInfoByIds(["s-1"])).toHaveLength(1);
  });

  it("setInfoByIds returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).setInfoByIds([])).toEqual([]);
  });

  it("setPrintedTotalBySlugs returns totals", async () => {
    const db = createMockDb([{ slug: "OGS", printedTotal: 200 }]);
    expect(await candidateCardsRepo(db).setPrintedTotalBySlugs(["OGS"])).toHaveLength(1);
  });

  it("setPrintedTotalBySlugs returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).setPrintedTotalBySlugs([])).toEqual([]);
  });

  // ── Unmatched detail sub-queries ───────────────────────────────────────────

  it("allCandidatePrintingsForCandidateCards returns printings", async () => {
    const db = createMockDb([{ id: "cp-1" }]);
    expect(
      await candidateCardsRepo(db).allCandidatePrintingsForCandidateCards(["cc-1"]),
    ).toHaveLength(1);
  });

  it("allCandidatePrintingsForCandidateCards returns [] for empty input", async () => {
    expect(
      await candidateCardsRepo(createMockDb([])).allCandidatePrintingsForCandidateCards([]),
    ).toEqual([]);
  });

  it("candidateCardsByNormName returns cards", async () => {
    const db = createMockDb([CC]);
    expect(await candidateCardsRepo(db).candidateCardsByNormName("annie")).toHaveLength(1);
  });

  it("candidateCardsForDetail with string normName", async () => {
    const db = createMockDb([CC]);
    expect(await candidateCardsRepo(db).candidateCardsForDetail("annie")).toHaveLength(1);
  });

  it("candidateCardsForDetail with array of normNames", async () => {
    const db = createMockDb([CC]);
    expect(await candidateCardsRepo(db).candidateCardsForDetail(["annie"])).toHaveLength(1);
  });

  // ── Export ─────────────────────────────────────────────────────────────────

  it("exportCards returns all cards", async () => {
    const db = createMockDb([CARD]);
    expect(await candidateCardsRepo(db).exportCards()).toEqual([CARD]);
  });

  it("exportPrintings returns printings with set and image info", async () => {
    const db = createMockDb([
      {
        id: "p-1",
        setSlug: "OGS",
        setName: "Proving Grounds",
        imageId: null,
        rehostedUrl: null,
        originalUrl: null,
      },
    ]);
    expect(await candidateCardsRepo(db).exportPrintings()).toHaveLength(1);
  });

  // ── Candidate mutations ───────────────────────────────────────────────

  it("checkCandidateCard updates checked_at", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    const result = await candidateCardsRepo(db).checkCandidateCard("cc-1");
    expect(result).toBeDefined();
  });

  it("uncheckCandidateCard clears checked_at", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    const result = await candidateCardsRepo(db).uncheckCandidateCard("cc-1");
    expect(result).toBeDefined();
  });

  it("checkAllCandidateCards counts the rows it flipped but returns every match", async () => {
    // The count is what this call changed; the ids cover every matching
    // candidate, including ones already checked. A submission checked entry by
    // entry before its printings were done would otherwise stay pending, since
    // a later "check all" updates nothing and so would resolve nothing.
    const db = createMockDb([{ id: "cc-1" }, { id: "cc-2" }, { id: "cc-3" }]);
    const result = await candidateCardsRepo(db).checkAllCandidateCards(["annie"], "c-1");
    expect(result).toEqual({ updated: 3, candidateCardIds: ["cc-1", "cc-2", "cc-3"] });
  });

  // ── Candidate printing checks ─────────────────────────────────────────────

  it("checkCandidatePrinting updates checked_at", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    expect(await candidateCardsRepo(db).checkCandidatePrinting("cp-1")).toBeDefined();
  });

  it("uncheckCandidatePrinting clears checked_at", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    expect(await candidateCardsRepo(db).uncheckCandidatePrinting("cp-1")).toBeDefined();
  });

  it("checkAllCandidatePrintings returns 0 when no ids provided", async () => {
    const db = createMockDb([]);
    expect(await candidateCardsRepo(db).checkAllCandidatePrintings()).toEqual({
      updated: 0,
      candidateCardIds: [],
    });
  });

  it("checkAllCandidatePrintings with printingId", async () => {
    const db = createMockDb([{ candidateCardId: "cc-1" }, { candidateCardId: "cc-2" }]);
    expect(await candidateCardsRepo(db).checkAllCandidatePrintings("p-1")).toEqual({
      updated: 2,
      candidateCardIds: ["cc-1", "cc-2"],
    });
  });

  it("checkAllCandidatePrintings with extraIds", async () => {
    const db = createMockDb([{ candidateCardId: "cc-1" }]);
    expect(await candidateCardsRepo(db).checkAllCandidatePrintings(undefined, ["cp-1"])).toEqual({
      updated: 1,
      candidateCardIds: ["cc-1"],
    });
  });

  it("checkAllCandidatePrintings dedupes parents from the same candidate card", async () => {
    // Two printings of one submission must resolve it once, not twice.
    const db = createMockDb([
      { candidateCardId: "cc-1" },
      { candidateCardId: "cc-1" },
      { candidateCardId: "cc-2" },
    ]);
    expect(
      await candidateCardsRepo(db).checkAllCandidatePrintings("p-1", ["cp-1", "cp-2"]),
    ).toEqual({ updated: 3, candidateCardIds: ["cc-1", "cc-2"] });
  });

  // ── Candidate printing mutations ──────────────────────────────────────────

  it("patchCandidatePrinting updates fields", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    expect(
      await candidateCardsRepo(db).patchCandidatePrinting("cp-1", { rarity: "rare" }),
    ).toBeDefined();
  });

  it("deleteCandidatePrinting deletes a printing", async () => {
    const db = createMockDb([{ numDeletedRows: 1n }]);
    expect(await candidateCardsRepo(db).deleteCandidatePrinting("cp-1")).toBeDefined();
  });

  it("getCandidatePrintingById returns a printing", async () => {
    const db = createMockDb([{ id: "cp-1" }]);
    expect(await candidateCardsRepo(db).getCandidatePrintingById("cp-1")).toEqual({
      id: "cp-1",
    });
  });

  it("copyCandidatePrinting inserts a copy", async () => {
    const ps = {
      id: "cp-1",
      candidateCardId: "cc-1",
      printingId: null,
      shortCode: "OGS-001",
      setId: "s-1",
      setName: "Proving Grounds",
      rarity: "rare",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      artist: "Artist",
      publicCode: null,
      printedRulesText: null,
      printedEffectText: null,
      imageUrl: null,
      flavorText: null,
      externalId: "ext-1",
      extraData: null,
      markerSlugs: [],
      checkedAt: null,
      normName: "annie",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;
    const target = {
      id: "p-new",
      rarity: "rare",
      artVariant: "normal",
      isSigned: false,
      markerSlugs: [],
      finish: "normal",
    };
    const db = createMockDb([]);
    await expect(candidateCardsRepo(db).copyCandidatePrinting(ps, target)).resolves.toBeUndefined();
  });

  // ── Linking ───────────────────────────────────────────────────────────────

  it("linkCandidatePrintings links printings", async () => {
    const db = createMockDb([]);
    await expect(
      candidateCardsRepo(db).linkCandidatePrintings(["cp-1"], "p-1"),
    ).resolves.toBeUndefined();
  });

  it("linkAndCheckCandidatePrintings links and checks", async () => {
    const db = createMockDb([]);
    await expect(
      candidateCardsRepo(db).linkAndCheckCandidatePrintings(["cp-1"], "p-1"),
    ).resolves.toBeUndefined();
  });

  it("upsertPrintingLinkOverrides upserts overrides", async () => {
    const db = createMockDb([{ externalId: "ext-1", finish: "normal" }]);
    await expect(
      candidateCardsRepo(db).upsertPrintingLinkOverrides(["cp-1"], "p-1"),
    ).resolves.toBeUndefined();
  });

  it("upsertPrintingLinkOverrides handles null finish", async () => {
    const db = createMockDb([{ externalId: "ext-1", finish: null }]);
    await expect(
      candidateCardsRepo(db).upsertPrintingLinkOverrides(["cp-1"], "p-1"),
    ).resolves.toBeUndefined();
  });

  it("removePrintingLinkOverrides removes overrides", async () => {
    const db = createMockDb([{ externalId: "ext-1", finish: "normal" }]);
    await expect(
      candidateCardsRepo(db).removePrintingLinkOverrides(["cp-1"]),
    ).resolves.toBeUndefined();
  });

  it("removePrintingLinkOverrides handles null finish", async () => {
    const db = createMockDb([{ externalId: "ext-1", finish: null }]);
    await expect(
      candidateCardsRepo(db).removePrintingLinkOverrides(["cp-1"]),
    ).resolves.toBeUndefined();
  });

  it("removePrintingLinkOverrides is no-op for empty result", async () => {
    const db = createMockDb([]);
    await expect(
      candidateCardsRepo(db).removePrintingLinkOverrides(["cp-1"]),
    ).resolves.toBeUndefined();
  });

  // ── Card mutations ────────────────────────────────────────────────────────

  it("unlinkCandidatePrintingsByPrintingId unlinks", async () => {
    const db = createMockDb([]);
    await expect(
      candidateCardsRepo(db).unlinkCandidatePrintingsByPrintingId("p-1"),
    ).resolves.toBeUndefined();
  });

  it("deletePrintingLinkOverridesById deletes overrides", async () => {
    const db = createMockDb([]);
    await expect(
      candidateCardsRepo(db).deletePrintingLinkOverridesById("p-1"),
    ).resolves.toBeUndefined();
  });

  it("checkByProvider returns check counts", async () => {
    const db = createMockDb([{ numUpdatedRows: 5n }]);
    const result = await candidateCardsRepo(db).checkByProvider("test", new Date());
    expect(result.cardsChecked).toBe(5);
    expect(result.printingsChecked).toBe(5);
  });

  it("deleteByProvider returns deleted count", async () => {
    const db = createMockDb([{ numDeletedRows: 10n }]);
    expect(await candidateCardsRepo(db).deleteByProvider("test")).toBe(10);
  });
});
