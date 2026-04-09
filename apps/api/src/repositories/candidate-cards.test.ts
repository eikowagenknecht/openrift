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

  // ── Detail sub-queries ─────────────────────────────────────────────────────

  it("cardBySlug returns a card", async () => {
    const db = createMockDb([CARD]);
    expect(await candidateCardsRepo(db).cardBySlug("OGS-001")).toEqual(CARD);
  });

  it("cardForDetailById returns card details", async () => {
    const db = createMockDb([{ id: "c-1", slug: "OGS-001", name: "Annie" }]);
    expect(await candidateCardsRepo(db).cardForDetailById("c-1")).toBeDefined();
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

  it("promoTypeSlugsByIds returns slugs", async () => {
    const db = createMockDb([{ id: "pt-1", slug: "promo" }]);
    expect(await candidateCardsRepo(db).promoTypeSlugsByIds(["pt-1"])).toHaveLength(1);
  });

  it("promoTypeSlugsByIds returns [] for empty input", async () => {
    expect(await candidateCardsRepo(createMockDb([])).promoTypeSlugsByIds([])).toEqual([]);
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
});
