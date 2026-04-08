import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { candidateMutationsRepo } from "./candidate-mutations.js";

describe("candidateMutationsRepo", () => {
  // ── Candidate card checks ─────────────────────────────────────────────────

  it("checkCandidateCard updates checked_at", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    const result = await candidateMutationsRepo(db).checkCandidateCard("cc-1");
    expect(result).toBeDefined();
  });

  it("uncheckCandidateCard clears checked_at", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    const result = await candidateMutationsRepo(db).uncheckCandidateCard("cc-1");
    expect(result).toBeDefined();
  });

  it("checkAllCandidateCards returns affected count", async () => {
    const db = createMockDb([{ numUpdatedRows: 3n }]);
    const result = await candidateMutationsRepo(db).checkAllCandidateCards(["annie"], "c-1");
    expect(result).toBe(3);
  });

  // ── Candidate printing checks ─────────────────────────────────────────────

  it("checkCandidatePrinting updates checked_at", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    expect(await candidateMutationsRepo(db).checkCandidatePrinting("cp-1")).toBeDefined();
  });

  it("uncheckCandidatePrinting clears checked_at", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    expect(await candidateMutationsRepo(db).uncheckCandidatePrinting("cp-1")).toBeDefined();
  });

  it("checkAllCandidatePrintings returns 0 when no ids provided", async () => {
    const db = createMockDb([]);
    expect(await candidateMutationsRepo(db).checkAllCandidatePrintings()).toBe(0);
  });

  it("checkAllCandidatePrintings with printingId", async () => {
    const db = createMockDb([{ numUpdatedRows: 2n }]);
    expect(await candidateMutationsRepo(db).checkAllCandidatePrintings("p-1")).toBe(2);
  });

  it("checkAllCandidatePrintings with extraIds", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    expect(await candidateMutationsRepo(db).checkAllCandidatePrintings(undefined, ["cp-1"])).toBe(
      1,
    );
  });

  it("checkAllCandidatePrintings with both printingId and extraIds", async () => {
    const db = createMockDb([{ numUpdatedRows: 3n }]);
    expect(
      await candidateMutationsRepo(db).checkAllCandidatePrintings("p-1", ["cp-1", "cp-2"]),
    ).toBe(3);
  });

  // ── Candidate printing mutations ──────────────────────────────────────────

  it("patchCandidatePrinting updates fields", async () => {
    const db = createMockDb([{ numUpdatedRows: 1n }]);
    expect(
      await candidateMutationsRepo(db).patchCandidatePrinting("cp-1", { rarity: "Rare" }),
    ).toBeDefined();
  });

  it("deleteCandidatePrinting deletes a printing", async () => {
    const db = createMockDb([{ numDeletedRows: 1n }]);
    expect(await candidateMutationsRepo(db).deleteCandidatePrinting("cp-1")).toBeDefined();
  });

  it("getCandidatePrintingById returns a printing", async () => {
    const db = createMockDb([{ id: "cp-1" }]);
    expect(await candidateMutationsRepo(db).getCandidatePrintingById("cp-1")).toEqual({
      id: "cp-1",
    });
  });

  it("getPrintingDifferentiatorsById returns fields", async () => {
    const db = createMockDb([{ id: "p-1", finish: "normal" }]);
    expect(await candidateMutationsRepo(db).getPrintingDifferentiatorsById("p-1")).toBeDefined();
  });

  it("copyCandidatePrinting inserts a copy", async () => {
    const ps = {
      id: "cp-1",
      candidateCardId: "cc-1",
      printingId: null,
      shortCode: "OGS-001",
      setId: "s-1",
      setName: "Proving Grounds",
      rarity: "Rare",
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
      promoTypeId: null,
      checkedAt: null,
      normName: "annie",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;
    const target = {
      id: "p-new",
      rarity: "Rare",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "normal",
    };
    const db = createMockDb([]);
    await expect(
      candidateMutationsRepo(db).copyCandidatePrinting(ps, target),
    ).resolves.toBeUndefined();
  });

  // ── Linking ───────────────────────────────────────────────────────────────

  it("getPrintingById returns printing fields", async () => {
    const db = createMockDb([{ id: "p-1", shortCode: "OGS-001", finish: "normal" }]);
    expect(await candidateMutationsRepo(db).getPrintingById("p-1")).toEqual({
      id: "p-1",
      shortCode: "OGS-001",
      finish: "normal",
    });
  });

  it("getPrintingCardIdById returns cardId", async () => {
    const db = createMockDb([{ cardId: "c-1" }]);
    expect(await candidateMutationsRepo(db).getPrintingCardIdById("p-1")).toEqual({
      cardId: "c-1",
    });
  });

  it("getPrintingCardIdByComposite returns cardId", async () => {
    const db = createMockDb([{ cardId: "c-1" }]);
    expect(
      await candidateMutationsRepo(db).getPrintingCardIdByComposite(
        "OGS-001",
        "normal",
        null,
        "EN",
      ),
    ).toEqual({ cardId: "c-1" });
  });

  it("getSetPrintedTotalForPrinting returns total", async () => {
    const db = createMockDb([{ printedTotal: 200 }]);
    expect(await candidateMutationsRepo(db).getSetPrintedTotalForPrinting("OGS-001-N")).toEqual({
      printedTotal: 200,
    });
  });

  it("updatePrintingById updates fields", async () => {
    const db = createMockDb([]);
    await expect(
      candidateMutationsRepo(db).updatePrintingById("p-1", { artist: "New Artist" }),
    ).resolves.toBeUndefined();
  });

  it("linkCandidatePrintings links printings", async () => {
    const db = createMockDb([]);
    await expect(
      candidateMutationsRepo(db).linkCandidatePrintings(["cp-1"], "p-1"),
    ).resolves.toBeUndefined();
  });

  it("linkAndCheckCandidatePrintings links and checks", async () => {
    const db = createMockDb([]);
    await expect(
      candidateMutationsRepo(db).linkAndCheckCandidatePrintings(["cp-1"], "p-1"),
    ).resolves.toBeUndefined();
  });

  it("upsertPrintingLinkOverrides upserts overrides", async () => {
    const db = createMockDb([{ externalId: "ext-1", finish: "normal" }]);
    await expect(
      candidateMutationsRepo(db).upsertPrintingLinkOverrides(["cp-1"], "p-1"),
    ).resolves.toBeUndefined();
  });

  it("upsertPrintingLinkOverrides handles null finish", async () => {
    const db = createMockDb([{ externalId: "ext-1", finish: null }]);
    await expect(
      candidateMutationsRepo(db).upsertPrintingLinkOverrides(["cp-1"], "p-1"),
    ).resolves.toBeUndefined();
  });

  it("removePrintingLinkOverrides removes overrides", async () => {
    const db = createMockDb([{ externalId: "ext-1", finish: "normal" }]);
    await expect(
      candidateMutationsRepo(db).removePrintingLinkOverrides(["cp-1"]),
    ).resolves.toBeUndefined();
  });

  it("removePrintingLinkOverrides handles null finish", async () => {
    const db = createMockDb([{ externalId: "ext-1", finish: null }]);
    await expect(
      candidateMutationsRepo(db).removePrintingLinkOverrides(["cp-1"]),
    ).resolves.toBeUndefined();
  });

  it("removePrintingLinkOverrides is no-op for empty result", async () => {
    const db = createMockDb([]);
    await expect(
      candidateMutationsRepo(db).removePrintingLinkOverrides(["cp-1"]),
    ).resolves.toBeUndefined();
  });

  // ── Card mutations ────────────────────────────────────────────────────────

  it("getCardBySlug returns card", async () => {
    const db = createMockDb([{ id: "c-1", name: "Annie" }]);
    expect(await candidateMutationsRepo(db).getCardBySlug("OGS-001")).toEqual({
      id: "c-1",
      name: "Annie",
    });
  });

  it("getCardIdBySlug returns id", async () => {
    const db = createMockDb([{ id: "c-1" }]);
    expect(await candidateMutationsRepo(db).getCardIdBySlug("OGS-001")).toEqual({ id: "c-1" });
  });

  it("getCardAliases returns aliases", async () => {
    const db = createMockDb([{ normName: "annie" }]);
    expect(await candidateMutationsRepo(db).getCardAliases("c-1")).toEqual([{ normName: "annie" }]);
  });

  it("renameCardSlugById renames a card by UUID", async () => {
    const db = createMockDb([]);
    await expect(
      candidateMutationsRepo(db).renameCardSlugById("card-uuid", "new"),
    ).resolves.toBeUndefined();
  });

  it("getCardTexts returns text fields", async () => {
    const db = createMockDb([{ rulesText: "text", effectText: null }]);
    expect(await candidateMutationsRepo(db).getCardTexts("OGS-001")).toBeDefined();
  });

  it("updateCardBySlug updates fields", async () => {
    const db = createMockDb([]);
    await expect(
      candidateMutationsRepo(db).updateCardBySlug("OGS-001", { name: "Updated" }),
    ).resolves.toBeUndefined();
  });

  // ── Printing mutations ────────────────────────────────────────────────────

  it("deletePrintingById returns deleted id", async () => {
    const db = createMockDb([{ id: "p-1" }]);
    expect(await candidateMutationsRepo(db).deletePrintingById("p-1")).toEqual({
      id: "p-1",
    });
  });

  it("unlinkCandidatePrintingsByPrintingId unlinks", async () => {
    const db = createMockDb([]);
    await expect(
      candidateMutationsRepo(db).unlinkCandidatePrintingsByPrintingId("p-1"),
    ).resolves.toBeUndefined();
  });

  it("deletePrintingImagesByPrintingId returns card image IDs", async () => {
    const db = createMockDb([{ cardImageId: "ci-1" }]);
    expect(await candidateMutationsRepo(db).deletePrintingImagesByPrintingId("p-1")).toHaveLength(
      1,
    );
  });

  it("deletePrintingLinkOverridesById deletes overrides", async () => {
    const db = createMockDb([]);
    await expect(
      candidateMutationsRepo(db).deletePrintingLinkOverridesById("p-1"),
    ).resolves.toBeUndefined();
  });

  it("updatePrintingFieldById updates a field", async () => {
    const db = createMockDb([]);
    await expect(
      candidateMutationsRepo(db).updatePrintingFieldById("p-1", "artist", "New"),
    ).resolves.toBeUndefined();
  });

  // ── Accept printing ───────────────────────────────────────────────────────

  it("getProviderNameForCandidatePrinting returns provider", async () => {
    const db = createMockDb([{ provider: "test" }]);
    expect(await candidateMutationsRepo(db).getProviderNameForCandidatePrinting("cp-1")).toEqual({
      provider: "test",
    });
  });

  it("getSetIdBySlug returns set id", async () => {
    const db = createMockDb([{ id: "s-1" }]);
    expect(await candidateMutationsRepo(db).getSetIdBySlug("OGS")).toEqual({ id: "s-1" });
  });

  it("upsertPrinting returns the printing id", async () => {
    const db = createMockDb([{ id: "p-1" }]);
    const result = await candidateMutationsRepo(db).upsertPrinting({
      cardId: "c-1",
      setId: "s-1",
      shortCode: "OGS-001",
      rarity: "Rare",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "normal",
      artist: "Artist",
      publicCode: "OGS-001",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
    });
    expect(result).toBe("p-1");
  });

  // ── Accept new card helpers ───────────────────────────────────────────────

  it("getCandidateCardNameAndProvider returns name and provider", async () => {
    const db = createMockDb([{ name: "Annie", provider: "test" }]);
    expect(await candidateMutationsRepo(db).getCandidateCardNameAndProvider("cc-1")).toEqual({
      name: "Annie",
      provider: "test",
    });
  });

  it("resolveCardByNormName returns id", async () => {
    const db = createMockDb([{ id: "c-1" }]);
    expect(await candidateMutationsRepo(db).resolveCardByNormName("annie")).toEqual({ id: "c-1" });
  });

  it("resolveCardByAlias returns cardId", async () => {
    const db = createMockDb([{ cardId: "c-1" }]);
    expect(await candidateMutationsRepo(db).resolveCardByAlias("annie")).toEqual({ cardId: "c-1" });
  });

  // ── Delete by provider ────────────────────────────────────────────────────

  it("checkByProvider returns check counts", async () => {
    const db = createMockDb([{ numUpdatedRows: 5n }]);
    const result = await candidateMutationsRepo(db).checkByProvider("test", new Date());
    expect(result.cardsChecked).toBe(5);
    expect(result.printingsChecked).toBe(5);
  });

  it("deleteByProvider returns deleted count", async () => {
    const db = createMockDb([{ numDeletedRows: 10n }]);
    expect(await candidateMutationsRepo(db).deleteByProvider("test")).toBe(10);
  });

  // ── Accept new card ───────────────────────────────────────────────────────

  it("acceptNewCardFromSources creates card and aliases", async () => {
    const db = createMockDb([{ id: "c-new" }]);
    await expect(
      candidateMutationsRepo(db).acceptNewCardFromSources(
        {
          id: "OGS-NEW",
          name: "New Card",
          type: "Spell",
          domains: ["Fury"],
          rulesText: "Deal 3 damage.",
        },
        "newcard",
      ),
    ).resolves.toBeUndefined();
  });

  it("acceptNewCardFromSources deduplicates keywords from rulesText and effectText", async () => {
    const db = createMockDb([{ id: "c-new" }]);
    await expect(
      candidateMutationsRepo(db).acceptNewCardFromSources(
        {
          id: "OGS-DUP",
          name: "Keyword Card",
          type: "Spell",
          domains: ["Fury"],
          rulesText: "[Shield] this unit. [Shield] again.",
          effectText: "[Shield] once more.",
        },
        "keywordcard",
      ),
    ).resolves.toBeUndefined();
  });

  it("createNameAliases upserts an alias", async () => {
    const db = createMockDb([]);
    await expect(
      candidateMutationsRepo(db).createNameAliases("annie", "c-1"),
    ).resolves.toBeUndefined();
  });
});
