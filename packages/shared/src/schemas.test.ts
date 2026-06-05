import { describe, expect, it } from "vitest";

import {
  bulkCreateListEntriesSchema,
  collectionEventsQuerySchema,
  collectionValueHistoryQuerySchema,
  addCopiesSchema,
  copiesQuerySchema,
  createCollectionSchema,
  createDeckSchema,
  createListEntrySchema,
  createListSchema,
  decksQuerySchema,
  disposeCopiesSchema,
  idAndItemIdParamSchema,
  idParamSchema,
  keyParamSchema,
  listIntentQuerySchema,
  moveCopiesSchema,
  updateCollectionSchema,
  updateDeckCardsSchema,
  updateDeckSchema,
  updateListEntrySchema,
  updateListSchema,
} from "./schemas";

// ---------------------------------------------------------------------------
// Collection tracking schemas
// ---------------------------------------------------------------------------

describe("createCollectionSchema", () => {
  it("accepts valid input", () => {
    expect(createCollectionSchema.safeParse({ name: "My Collection" }).success).toBe(true);
  });

  it("accepts optional fields", () => {
    const result = createCollectionSchema.safeParse({
      name: "My Collection",
      description: "A description",
      availableForDeckbuilding: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts null description", () => {
    expect(
      createCollectionSchema.safeParse({ name: "My Collection", description: null }).success,
    ).toBe(true);
  });

  it("rejects empty name", () => {
    expect(createCollectionSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects name over 200 chars", () => {
    expect(createCollectionSchema.safeParse({ name: "x".repeat(201) }).success).toBe(false);
  });

  it("rejects description over 1000 chars", () => {
    expect(
      createCollectionSchema.safeParse({ name: "ok", description: "x".repeat(1001) }).success,
    ).toBe(false);
  });
});

describe("updateCollectionSchema", () => {
  it("accepts partial update", () => {
    expect(updateCollectionSchema.safeParse({ name: "New Name" }).success).toBe(true);
  });

  it("accepts empty object", () => {
    expect(updateCollectionSchema.safeParse({}).success).toBe(true);
  });

  it("accepts sortOrder", () => {
    expect(updateCollectionSchema.safeParse({ sortOrder: 3 }).success).toBe(true);
  });

  it("rejects non-integer sortOrder", () => {
    expect(updateCollectionSchema.safeParse({ sortOrder: 1.5 }).success).toBe(false);
  });
});

describe("addCopiesSchema", () => {
  it("accepts valid copies", () => {
    const result = addCopiesSchema.safeParse({
      copies: [{ printingId: "550e8400-e29b-41d4-a716-446655440000" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts copies with optional collectionId", () => {
    const result = addCopiesSchema.safeParse({
      copies: [
        {
          printingId: "550e8400-e29b-41d4-a716-446655440000",
          collectionId: "550e8400-e29b-41d4-a716-446655440001",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty copies array", () => {
    expect(addCopiesSchema.safeParse({ copies: [] }).success).toBe(false);
  });

  it("rejects non-uuid printingId", () => {
    const result = addCopiesSchema.safeParse({
      copies: [{ printingId: "not-a-uuid" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 500 copies", () => {
    const copies = Array.from({ length: 501 }, (_, i) => ({
      printingId: `550e8400-e29b-41d4-a716-${String(i).padStart(12, "0")}`,
    }));
    expect(addCopiesSchema.safeParse({ copies }).success).toBe(false);
  });
});

describe("moveCopiesSchema", () => {
  it("accepts valid move", () => {
    const result = moveCopiesSchema.safeParse({
      copyIds: ["550e8400-e29b-41d4-a716-446655440000"],
      toCollectionId: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty copyIds", () => {
    expect(
      moveCopiesSchema.safeParse({
        copyIds: [],
        toCollectionId: "550e8400-e29b-41d4-a716-446655440001",
      }).success,
    ).toBe(false);
  });

  it("rejects non-uuid toCollectionId", () => {
    expect(
      moveCopiesSchema.safeParse({ copyIds: ["abc"], toCollectionId: "not-uuid" }).success,
    ).toBe(false);
  });
});

describe("disposeCopiesSchema", () => {
  it("accepts valid disposal", () => {
    const result = disposeCopiesSchema.safeParse({
      copyIds: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty copyIds", () => {
    expect(disposeCopiesSchema.safeParse({ copyIds: [] }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Deck schemas
// ---------------------------------------------------------------------------

describe("createDeckSchema", () => {
  it("accepts valid deck", () => {
    expect(createDeckSchema.safeParse({ name: "My Deck", format: "constructed" }).success).toBe(
      true,
    );
  });

  it("accepts all optional fields", () => {
    const result = createDeckSchema.safeParse({
      name: "My Deck",
      description: "A great deck",
      format: "freeform",
      isWanted: true,
      isPublic: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts any string format (FK validates at DB level)", () => {
    expect(createDeckSchema.safeParse({ name: "D", format: "legacy" }).success).toBe(true);
  });
});

describe("updateDeckSchema", () => {
  it("accepts partial update", () => {
    expect(updateDeckSchema.safeParse({ name: "New Name" }).success).toBe(true);
  });

  it("accepts null description", () => {
    expect(updateDeckSchema.safeParse({ description: null }).success).toBe(true);
  });
});

describe("updateDeckCardsSchema", () => {
  it("accepts valid cards", () => {
    const result = updateDeckCardsSchema.safeParse({
      cards: [{ cardId: "c0000000-0001-4000-a000-000000000001", zone: "main", quantity: 4 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts sideboard zone", () => {
    const result = updateDeckCardsSchema.safeParse({
      cards: [{ cardId: "c0000000-0001-4000-a000-000000000001", zone: "sideboard", quantity: 2 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-positive quantity", () => {
    expect(
      updateDeckCardsSchema.safeParse({
        cards: [{ cardId: "c0000000-0001-4000-a000-000000000001", zone: "main", quantity: 0 }],
      }).success,
    ).toBe(false);
  });

  it("accepts any string zone (FK validates at DB level)", () => {
    expect(
      updateDeckCardsSchema.safeParse({
        cards: [{ cardId: "c0000000-0001-4000-a000-000000000001", zone: "exile", quantity: 1 }],
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// List schemas (unified wish / trade / organize)
// ---------------------------------------------------------------------------

const CARD_ID = "c0000000-0001-4000-a000-000000000001";
const PRINTING_ID = "d0000000-0001-4000-a000-000000000001";
const COPY_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("createListSchema", () => {
  it("accepts wish + card", () => {
    expect(
      createListSchema.safeParse({ name: "Wants", intent: "wish", kind: "card" }).success,
    ).toBe(true);
  });

  it("accepts wish + printing", () => {
    expect(
      createListSchema.safeParse({ name: "Foils", intent: "wish", kind: "printing" }).success,
    ).toBe(true);
  });

  it("accepts trade + copy", () => {
    expect(
      createListSchema.safeParse({ name: "For trade", intent: "trade", kind: "copy" }).success,
    ).toBe(true);
  });

  it("accepts organize + each kind", () => {
    for (const kind of ["card", "printing", "copy"] as const) {
      expect(
        createListSchema.safeParse({ name: "Demacia", intent: "organize", kind }).success,
      ).toBe(true);
    }
  });

  it("rejects wish + copy (disallowed combo)", () => {
    expect(createListSchema.safeParse({ name: "Bad", intent: "wish", kind: "copy" }).success).toBe(
      false,
    );
  });

  it("rejects trade + card (disallowed combo)", () => {
    expect(createListSchema.safeParse({ name: "Bad", intent: "trade", kind: "card" }).success).toBe(
      false,
    );
  });

  it("rejects trade + printing (disallowed combo)", () => {
    expect(
      createListSchema.safeParse({ name: "Bad", intent: "trade", kind: "printing" }).success,
    ).toBe(false);
  });

  it("rejects an unknown intent", () => {
    expect(createListSchema.safeParse({ name: "x", intent: "barter", kind: "card" }).success).toBe(
      false,
    );
  });

  it("rejects an unknown kind", () => {
    expect(
      createListSchema.safeParse({ name: "x", intent: "wish", kind: "physical" }).success,
    ).toBe(false);
  });

  it("rejects a missing kind", () => {
    expect(createListSchema.safeParse({ name: "x", intent: "wish" }).success).toBe(false);
  });

  it("rejects a missing intent", () => {
    expect(createListSchema.safeParse({ name: "x", kind: "card" }).success).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(createListSchema.safeParse({ name: "", intent: "wish", kind: "card" }).success).toBe(
      false,
    );
  });

  it("accepts trade preferences on a wish list", () => {
    const result = createListSchema.safeParse({
      name: "Wants",
      intent: "wish",
      kind: "card",
      tradeDefaults: { pricePref: "cm_lowest", priceAbsoluteCents: null, tradeType: "cards" },
      currency: "EUR",
    });
    expect(result.success).toBe(true);
  });

  it("requires priceAbsoluteCents iff pricePref is 'absolute'", () => {
    expect(
      createListSchema.safeParse({
        name: "x",
        intent: "trade",
        kind: "copy",
        tradeDefaults: { pricePref: "absolute", priceAbsoluteCents: null, tradeType: null },
      }).success,
    ).toBe(false);
    expect(
      createListSchema.safeParse({
        name: "x",
        intent: "trade",
        kind: "copy",
        tradeDefaults: { pricePref: "cm_lowest", priceAbsoluteCents: 100, tradeType: null },
      }).success,
    ).toBe(false);
  });

  it("rejects trade prefs on organize lists", () => {
    expect(
      createListSchema.safeParse({
        name: "Tags",
        intent: "organize",
        kind: "card",
        tradeDefaults: { pricePref: "cm_lowest", priceAbsoluteCents: null, tradeType: null },
      }).success,
    ).toBe(false);
    expect(
      createListSchema.safeParse({
        name: "Tags",
        intent: "organize",
        kind: "card",
        currency: "EUR",
      }).success,
    ).toBe(false);
  });
});

describe("updateListSchema", () => {
  it("accepts a partial update", () => {
    expect(updateListSchema.safeParse({ name: "Renamed" }).success).toBe(true);
  });

  it("accepts an empty object", () => {
    expect(updateListSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a tradeDefaults patch", () => {
    expect(
      updateListSchema.safeParse({
        tradeDefaults: { pricePref: "cm_lowest", priceAbsoluteCents: null, tradeType: "cards" },
      }).success,
    ).toBe(true);
  });
});

describe("createListEntrySchema (three-way XOR)", () => {
  it("accepts an entry with cardId only", () => {
    expect(createListEntrySchema.safeParse({ cardId: CARD_ID }).success).toBe(true);
  });

  it("accepts an entry with printingId only", () => {
    expect(createListEntrySchema.safeParse({ printingId: PRINTING_ID }).success).toBe(true);
  });

  it("accepts an entry with copyId only", () => {
    expect(createListEntrySchema.safeParse({ copyId: COPY_ID }).success).toBe(true);
  });

  it("rejects an entry with no target", () => {
    expect(createListEntrySchema.safeParse({}).success).toBe(false);
  });

  it("rejects an entry with two targets", () => {
    expect(
      createListEntrySchema.safeParse({ cardId: CARD_ID, printingId: PRINTING_ID }).success,
    ).toBe(false);
  });

  it("rejects an entry with all three targets", () => {
    expect(
      createListEntrySchema.safeParse({
        cardId: CARD_ID,
        printingId: PRINTING_ID,
        copyId: COPY_ID,
      }).success,
    ).toBe(false);
  });

  it("defaults quantity to 1", () => {
    const result = createListEntrySchema.parse({ cardId: CARD_ID });
    expect(result.quantity).toBe(1);
  });

  it("rejects non-positive quantity", () => {
    expect(createListEntrySchema.safeParse({ cardId: CARD_ID, quantity: 0 }).success).toBe(false);
  });
});

describe("updateListEntrySchema", () => {
  it("accepts a positive quantity", () => {
    expect(updateListEntrySchema.safeParse({ quantity: 3 }).success).toBe(true);
  });

  it("rejects a negative quantity", () => {
    expect(updateListEntrySchema.safeParse({ quantity: -1 }).success).toBe(false);
  });
});

describe("bulkCreateListEntriesSchema", () => {
  it("accepts a mixed batch", () => {
    const result = bulkCreateListEntriesSchema.safeParse({
      entries: [{ cardId: CARD_ID }, { printingId: PRINTING_ID }, { copyId: COPY_ID }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an entry with no target inside the batch", () => {
    expect(
      bulkCreateListEntriesSchema.safeParse({ entries: [{ cardId: CARD_ID }, {}] }).success,
    ).toBe(false);
  });

  it("rejects an empty batch", () => {
    expect(bulkCreateListEntriesSchema.safeParse({ entries: [] }).success).toBe(false);
  });

  it("rejects a batch over 500", () => {
    const entries = Array.from({ length: 501 }, () => ({ cardId: CARD_ID }));
    expect(bulkCreateListEntriesSchema.safeParse({ entries }).success).toBe(false);
  });
});

describe("listIntentQuerySchema", () => {
  it("accepts an empty query", () => {
    expect(listIntentQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts a known intent", () => {
    expect(listIntentQuerySchema.safeParse({ intent: "trade" }).success).toBe(true);
  });

  it("rejects an unknown intent", () => {
    expect(listIntentQuerySchema.safeParse({ intent: "sell" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Param & query schemas
// ---------------------------------------------------------------------------

describe("idParamSchema", () => {
  it("accepts a valid UUID", () => {
    expect(idParamSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" }).success).toBe(
      true,
    );
  });

  it("rejects non-uuid string", () => {
    expect(idParamSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });
});

describe("idAndItemIdParamSchema", () => {
  it("accepts two valid UUIDs", () => {
    expect(
      idAndItemIdParamSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        itemId: "550e8400-e29b-41d4-a716-446655440001",
      }).success,
    ).toBe(true);
  });

  it("rejects missing itemId", () => {
    expect(
      idAndItemIdParamSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" }).success,
    ).toBe(false);
  });
});

describe("keyParamSchema", () => {
  it("accepts a non-empty key", () => {
    expect(keyParamSchema.safeParse({ key: "deck-builder" }).success).toBe(true);
  });

  it("rejects empty key", () => {
    expect(keyParamSchema.safeParse({ key: "" }).success).toBe(false);
  });
});

describe("collectionEventsQuerySchema", () => {
  it("accepts empty query", () => {
    expect(collectionEventsQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts cursor and limit", () => {
    expect(
      collectionEventsQuerySchema.safeParse({ cursor: "2025-01-01T00:00:00Z", limit: 25 }).success,
    ).toBe(true);
  });

  it("coerces string limit to number", () => {
    const result = collectionEventsQuerySchema.parse({ limit: "50" });
    expect(result.limit).toBe(50);
  });

  it("rejects limit over 100", () => {
    expect(collectionEventsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it("rejects limit under 1", () => {
    expect(collectionEventsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe("copiesQuerySchema", () => {
  it("accepts empty query", () => {
    expect(copiesQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts cursor and limit", () => {
    expect(
      copiesQuerySchema.safeParse({ cursor: "2025-01-01T00:00:00Z", limit: 100 }).success,
    ).toBe(true);
  });

  it("coerces string limit to number", () => {
    const result = copiesQuerySchema.parse({ limit: "200" });
    expect(result.limit).toBe(200);
  });

  it("accepts limit at the 1000 cap", () => {
    expect(copiesQuerySchema.safeParse({ limit: 1000 }).success).toBe(true);
  });

  // Regression (E1/PAG-1): the schema cap must match the server-side clamp
  // (COPIES_PAGE_MAX = 1000); it previously advertised an unreachable 10000.
  it("rejects limit over the 1000 cap", () => {
    expect(copiesQuerySchema.safeParse({ limit: 1001 }).success).toBe(false);
    expect(copiesQuerySchema.safeParse({ limit: 10_000 }).success).toBe(false);
  });

  it("rejects limit under 1", () => {
    expect(copiesQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe("decksQuerySchema", () => {
  it("accepts empty query", () => {
    expect(decksQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts wanted param", () => {
    expect(decksQuerySchema.safeParse({ wanted: "true" }).success).toBe(true);
  });
});

describe("collectionValueHistoryQuerySchema", () => {
  const uuid1 = "a0000000-0001-4000-a000-000000000001";
  const uuid2 = "a0000000-0001-4000-a000-000000000002";

  it("accepts a comma-separated list of valid UUIDs", () => {
    expect(
      collectionValueHistoryQuerySchema.safeParse({ collectionIds: `${uuid1},${uuid2}` }).success,
    ).toBe(true);
  });

  // Regression (F1): a non-UUID element used to reach the repo's `::uuid` cast
  // and surface as a 500. It must now fail validation at the edge (→ 400).
  it("rejects a CSV containing a non-UUID element", () => {
    expect(
      collectionValueHistoryQuerySchema.safeParse({ collectionIds: `${uuid1},not-a-uuid` }).success,
    ).toBe(false);
  });

  it("rejects more than 200 collection ids", () => {
    const many = Array.from({ length: 201 }, () => uuid1).join(",");
    expect(collectionValueHistoryQuerySchema.safeParse({ collectionIds: many }).success).toBe(
      false,
    );
  });

  it("bounds slug-filter CSVs by length", () => {
    const huge = "x".repeat(2001);
    expect(collectionValueHistoryQuerySchema.safeParse({ sets: huge }).success).toBe(false);
  });

  it("accepts an empty query (all filters optional)", () => {
    expect(collectionValueHistoryQuerySchema.safeParse({}).success).toBe(true);
  });
});
