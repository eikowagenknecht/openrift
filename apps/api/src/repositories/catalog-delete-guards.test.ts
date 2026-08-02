import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { catalogDeleteGuardsRepo } from "./catalog-delete-guards.js";

const CARD_BLOCKERS = {
  copies: 2,
  collectionEvents: 0,
  deckCards: 1,
  listEntries: 0,
  loans: 0,
  cardTrades: 0,
  marketplaceProductVariants: 0,
  productPrintings: 0,
};

const PRINTING_BLOCKERS = {
  copies: 0,
  collectionEvents: 0,
  listEntries: 3,
  loans: 0,
  cardTrades: 0,
  marketplaceProductVariants: 0,
  productPrintings: 0,
};

describe("catalogDeleteGuardsRepo", () => {
  it("countForCard returns the per-source blocker counts", async () => {
    const db = createMockDb([CARD_BLOCKERS]);
    expect(await catalogDeleteGuardsRepo(db).countForCard("c-1")).toEqual(CARD_BLOCKERS);
  });

  it("countForPrinting returns the per-source blocker counts", async () => {
    const db = createMockDb([PRINTING_BLOCKERS]);
    expect(await catalogDeleteGuardsRepo(db).countForPrinting("p-1")).toEqual(PRINTING_BLOCKERS);
  });
});
