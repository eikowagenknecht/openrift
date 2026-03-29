import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { candidateCardsRepo } from "./candidate-cards.js";

const CARD = { id: "c-1", slug: "OGS-001", name: "Annie", type: "Unit" };
const CC = { id: "cc-1", provider: "test", name: "Annie", normName: "annie" };

describe("candidateCardsRepo", () => {
  // ── Simple list endpoints ──────────────────────────────────────────────────

  it("listAllCards returns cards", async () => {
    const db = createMockDb([CARD]);
    expect(await candidateCardsRepo(db).listAllCards()).toEqual([CARD]);
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

  it("listCardsWithMissingImages returns cards", async () => {
    const db = createMockDb([{ cardId: "c-1", slug: "OGS-001", name: "Annie" }]);
    expect(await candidateCardsRepo(db).listCardsWithMissingImages()).toHaveLength(1);
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

  // ── Grouped list sub-queries ───────────────────────────────────────────────

  it("listOrphanCards with excludeIds", async () => {
    const db = createMockDb([CARD]);
    expect(await candidateCardsRepo(db).listOrphanCards(["c-1"])).toEqual([CARD]);
  });

  it("listOrphanCards with empty excludeIds", async () => {
    const db = createMockDb([CARD]);
    expect(await candidateCardsRepo(db).listOrphanCards([])).toEqual([CARD]);
  });

  it("listOrphanPrintingSetInfo returns set info", async () => {
    const db = createMockDb([{ cardId: "c-1", slug: "OGS", releasedAt: "2025-01-01" }]);
    expect(await candidateCardsRepo(db).listOrphanPrintingSetInfo(["c-1"])).toHaveLength(1);
  });

  it("listOrphanPrintingSetInfo returns [] for empty input", async () => {
    const db = createMockDb([]);
    expect(await candidateCardsRepo(db).listOrphanPrintingSetInfo([])).toEqual([]);
  });

  it("listSuggestionsByNormName returns matches", async () => {
    const db = createMockDb([{ id: "c-1", slug: "OGS-001", name: "Annie", norm: "annie" }]);
    expect(await candidateCardsRepo(db).listSuggestionsByNormName(["annie"])).toHaveLength(1);
  });

  it("listSuggestionsByNormName returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).listSuggestionsByNormName([])).toEqual([]);
  });

  it("listAliasSuggestions returns matches", async () => {
    const db = createMockDb([{ id: "c-1", slug: "OGS-001", name: "Annie", norm: "annie" }]);
    expect(await candidateCardsRepo(db).listAliasSuggestions(["annie"])).toHaveLength(1);
  });

  it("listAliasSuggestions returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).listAliasSuggestions([])).toEqual([]);
  });

  it("listPrintingShortCodes returns codes", async () => {
    const db = createMockDb([{ cardId: "c-1", shortCode: "OGS-001" }]);
    expect(await candidateCardsRepo(db).listPrintingShortCodes(["c-1"])).toHaveLength(1);
  });

  it("listPrintingShortCodes returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).listPrintingShortCodes([])).toEqual([]);
  });

  it("listUnlinkedCandidatePrintingsForCards returns unlinked printings", async () => {
    const db = createMockDb([{ cardId: "c-1", shortCode: "OGS-099" }]);
    expect(
      await candidateCardsRepo(db).listUnlinkedCandidatePrintingsForCards(["annie"]),
    ).toHaveLength(1);
  });

  it("listUnlinkedCandidatePrintingsForCards returns [] for empty input", async () => {
    expect(
      await candidateCardsRepo(createMockDb([])).listUnlinkedCandidatePrintingsForCards([]),
    ).toEqual([]);
  });

  it("listPrintingsForCards returns printings with set slug", async () => {
    const db = createMockDb([{ id: "p-1", cardId: "c-1", setSlug: "OGS" }]);
    expect(await candidateCardsRepo(db).listPrintingsForCards(["c-1"])).toHaveLength(1);
  });

  it("listPrintingsForCards returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).listPrintingsForCards([])).toEqual([]);
  });

  it("listCardIdsWithMissingImages returns card IDs", async () => {
    const db = createMockDb([{ cardId: "c-1" }]);
    expect(await candidateCardsRepo(db).listCardIdsWithMissingImages(["c-1"])).toHaveLength(1);
  });

  it("listCardIdsWithMissingImages returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).listCardIdsWithMissingImages([])).toEqual([]);
  });

  it("listPendingShortCodes returns codes", async () => {
    const db = createMockDb([{ norm: "annie", shortCode: "OGS-001" }]);
    expect(await candidateCardsRepo(db).listPendingShortCodes(["annie"])).toHaveLength(1);
  });

  it("listPendingShortCodes returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).listPendingShortCodes([])).toEqual([]);
  });

  // ── Detail sub-queries ─────────────────────────────────────────────────────

  it("cardBySlug returns a card", async () => {
    const db = createMockDb([CARD]);
    expect(await candidateCardsRepo(db).cardBySlug("OGS-001")).toEqual(CARD);
  });

  it("cardForDetail returns card details", async () => {
    const db = createMockDb([{ id: "c-1", slug: "OGS-001", name: "Annie" }]);
    expect(await candidateCardsRepo(db).cardForDetail("OGS-001")).toBeDefined();
  });

  it("cardNameAliases returns aliases", async () => {
    const db = createMockDb([{ normName: "annie" }]);
    expect(await candidateCardsRepo(db).cardNameAliases("c-1")).toHaveLength(1);
  });

  it("printingShortCodesForCard returns short codes", async () => {
    const db = createMockDb([{ shortCode: "OGS-001" }]);
    expect(await candidateCardsRepo(db).printingShortCodesForCard("c-1")).toHaveLength(1);
  });

  it("candidateCardsByNormNames returns cards", async () => {
    const db = createMockDb([CC]);
    expect(await candidateCardsRepo(db).candidateCardsByNormNames(["annie"])).toHaveLength(1);
  });

  it("candidateCardsByNormNames returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).candidateCardsByNormNames([])).toEqual([]);
  });

  it("candidateCardsByNormNamesOrPrintingShortCodes returns cards", async () => {
    const db = createMockDb([CC]);
    expect(
      await candidateCardsRepo(db).candidateCardsByNormNamesOrPrintingShortCodes(
        ["annie"],
        ["OGS-001"],
      ),
    ).toHaveLength(1);
  });

  it("printingsForCard returns printings", async () => {
    const db = createMockDb([{ id: "p-1", promoTypeSlug: null }]);
    expect(await candidateCardsRepo(db).printingsForCard("c-1")).toHaveLength(1);
  });

  it("printingsForDetail returns detail fields", async () => {
    const db = createMockDb([{ id: "p-1", slug: "OGS-001" }]);
    expect(await candidateCardsRepo(db).printingsForDetail("c-1")).toHaveLength(1);
  });

  it("candidatePrintingsForCandidateCards returns printings", async () => {
    const db = createMockDb([{ id: "cp-1" }]);
    expect(await candidateCardsRepo(db).candidatePrintingsForCandidateCards(["cc-1"])).toHaveLength(
      1,
    );
  });

  it("candidatePrintingsForCandidateCards returns [] for empty input", async () => {
    expect(
      await candidateCardsRepo(createMockDb([])).candidatePrintingsForCandidateCards([]),
    ).toEqual([]);
  });

  it("candidatePrintingsForDetail returns detail fields", async () => {
    const db = createMockDb([{ id: "cp-1" }]);
    expect(await candidateCardsRepo(db).candidatePrintingsForDetail(["cc-1"])).toHaveLength(1);
  });

  it("candidatePrintingsForDetail returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).candidatePrintingsForDetail([])).toEqual([]);
  });

  it("promoTypeSlugsByIds returns slugs", async () => {
    const db = createMockDb([{ id: "pt-1", slug: "promo" }]);
    expect(await candidateCardsRepo(db).promoTypeSlugsByIds(["pt-1"])).toHaveLength(1);
  });

  it("promoTypeSlugsByIds returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).promoTypeSlugsByIds([])).toEqual([]);
  });

  it("printingImagesForPrintings returns images", async () => {
    const db = createMockDb([{ id: "pi-1" }]);
    expect(await candidateCardsRepo(db).printingImagesForPrintings(["p-1"])).toHaveLength(1);
  });

  it("printingImagesForPrintings returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).printingImagesForPrintings([])).toEqual([]);
  });

  it("printingImagesForDetail returns detail fields", async () => {
    const db = createMockDb([{ id: "pi-1" }]);
    expect(await candidateCardsRepo(db).printingImagesForDetail(["p-1"])).toHaveLength(1);
  });

  it("printingImagesForDetail returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).printingImagesForDetail([])).toEqual([]);
  });

  it("setSlugsByIds returns slugs", async () => {
    const db = createMockDb([{ id: "s-1", slug: "OGS" }]);
    expect(await candidateCardsRepo(db).setSlugsByIds(["s-1"])).toHaveLength(1);
  });

  it("setSlugsByIds returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).setSlugsByIds([])).toEqual([]);
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

  it("candidateCardsByNormNameAndProvider returns cards", async () => {
    const db = createMockDb([CC]);
    expect(
      await candidateCardsRepo(db).candidateCardsByNormNameAndProvider("annie", "test"),
    ).toHaveLength(1);
  });

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

  it("candidatePrintingsForUnmatched returns printings", async () => {
    const db = createMockDb([{ id: "cp-1" }]);
    expect(await candidateCardsRepo(db).candidatePrintingsForUnmatched(["cc-1"])).toHaveLength(1);
  });

  it("candidatePrintingsForUnmatched returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).candidatePrintingsForUnmatched([])).toEqual(
      [],
    );
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
});
