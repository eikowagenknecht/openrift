import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { ingestRepo } from "./ingest.js";

describe("ingestRepo", () => {
  it("allCandidateCardsForProvider returns cards", async () => {
    const db = createMockDb([{ id: "cc-1", provider: "test" }]);
    expect(await ingestRepo(db).allCandidateCardsForProvider("test")).toHaveLength(1);
  });

  it("allCardNorms returns id/normName pairs", async () => {
    const db = createMockDb([{ id: "c-1", normName: "annie" }]);
    expect(await ingestRepo(db).allCardNorms()).toHaveLength(1);
  });

  it("allCardNameAliases returns aliases", async () => {
    const db = createMockDb([{ normName: "annie", cardId: "c-1" }]);
    expect(await ingestRepo(db).allCardNameAliases()).toHaveLength(1);
  });

  it("allPrintingKeys returns id/shortCode/finish/markerSlugs/language", async () => {
    const db = createMockDb([
      { id: "p-1", shortCode: "OGS-001", finish: "normal", markerSlugs: [], language: "EN" },
    ]);
    expect(await ingestRepo(db).allPrintingKeys()).toHaveLength(1);
  });

  it("candidatePrintingsByCandidateCardIds returns printings", async () => {
    const db = createMockDb([{ id: "cp-1" }]);
    expect(await ingestRepo(db).candidatePrintingsByCandidateCardIds(["cc-1"])).toHaveLength(1);
  });

  it("ignoredCandidateCards returns external IDs", async () => {
    const db = createMockDb([{ externalId: "ext-1" }]);
    expect(await ingestRepo(db).ignoredCandidateCards("test")).toHaveLength(1);
  });

  it("allPrintingLinkOverrides returns overrides", async () => {
    const db = createMockDb([{ externalId: "ext-1", finish: "normal", printingId: "p-1" }]);
    expect(await ingestRepo(db).allPrintingLinkOverrides()).toHaveLength(1);
  });

  it("ignoredCandidatePrintings returns ignored printings", async () => {
    const db = createMockDb([{ externalId: "ext-1", finish: null }]);
    expect(await ingestRepo(db).ignoredCandidatePrintings("test")).toHaveLength(1);
  });

  it("updateCandidateCard updates a card", async () => {
    const db = createMockDb([]);
    await expect(
      ingestRepo(db).updateCandidateCard("cc-1", { name: "Updated" }),
    ).resolves.toBeUndefined();
  });

  it("insertCandidateCard returns inserted ID", async () => {
    const db = createMockDb([{ id: "cc-new" }]);
    expect(await ingestRepo(db).insertCandidateCard({ name: "New" })).toBe("cc-new");
  });

  it("updateCandidatePrinting updates a printing", async () => {
    const db = createMockDb([]);
    await expect(
      ingestRepo(db).updateCandidatePrinting("cp-1", { rarity: "Rare" }),
    ).resolves.toBeUndefined();
  });

  it("insertCandidatePrinting inserts a printing", async () => {
    const db = createMockDb([]);
    await expect(
      ingestRepo(db).insertCandidatePrinting({ shortCode: "OGS-001" }),
    ).resolves.toBeUndefined();
  });

  it("deleteCandidateCards deletes cards", async () => {
    const db = createMockDb([]);
    await expect(ingestRepo(db).deleteCandidateCards(["cc-1"])).resolves.toBeUndefined();
  });

  it("deleteCandidateCards is no-op for empty array", async () => {
    const db = createMockDb([]);
    await expect(ingestRepo(db).deleteCandidateCards([])).resolves.toBeUndefined();
  });

  it("deleteCandidatePrintings deletes printings", async () => {
    const db = createMockDb([]);
    await expect(ingestRepo(db).deleteCandidatePrintings(["cp-1"])).resolves.toBeUndefined();
  });

  it("deleteCandidatePrintings is no-op for empty array", async () => {
    const db = createMockDb([]);
    await expect(ingestRepo(db).deleteCandidatePrintings([])).resolves.toBeUndefined();
  });
});
