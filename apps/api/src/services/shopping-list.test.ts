/* oxlint-disable
   no-empty-function
   -- test file: mocks require empty fns */
import { describe, expect, it } from "vitest";

import type { Repos } from "../deps.js";
import { buildShoppingList } from "./shopping-list.js";

// ---------------------------------------------------------------------------
// Helper to build mock repos with canned query results
// ---------------------------------------------------------------------------

function createMockRepos(options: {
  ownedRows?: { cardId: string; printingId: string; count: number }[];
  deckCardRows?: { deckId: string; deckName: string; cardId: string; quantity: number }[];
  wishItemRows?: {
    wishListId: string;
    wishListName: string;
    cardId: string | null;
    printingId: string | null;
    quantityDesired: number;
  }[];
}): Repos {
  return {
    copies: {
      countByCardAndPrintingForDeckbuilding: () => Promise.resolve(options.ownedRows ?? []),
    },
    decks: {
      wantedCardRequirements: () => Promise.resolve(options.deckCardRows ?? []),
    },
    wishLists: {
      allItemsForUser: () => Promise.resolve(options.wishItemRows ?? []),
    },
  } as unknown as Repos;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildShoppingList", () => {
  it("returns empty list when no demands exist", async () => {
    const repos = createMockRepos({});
    const result = await buildShoppingList(repos, "user-1");
    expect(result).toEqual([]);
  });

  it("aggregates demand from decks and calculates shortfall", async () => {
    const repos = createMockRepos({
      ownedRows: [{ cardId: "card-1", printingId: "print-1", count: 2 }],
      deckCardRows: [{ deckId: "deck-1", deckName: "Deck A", cardId: "card-1", quantity: 4 }],
    });

    const result = await buildShoppingList(repos, "user-1");
    expect(result).toHaveLength(1);
    expect(result[0].cardId).toBe("card-1");
    expect(result[0].totalDemand).toBe(4);
    expect(result[0].owned).toBe(2);
    expect(result[0].stillNeeded).toBe(2);
    expect(result[0].sources).toHaveLength(1);
    expect(result[0].sources[0].source).toBe("deck");
  });

  it("aggregates demand from wish lists by card", async () => {
    const repos = createMockRepos({
      wishItemRows: [
        {
          wishListId: "wl-1",
          wishListName: "Wish A",
          cardId: "card-1",
          printingId: null,
          quantityDesired: 3,
        },
      ],
    });

    const result = await buildShoppingList(repos, "user-1");
    expect(result).toHaveLength(1);
    expect(result[0].cardId).toBe("card-1");
    expect(result[0].totalDemand).toBe(3);
    expect(result[0].stillNeeded).toBe(3);
  });

  it("aggregates demand from wish lists by printing", async () => {
    const repos = createMockRepos({
      ownedRows: [{ cardId: "card-1", printingId: "print-1", count: 1 }],
      wishItemRows: [
        {
          wishListId: "wl-1",
          wishListName: "Wish A",
          cardId: null,
          printingId: "print-1",
          quantityDesired: 3,
        },
      ],
    });

    const result = await buildShoppingList(repos, "user-1");
    // Printing-level demand only (cardId is null so no card-level aggregation)
    const printingItem = result.find((i) => i.printingId === "print-1");
    expect(printingItem).toBeDefined();
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by toBeDefined above
    expect(printingItem!.totalDemand).toBe(3);
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by toBeDefined above
    expect(printingItem!.owned).toBe(1);
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by toBeDefined above
    expect(printingItem!.stillNeeded).toBe(2);
  });

  it("combines deck and wish list demands for the same card", async () => {
    const repos = createMockRepos({
      ownedRows: [{ cardId: "card-1", printingId: "print-1", count: 1 }],
      deckCardRows: [{ deckId: "deck-1", deckName: "Deck A", cardId: "card-1", quantity: 2 }],
      wishItemRows: [
        {
          wishListId: "wl-1",
          wishListName: "Wish A",
          cardId: "card-1",
          printingId: null,
          quantityDesired: 3,
        },
      ],
    });

    const result = await buildShoppingList(repos, "user-1");
    const cardItem = result.find((i) => i.cardId === "card-1");
    expect(cardItem).toBeDefined();
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by toBeDefined above
    expect(cardItem!.totalDemand).toBe(5); // 2 + 3
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by toBeDefined above
    expect(cardItem!.owned).toBe(1);
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by toBeDefined above
    expect(cardItem!.stillNeeded).toBe(4);
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by toBeDefined above
    expect(cardItem!.sources).toHaveLength(2);
  });

  it("clamps stillNeeded to zero when owned exceeds demand", async () => {
    const repos = createMockRepos({
      ownedRows: [{ cardId: "card-1", printingId: "print-1", count: 10 }],
      deckCardRows: [{ deckId: "deck-1", deckName: "Deck A", cardId: "card-1", quantity: 2 }],
    });

    const result = await buildShoppingList(repos, "user-1");
    expect(result[0].stillNeeded).toBe(0);
  });

  it("sorts by stillNeeded descending", async () => {
    const repos = createMockRepos({
      deckCardRows: [
        { deckId: "deck-1", deckName: "Deck A", cardId: "card-1", quantity: 1 },
        { deckId: "deck-1", deckName: "Deck A", cardId: "card-2", quantity: 5 },
      ],
    });

    const result = await buildShoppingList(repos, "user-1");
    expect(result[0].cardId).toBe("card-2");
    expect(result[1].cardId).toBe("card-1");
    expect(result[0].stillNeeded).toBeGreaterThanOrEqual(result[1].stillNeeded);
  });
});
