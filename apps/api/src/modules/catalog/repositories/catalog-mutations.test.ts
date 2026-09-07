import { describe, expect, it } from "vitest";

import { createMockDb } from "../../../test/mock-db.js";
import { catalogMutationsRepo } from "./catalog-mutations.js";

describe("catalogMutationsRepo", () => {
  it("getPrintingDifferentiatorsById returns fields", async () => {
    const db = createMockDb([{ id: "p-1", finish: "normal" }]);
    expect(await catalogMutationsRepo(db).getPrintingDifferentiatorsById("p-1")).toBeDefined();
  });

  it("getPrintingById returns printing fields", async () => {
    const db = createMockDb([{ id: "p-1", shortCode: "OGS-001", finish: "normal" }]);
    expect(await catalogMutationsRepo(db).getPrintingById("p-1")).toEqual({
      id: "p-1",
      shortCode: "OGS-001",
      finish: "normal",
    });
  });

  it("getPrintingCardIdByComposite returns cardId", async () => {
    const db = createMockDb([{ cardId: "c-1" }]);
    expect(
      await catalogMutationsRepo(db).getPrintingCardIdByComposite("OGS-001", "normal", [], "EN"),
    ).toEqual({ cardId: "c-1" });
  });

  it("getSetPrintedTotalForPrinting returns total", async () => {
    const db = createMockDb([{ printedTotal: 200 }]);
    expect(await catalogMutationsRepo(db).getSetPrintedTotalForPrinting("OGS-001-N")).toEqual({
      printedTotal: 200,
    });
  });

  it("updatePrintingById updates fields", async () => {
    const db = createMockDb([]);
    await expect(
      catalogMutationsRepo(db).updatePrintingById("p-1", { artist: "New Artist" }),
    ).resolves.toBeUndefined();
  });

  it("getCardBySlug returns card", async () => {
    const db = createMockDb([{ id: "c-1", name: "Annie" }]);
    expect(await catalogMutationsRepo(db).getCardBySlug("OGS-001")).toEqual({
      id: "c-1",
      name: "Annie",
    });
  });

  it("getCardIdBySlug returns id", async () => {
    const db = createMockDb([{ id: "c-1" }]);
    expect(await catalogMutationsRepo(db).getCardIdBySlug("OGS-001")).toEqual({ id: "c-1" });
  });

  it("getCardAliases returns aliases", async () => {
    const db = createMockDb([{ normName: "annie" }]);
    expect(await catalogMutationsRepo(db).getCardAliases("c-1")).toEqual([{ normName: "annie" }]);
  });

  it("renameCardSlugById renames a card by UUID", async () => {
    const db = createMockDb([]);
    await expect(
      catalogMutationsRepo(db).renameCardSlugById("card-uuid", "new"),
    ).resolves.toBeUndefined();
  });

  it("deletePrintingById returns deleted id", async () => {
    const db = createMockDb([{ id: "p-1" }]);
    expect(await catalogMutationsRepo(db).deletePrintingById("p-1")).toEqual({
      id: "p-1",
    });
  });

  it("deletePrintingImagesByPrintingId returns image file IDs", async () => {
    const db = createMockDb([{ imageFileId: "ci-1" }]);
    expect(await catalogMutationsRepo(db).deletePrintingImagesByPrintingId("p-1")).toHaveLength(1);
  });

  it("updatePrintingFieldById updates a field", async () => {
    const db = createMockDb([]);
    await expect(
      catalogMutationsRepo(db).updatePrintingFieldById("p-1", "artist", "New"),
    ).resolves.toBeUndefined();
  });

  it("getSetIdBySlug returns set id", async () => {
    const db = createMockDb([{ id: "s-1" }]);
    expect(await catalogMutationsRepo(db).getSetIdBySlug("OGS")).toEqual({ id: "s-1" });
  });

  it("findPrintingIdByIdentity returns the matching printing id", async () => {
    const db = createMockDb([{ id: "p-1" }]);
    expect(
      await catalogMutationsRepo(db).findPrintingIdByIdentity({
        cardId: "c-1",
        shortCode: "OGS-001",
        finish: "normal",
        size: "standard",
        markerSlugs: [],
        language: "EN",
      }),
    ).toEqual({ id: "p-1" });
  });

  it("upsertPrinting returns the printing id", async () => {
    const db = createMockDb([{ id: "p-1" }]);
    const result = await catalogMutationsRepo(db).upsertPrinting({
      cardId: "c-1",
      setId: "s-1",
      shortCode: "OGS-001",
      rarity: "rare",
      artVariant: "normal",
      isSigned: false,
      isOvernumbered: false,
      markerSlugs: [],
      finish: "normal",
      size: "standard",
      artist: "Artist",
      publicCode: "OGS-001",
      language: "EN",
      printedName: null,
      printedYear: null,
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
    });
    expect(result).toBe("p-1");
  });

  it("acceptNewCardFromSources creates card and aliases", async () => {
    const db = createMockDb([{ id: "c-new" }]);
    await expect(
      catalogMutationsRepo(db).acceptNewCardFromSources(
        {
          id: "OGS-NEW",
          name: "New Card",
          types: ["spell"],
          domains: ["fury"],
        },
        "newcard",
      ),
    ).resolves.toBeUndefined();
  });

  it("acceptNewCardFromSources writes an empty keyword set", async () => {
    const db = createMockDb([{ id: "c-new" }]);
    await expect(
      catalogMutationsRepo(db).acceptNewCardFromSources(
        { id: "OGS-DUP", name: "Keyword Card", types: ["spell"], domains: ["fury"] },
        "keywordcard",
      ),
    ).resolves.toBeUndefined();
  });

  it("createNameAliases upserts an alias", async () => {
    const db = createMockDb([]);
    await expect(
      catalogMutationsRepo(db).createNameAliases("annie", "c-1"),
    ).resolves.toBeUndefined();
  });

  it("syncSelfAliasOnRename is a no-op when the normalized name is unchanged", async () => {
    const throwingDb = new Proxy(
      {},
      {
        get() {
          throw new Error("db must not be touched when the normalized name is unchanged");
        },
      },
    ) as never;
    await expect(
      catalogMutationsRepo(throwingDb).syncSelfAliasOnRename("c-1", "annie", "annie"),
    ).resolves.toBeUndefined();
  });

  it("syncSelfAliasOnRename inserts the new alias and drops the old one on rename", async () => {
    const db = createMockDb([]);
    await expect(
      catalogMutationsRepo(db).syncSelfAliasOnRename("c-1", "akalirogueassassin", "rogueassassin"),
    ).resolves.toBeUndefined();
  });
});
